import { isProject } from '../src/domain/storage.ts';
import { checkAiPlan, checkAiPlanBestEffort, isPreferenceReview, readAiPlan, targetOptions } from '../src/domain/ai.ts';
import { analyze, footprint } from '../src/domain/planner.ts';
import { orientation, rotationOf } from '../src/domain/rotation.ts';
import { doorZones, entranceZones, furnitureEntranceZones, getOpenings, openingSegment } from '../src/domain/openings.ts';
import { WALKWAY_WIDTH } from '../src/domain/access.ts';
import { MIN_FURNITURE_GAP, PREFERRED_FURNITURE_GAP, TV_DINING_CLEARANCE } from '../src/domain/spacing.ts';
import { repairAiPlan } from '../src/domain/repairAiPlan.ts';
import { planSchema, planInstructions } from './planPrompt.mjs';
import { responseInstructions } from './language.mjs';
import { preferenceSchema, preferenceInstructions } from './preferencePrompt.mjs';
import { ApiError, geminiError, planValidationError } from './geminiErrors.mjs';
import { modelRequest } from './modelFallback.mjs';
import { AI_LAYOUT_TIMEOUT_MS, AI_REVIEW_TIMEOUT_MS } from '../src/domain/aiTiming.ts';
import { SOFA_LEGROOM } from '../src/domain/usability.ts';

export { ApiError } from './geminiErrors.mjs';

export async function getLayoutAdvice(payload, config, fetchImpl = fetch, signal) {
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(AI_LAYOUT_TIMEOUT_MS)]) : AbortSignal.timeout(AI_LAYOUT_TIMEOUT_MS);
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
  const input = {
    units: 'centimetres',
    room: { ...project.room, openings: getOpenings(project.room) },
    openingSegments: getOpenings(project.room).map((opening) => ({ id: opening.id, ...openingSegment(project.room, opening) })),
    doorClearance: doorZones(project.room),
    entranceClearance: entranceZones(project.room),
    floorLampEntranceClearance: furnitureEntranceZones(project.room, { kind: 'floor-lamp' }),
    televisionEntranceClearance: furnitureEntranceZones(project.room, { kind: 'tv-stand' }),
    walkingRouteWidth: WALKWAY_WIDTH,
    minimumFurnitureGap: MIN_FURNITURE_GAP,
    preferredFurnitureGap: PREFERRED_FURNITURE_GAP,
    sofaFrontLegroom: SOFA_LEGROOM,
    minimumTvDiningGap: TV_DINING_CLEARANCE,
    allowedTargetIds: targetOptions(project).map((target) => target.id),
    ...(payload.review ? { confirmedPreferences: payload.review } : {}),
    preference: payload.prompt.trim() || 'Create a practical layout for everyday use.',
    furniture: project.furniture.map(({ id, kind, width, depth }) => ({ id, kind, width, depth,
      ...(kind === 'television' ? { wallMounted: true } : {}) })),
  };
  const contents = [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }];
  const schema = planSchema(project);

  // Give the model one chance to fix specific geometry or placement errors.
  let problems = [];
  let lastValue;
  for (let attempt = 0; attempt < 2; attempt++) {
    let value;
    try {
      value = await callGemini(config, apiKey, contents, schema, fetchImpl, signal, responseInstructions(planInstructions, payload.language));
    } catch (error) {
      if (signal.aborted) throw error;
      const bestEffort = lastValue === undefined
        ? null
        : checkAiPlanBestEffort(lastValue, project, payload.prompt, payload.review);
      if (bestEffort?.ok) return bestEffort.plan;
      throw error;
    }
    lastValue = value;
    const checked = checkAiPlan(value, project, payload.prompt, payload.review);
    if (checked.ok && !checked.plan.omittedChairIds?.length && !project.furniture.some(item => item.kind === 'rug')) return checked.plan;
    problems = checked.ok ? [] : checked.problems;
    const repaired = repairAiPlan(value, project, payload.prompt, payload.review);
    if (repaired) return repaired;
    if (checked.ok) return checked.plan;
    contents.push(
      { role: 'model', parts: [{ text: JSON.stringify(value) }] },
      { role: 'user', parts: [{ text: JSON.stringify({
        instruction: 'Fix these validation problems. Solve the TV and all sofas as one viewing group and the dining table and its chairs as another group. Reposition the groups together when needed; do not fix only individual overlaps. Omit chairs that cannot fit safely and report their IDs. Return a complete new JSON plan; preserve the confirmed preferences when supplied, otherwise preserve the original note requirements.',
        validationProblems: problems.slice(0, 12),
        ...placementFeedback(value, project, payload.prompt, payload.review),
      }) }] },
    );
  }
  const bestEffort = checkAiPlanBestEffort(lastValue, project, payload.prompt, payload.review);
  if (bestEffort.ok) return bestEffort.plan;
  throw planValidationError(problems);
}

function placementFeedback(value, project, prompt, review) {
  const parsed = readAiPlan(value, project, prompt, review);
  if (!parsed.ok) return {};
  const proposed = new Map(parsed.plan.positions.map(position => [position.id, position]));
  const furniture = project.furniture.filter(item => proposed.has(item.id)).map(item => {
    const position = proposed.get(item.id);
    return { ...item, ...position, ...orientation(rotationOf(position)) };
  });
  const issues = analyze({ ...project, furniture }).issues;
  // Include each failing category, rather than spending all feedback on many
  // copies of the same chair-overlap problem. Messages come from our validator.
  const categories = [...new Set(issues.map(issue => issue.type))];
  const details = categories.map(type => issues.find(issue => issue.type === type)).slice(0, 10);
  return { placementDetails: details.map(issue => ({ type: issue.type, ids: issue.ids, message: issue.text })),
    actualFootprints: furniture.map(item => ({ id: item.id, ...footprint(item), rotation: rotationOf(item) })) };
}

export async function getPreferenceReview(payload, config, fetchImpl = fetch, signal) {
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(AI_REVIEW_TIMEOUT_MS)]) : AbortSignal.timeout(AI_REVIEW_TIMEOUT_MS);
  if (!isProject(payload?.project) || !payload.project.furniture.length || typeof payload.prompt !== 'string' || !payload.prompt.trim() || payload.prompt.length > 600) {
    throw new ApiError(400, 'Choose furniture and enter a note before reviewing preferences.');
  }
  const apiKey = config.apiKey?.trim();
  if (!apiKey) throw new ApiError(503, 'Add a Gemini key to interpret your note, or add conditions manually.');
  const project = payload.project;
  const input = {
    note: payload.prompt,
    room: { ...project.room, openings: getOpenings(project.room) },
    furniture: project.furniture.map(({ id, kind, width, depth }) => ({ id, kind, width, depth,
      ...(kind === 'television' ? { wallMounted: true } : {}) })),
    targets: targetOptions(project),
  };
  const value = await callGemini(config, apiKey, [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }], preferenceSchema(project), fetchImpl, signal, responseInstructions(preferenceInstructions, payload.language));
  if (!isPreferenceReview(value, project) || (!value.requirements.length && !value.unmetRequests.length)) {
    throw new ApiError(502, 'Gemini returned conditions that DormFit could not verify. Try again or add them manually.', 'GEMINI_RESPONSE_INVALID');
  }
  return { requirements: value.requirements, unmetRequests: value.unmetRequests };
}

async function callGemini(config, apiKey, contents, schema, fetchImpl, signal, instructions = planInstructions) {
  const request = modelRequest(config, fetchImpl);
  async function send(jsonOnly = false) {
    try {
      return await request({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal,
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
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new ApiError(504, 'Gemini took too long to respond.', 'GEMINI_TIMEOUT');
      }
      throw new ApiError(502, 'Could not connect to Gemini. Check your internet connection.', 'GEMINI_NETWORK');
    }
  }
  // Share one retry between format compatibility and unreadable output. Never
  // resend raw model text, bypass the call limiter, or retry credential errors.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await send(attempt === 1);
    if (!response.ok) {
      const error = await geminiError(response);
      if (attempt === 0 && error.code === 'GEMINI_BAD_REQUEST' && error.outputFormatRejected) continue;
      throw error;
    }
    try {
      return await readGeminiResponse(response);
    } catch (error) {
      if (attempt === 0 && error.code === 'GEMINI_RESPONSE_INVALID') continue;
      throw error;
    }
  }
}

async function readGeminiResponse(response) {
  try {
    const body = await response.json();
    const candidate = body?.candidates?.[0];
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new ApiError(502, 'The Gemini response was cut short by its output limit.', 'GEMINI_OUTPUT_LIMIT');
    }
    if (body?.promptFeedback?.blockReason || ['SAFETY', 'RECITATION'].includes(candidate?.finishReason)) {
      throw new ApiError(502, 'Gemini did not return a layout. Try a simpler note.', 'GEMINI_RESPONSE_BLOCKED');
    }
    if (candidate?.finishReason !== 'STOP') throw new Error('Incomplete response');
    const text = candidate.content.parts
      .filter((part) => part && !part.thought && typeof part.text === 'string')
      .map((part) => part.text)
      .join('').trim();
    // Accept a complete fenced JSON document, but never extract a fragment
    // from prose or guess missing brackets/values in a truncated response.
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
    return JSON.parse(fenced ? fenced[1] : text);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'Gemini did not return a complete, readable JSON layout.', 'GEMINI_RESPONSE_INVALID');
  }
}
