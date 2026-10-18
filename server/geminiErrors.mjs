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
    overlap: 'furniture overlaps', spacing: 'furniture spacing', mount: 'TV wall mounting', outside: 'room boundaries',
    door: 'door zone', access: 'walking access', placement: 'near and away conditions',
    operation: 'furniture opening clearance', facing: 'chair and table orientation',
    bedside: 'bedside table placement', view: 'TV viewing clearance',
    furniture: 'furniture counts and IDs', note: 'converting the note to conditions',
    format: 'AI response format',
  };
  const checks = [...new Set(problems.map((problem) => {
    if (problem.startsWith('overlap:')) return 'overlap';
    if (problem.startsWith('spacing:')) return 'spacing';
    if (problem.startsWith('mount:')) return 'mount';
    if (problem.startsWith('operation:')) return 'operation';
    if (problem.startsWith('facing:')) return 'facing';
    if (problem.startsWith('bedside:')) return 'bedside';
    if (problem.startsWith('view:')) return 'view';
    if (problem.startsWith('outside:')) return 'outside';
    if (problem.startsWith('door:')) return 'door';
    if (problem.startsWith('access:')) return 'access';
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
export async function geminiError(response, requestedModel) {
  let reasons = [];
  let outputFormatRejected = false;
  let quotaScope = 'unknown';
  let quotaWindow = 'unknown';
  const seconds = value => {
    if (typeof value !== 'string' || !/^\d+(?:\.\d+)?s?$/.test(value)) return undefined;
    const number = Number(value.replace(/s$/, ''));
    return Number.isFinite(number) && number > 0 && number <= 7 * 86_400 ? Math.ceil(number) : undefined;
  };
  let retryAfter = seconds(response.headers.get('retry-after'));
  try {
    const body = await response.json();
    reasons = Array.isArray(body.error?.details)
      ? body.error.details.map((detail) => detail?.reason)
      : [];
    const details = Array.isArray(body.error?.details) ? body.error.details : [];
    const violations = details.filter(detail => detail?.['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure')
      .flatMap(detail => Array.isArray(detail.violations) ? detail.violations : []);
    if (violations.length) {
      quotaScope = violations.every(violation => requestedModel && violation?.quotaDimensions?.model === requestedModel)
        ? 'model' : violations.some(violation => !violation?.quotaDimensions?.model) ? 'project' : 'unknown';
      if (violations.some(violation => /per.?day/i.test(String(violation?.quotaId ?? '')))) quotaWindow = 'day';
      else if (violations.some(violation => /per.?minute/i.test(String(violation?.quotaId ?? '')))) quotaWindow = 'minute';
    }
    for (const detail of details) if (detail?.['@type'] === 'type.googleapis.com/google.rpc.RetryInfo') {
      const delay = seconds(detail.retryDelay);
      if (delay) retryAfter = Math.max(retryAfter ?? 0, delay);
    }
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
      { const error = fail('GEMINI_QUOTA', 'The Gemini request limit has been reached. Try again later.', 429);
        error.quotaScope = quotaScope;
        error.quotaWindow = quotaWindow;
        if (retryAfter) error.retryAfter = retryAfter;
        return error; }
    case 500:
    case 502:
    case 503:
    case 504:
      { const error = fail('GEMINI_UNAVAILABLE', 'Gemini cannot complete this request right now.');
        if (retryAfter) error.retryAfter = retryAfter;
        return error; }
    default:
      return fail('GEMINI_UNAVAILABLE', 'Gemini cannot complete this request right now.');
  }
}
