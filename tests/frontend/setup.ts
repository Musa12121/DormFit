import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { setLanguage } from '../../src/i18n';

beforeEach(() => {
  setLanguage('en');
  localStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  document.body.style.overflow = '';
});

// jsdom has no native dialog rendering; the real dialog behaviour also has browser tests.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
