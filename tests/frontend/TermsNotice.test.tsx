import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { setLanguage, translate } from '../../src/i18n';
import { CURRENT_KEY } from '../../src/domain/storage';

describe('terms and privacy before measurements', () => {
  it.each(['en', 'ru', 'tr'] as const)('opens the complete notice in %s without submitting data or resetting measurements', language => {
    setLanguage(language);
    const provider = vi.fn(); vi.stubGlobal('fetch', provider);
    render(<App />);
    const reminder = screen.getByText(translate('Before entering measurements', language));
    const width = screen.getByLabelText(translate('Room width', language), { exact: true });
    expect(reminder.compareDocumentPosition(width) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(width, { target: { value: '7.2' } });
    const saved = localStorage.getItem(CURRENT_KEY);
    fireEvent.click(screen.getByRole('button', { name: translate('Read Terms & privacy', language) }));
    const notice = screen.getByRole('dialog', { name: translate('Terms & privacy', language) });
    expect(within(notice).getAllByRole('heading', { level: 3 })).toHaveLength(6);
    expect(within(notice).getByRole('heading', { name: translate('How Google may use AI data', language) })).toBeVisible();
    expect(within(notice).getByRole('heading', { name: translate('Saving and deleting layouts', language) })).toBeVisible();
    const source = within(notice).getByRole('link', { name: translate('Google Gemini API terms and data use', language) });
    expect(source).toHaveAttribute('href', 'https://ai.google.dev/gemini-api/terms');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(within(notice).getByRole('button', { name: translate('Close dialog', language) }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(width).toHaveValue(7.2);
    expect(localStorage.getItem(CURRENT_KEY)).toBe(saved);
    expect(provider).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: translate('Terms & privacy', language) })).toBeVisible();
  });
});
