import type { FormEvent } from 'react';
import { t } from '../i18n';

// Browser validation bubbles otherwise follow the browser's own language.
export function showValidation(event: FormEvent<HTMLFormElement>) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.validity.valueMissing) input.setCustomValidity(t('Please fill in this field.'));
  else if (input.validity.rangeOverflow || input.validity.rangeUnderflow) {
    input.setCustomValidity(t(`Enter a value between ${input.min} and ${input.max}.`));
  } else if (input.validity.badInput || input.validity.stepMismatch) {
    input.setCustomValidity(t('Please enter a valid number.'));
  }
}

export function clearValidation(event: FormEvent<HTMLFormElement>) {
  if (event.target instanceof HTMLInputElement) event.target.setCustomValidity('');
}
