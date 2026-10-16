export class ApiError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED', upstreamStatus = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

export function planValidationError(problems) {
  const labels = {
    overlap: 'furniture overlaps', outside: 'room boundaries',
    door: 'door zone', placement: 'near and away conditions',
    furniture: 'furniture counts and IDs', note: 'converting the note to conditions',
    format: 'AI response format',
  };
  const checks = [...new Set(problems.map((problem) => {
    if (problem.startsWith('overlap:')) return 'overlap';
    if (problem.startsWith('outside:')) return 'outside';
    if (problem.startsWith('door:')) return 'door';
    if (problem.includes(' must be near ') || problem.includes(' must be away ')) return 'placement';
    if (problem.startsWith('Return every original')) return 'furniture';
    if (problem.startsWith('A note was supplied')) return 'note';
    return 'format';
  }))];
  const error = new ApiError(502,
    `The AI layout failed validation after two attempts: ${checks.map((check) => labels[check]).join(', ')}.`,
    'AI_PLAN_INVALID');
  error.checks = checks;
  return error;
}

// Google can echo credentials in its error message. Only match known reason codes;
// never return or log the raw message, metadata, request headers or response body.
export async function geminiError(response) {
  let reasons = [];
  let outputFormatRejected = false;
  try {
    const body = await response.json();
    reasons = Array.isArray(body.error?.details)
      ? body.error.details.map((detail) => detail?.reason)
      : [];
    // Only retain this boolean classification. Never expose the original message.
    const message = typeof body.error?.message === 'string' ? body.error.message : '';
    const fields = Array.isArray(body.error?.details) ? body.error.details.flatMap((detail) =>
      Array.isArray(detail?.fieldViolations) ? detail.fieldViolations.map((violation) => violation?.field).filter((field) => typeof field === 'string') : []) : [];
    outputFormatRejected = /response[_. ]?(?:json[_. ]?)?(?:schema|format)|json schema|schema.*(?:complex|constraint|unsupported)|too many (?:states|constraints)/i.test(message)
      || fields.some((field) => /response[_.]?(?:json[_.]?)?(?:schema|format)/i.test(field));
  } catch { /* A non-JSON error still has a useful HTTP status. */ }
  const fail = (code, message, status = 502) =>
    new ApiError(status, message, code, response.status);

  if (reasons.includes('API_KEY_INVALID') || reasons.includes('API_KEY_EXPIRED')) {
    return fail('GEMINI_KEY_INVALID', 'Gemini rejected the API key. Check it in your private settings file.');
  }
  if (reasons.includes('SERVICE_DISABLED')) {
    return fail('GEMINI_API_DISABLED', 'The Generative Language API is not enabled in your Google project.');
  }
  if (reasons.includes('API_KEY_SERVICE_BLOCKED')) {
    return fail('GEMINI_KEY_RESTRICTED', 'The API key restrictions do not allow Gemini access.');
  }
  switch (response.status) {
    case 400:
      { const error = fail('GEMINI_BAD_REQUEST', 'Gemini rejected the request format or model settings. Restart the updated backend; if it continues, check the configured model.');
        error.outputFormatRejected = outputFormatRejected;
        return error; }
    case 401:
    case 403:
      return fail('GEMINI_ACCESS_DENIED', 'Gemini denied access. Check the key permissions and model access in your Google project.');
    case 402:
      return fail('GEMINI_BILLING', 'The billing or credit settings in your Google project do not allow this request.');
    case 404:
      return fail('GEMINI_MODEL_NOT_FOUND', 'The selected Gemini model is unavailable. Check the model name in your private backend settings.');
    case 429:
      return fail('GEMINI_QUOTA', 'The Gemini request limit has been reached. Try again later.', 429);
    default:
      return fail('GEMINI_UNAVAILABLE', 'Gemini cannot complete this request right now.');
  }
}
