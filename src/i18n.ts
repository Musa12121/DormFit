import { translations } from './translations';
import { furnitureLabels } from './domain/model';

export type Language = 'en' | 'ru' | 'tr';
export const LANGUAGE_KEY = 'dormfit.language';
export const locales = { en: 'en-US', ru: 'ru-RU', tr: 'tr-TR' };
const listeners = new Set<() => void>();

function readLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved === 'ru' || saved === 'tr') return saved;
  } catch { /* The app also works when browser storage is disabled. */ }
  return 'en';
}

let language = readLanguage();
export const getLanguage = () => language;
export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setLanguage(next: Language) {
  if (!['en', 'ru', 'tr'].includes(next)) return;
  language = next;
  try { localStorage.setItem(LANGUAGE_KEY, next); } catch { /* Keep the in-memory choice. */ }
  applyDocumentLanguage();
  listeners.forEach(listener => listener());
}
export function applyDocumentLanguage() {
  document.documentElement.lang = language;
  document.title = language === 'ru' ? 'DormFit — Планировщик комнаты'
    : language === 'tr' ? 'DormFit — Oda planlayıcı' : 'DormFit — Room planner';
  document.querySelector('meta[name="description"]')?.setAttribute('content', translate('Enter room sizes, choose furniture quantities, and find a layout that fits.'));
}

// Dynamic messages use readable English templates, such as "{name} width".
const templates = Object.entries(translations).filter(([key]) => key.includes('{'))
  .sort(([a], [b]) => b.replace(/\{\w+\}/g, '').length - a.replace(/\{\w+\}/g, '').length)
  .map(([key, values]) => {
  const fields: string[] = [];
  const pattern = key.split(/(\{\w+\})/).map(part => {
    if (/^\{\w+\}$/.test(part)) {
      const field = part.slice(1, -1);
      fields.push(field);
      return ['number', 'count', 'width', 'depth', 'offset'].includes(field) ? '(\\d+(?:[.,]\\d+)?)' : '(.+?)';
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { key, regex: new RegExp(`^${pattern}$`), fields, values };
});

export function translate(text: string, selected: Language = language, depth = 0): string {
  if (selected === 'en' || depth > 6) return text;
  const key = text.trim().replace(/\s+/g, ' ');
  const index = selected === 'ru' ? 0 : 1;
  let result = translations[key]?.[index];
  if (!result) {
    for (const template of templates) {
      if (template.key === '{name} {number}') {
        const name = key.replace(/ \d+$/, '');
        if (!/ \d+$/.test(key) || ![...Object.values(furnitureLabels), 'Rug', 'Nightstand', 'Dresser', 'Cabinet', 'Armchair', 'Coffee table', 'Door', 'Window', 'Condition'].includes(name)) continue;
      }
      const match = template.regex.exec(key);
      if (!match) continue;
      result = template.values[index];
      template.fields.forEach((field, i) => {
        const value = match[i + 1];
        const translated = field === 'checks'
          ? value.split(', ').map(part => translate(part, selected, depth + 1)).join(', ')
          : translate(value, selected, depth + 1);
        result = result!.replace(`{${field}}`, () => translated);
      });
      break;
    }
  }
  if (!result) {
    const coded = /^(.*) (\([A-Z_]+\))$/.exec(key);
    if (coded) result = `${translate(coded[1], selected, depth + 1)} ${coded[2]}`;
    else if (/^(DOOR|WINDOW) \d+$/.test(key)) result = translate(key[0] + key.slice(1).toLowerCase(), selected, depth + 1).toLocaleUpperCase(locales[selected]);
  }
  if (!result) return text;
  return text.slice(0, text.length - text.trimStart().length) + result + text.slice(text.trimEnd().length);
}

// This preserves numbers, elements and undefined values in conditional JSX.
// Translate only display text; form values, notes, IDs and saved data stay untouched.
export function t<T>(value: T): T {
  return (typeof value === 'string' ? translate(value) : value) as T;
}
