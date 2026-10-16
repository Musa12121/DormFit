import { generateLayouts } from '../src/domain/planner.ts';
import { isProject } from '../src/domain/storage.ts';
import { checkAiPlan, isPreferenceReview, targetOptions } from '../src/domain/ai.ts';
import { doorZones, entranceZones, getOpenings, openingSegment } from '../src/domain/openings.ts';
import { WALKWAY_WIDTH } from '../src/domain/access.ts';
import { rotationOf } from '../src/domain/rotation.ts';
import { repairAiPlan } from '../src/domain/repairAiPlan.ts';
import { planSchema, planInstructions } from './planPrompt.mjs';
import { responseInstructions } from './language.mjs';
import { preferenceSchema, preferenceInstructions } from './preferencePrompt.mjs';
import { ApiError, geminiError, planValidationError } from './geminiErrors.mjs';

export { ApiError } from './geminiErrors.mjs';

export async function getLayoutAdvice(payload, config, fetchImpl = fetch, signal) {
  if (
    !isProject(payload?.project) ||
    payload.project.furniture.length === 0 ||
    typeof payload.prompt !== 'string' ||
    payload.prompt.length > 600 ||
    (payload.review !== undefined && !isPreferenceReview(payload.review, payload.project))
  ) {
    throw new ApiError(400, 'Check the room details and your preferences.');
  }
  const apiKey = config.apiKey?.trim();
  if (!apiKey) {
    throw new ApiError(503, 'No Gemini key has been added. Regular layout suggestions are available.');
  }

  const project = payload.project;
  // One example helps the model with crowded rooms; it is free to change every coordinate.
  const example = generateLayouts(project).reduce((a, b) => a.issueCount <= b.issueCount ? a : b);
  const positions = (items) => items.map(item => ({ id: item.id, x: item.x, y: item.y, rotation: rotationOf(item) }));
  const input = {
    units: 'centimetres',
    room: { ...project.room, openings: getOpenings(project.room) },
    openingSegments: getOpenings(project.room).map((opening) => ({ id: opening.id, ...openingSegment(project.room, opening) })),
    doorClearance: doorZones(project.room),
    entranceClearance: entranceZones(project.room),
    walkingRouteWidth: WALKWAY_WIDTH,
    allowedTargetIds: targetOptions(project).map((target) => target.id),
    ...(payload.review ? { confirmedPreferences: payload.review } : {}),
    preference: payload.prompt.trim() || 'Create a practical layout for everyday use.',
    furniture: project.furniture.map(({ id, kind, width, depth }) => ({ id, kind, width, depth })),
    localExample: { issueCount: example.issueCount, positions: positions(example.project.furniture) },
  };
  const contents = [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }];
  const schema = planSchema(project);

  // Give the model one chance to fix specific geometry or placement errors.
  let problems = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const value = await callGemini(config, apiKey, contents, schema, fetchImpl, signal, responseInstructions(planInstructions, payload.language));
    const checked = checkAiPlan(value, project, payload.prompt, payload.review);
    if (checked.ok) return checked.plan;
    problems = checked.problems;
    const repaired = repairAiPlan(value, project, payload.prompt, payload.review);
    if (repaired) return repaired;
    contents.push(
      { role: 'model', parts: [{ text: JSON.stringify(value) }] },
      { role: 'user', parts: [{ text: JSON.stringify({
        instruction: 'Fix these validation problems. Return a complete new JSON plan; preserve the confirmed preferences when supplied, otherwise preserve the original note requirements.',
        validationProblems: checked.problems.slice(0, 12),
      }) }] },
    );
  }
  throw planValidationError(problems);
}

export async function getPreferenceReview(payload, config, fetchImpl = fetch, signal) {
  if (!isProject(payload?.project) || !payload.project.furniture.length || typeof payload.prompt !== 'string' || !payload.prompt.trim() || payload.prompt.length > 600) {
    throw new ApiError(400, 'Choose furniture and enter a note before reviewing preferences.');
  }
  const apiKey = config.apiKey?.trim();
  if (!apiKey) throw new ApiError(503, 'Add a Gemini key to interpret your note, or add conditions manually.');
  const project = payload.project;
  const input = {
    note: payload.prompt,
    room: { ...project.room, openings: getOpenings(project.room) },
    furniture: project.furniture.map(({ id, kind, width, depth }) => ({ id, kind, width, depth })),
    targets: targetOptions(project),
  };
  const value = await callGemini(config, apiKey, [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }], preferenceSchema(project), fetchImpl, signal, responseInstructions(preferenceInstructions, payload.language));
  if (!isPreferenceReview(value, project) || (!value.requirements.length && !value.unmetRequests.length)) {
    throw new ApiError(502, 'AI could not interpret the note. Try a simpler note or add conditions manually.', 'GEMINI_RESPONSE_INVALID');
  }
  return { requirements: value.requirements, unmetRequests: value.unmetRequests };
}

async function callGemini(config, apiKey, contents, schema, fetchImpl, signal, instructions = planInstructions) {
  async function send(jsonOnly = false) {
    try {
      return await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(25_000)])
          : AbortSignal.timeout(25_000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: jsonOnly
            ? `${instructions}\nReturn only a JSON object with this exact structure: ${JSON.stringify(schema)}`
            : instructions }] },
          contents,
          generationConfig: {
            ...(jsonOnly ? { responseMimeType: 'application/json' }
              : { responseFormat: { text: { mimeType: 'application/json', schema } } }),
            maxOutputTokens: 8192,
          },
        }),
      },
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new ApiError(504, 'Gemini took too long to respond.', 'GEMINI_TIMEOUT');
      }
      throw new ApiError(502, 'Could not connect to Gemini. Check your internet connection.', 'GEMINI_NETWORK');
    }
  }
  let response = await send();
  if (!response.ok) {
    const error = await geminiError(response);
    // A rejected output format gets one compatibility attempt. Other failures do not retry.
    if (error.code !== 'GEMINI_BAD_REQUEST' || !error.outputFormatRejected) throw error;
    response = await send(true);
  }
  if (!response.ok) throw await geminiError(response);

  try {
    const body = await response.json();
    const candidate = body.candidates?.[0];
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new ApiError(502, 'The Gemini response was cut short by its output limit.', 'GEMINI_OUTPUT_LIMIT');
    }
    if (body.promptFeedback?.blockReason || ['SAFETY', 'RECITATION'].includes(candidate?.finishReason)) {
      throw new ApiError(502, 'Gemini did not return a layout. Try a simpler note.', 'GEMINI_RESPONSE_BLOCKED');
    }
    if (candidate?.finishReason !== 'STOP') throw new Error('Incomplete response');
    const text = candidate.content.parts
      .filter((part) => !part.thought && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'Gemini did not return a complete, readable JSON layout.', 'GEMINI_RESPONSE_INVALID');
  }
}
