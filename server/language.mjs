import { ApiError } from './geminiErrors.mjs';

const languages = { en: 'English', ru: 'Russian', tr: 'Turkish' };

export function responseInstructions(instructions, language = 'en') {
  if (typeof language !== 'string' || !Object.hasOwn(languages, language)) {
    throw new ApiError(400, 'Choose English, Russian or Turkish as the response language.');
  }
  return `${instructions}\nResponse language: ${languages[language]}. Preserve any user-confirmed unmetRequests exactly as supplied.`;
}
