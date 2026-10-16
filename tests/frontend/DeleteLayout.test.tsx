import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { CURRENT_KEY, SAVED_KEY } from '../../src/domain/storage';
import { setLanguage } from '../../src/i18n';
import { project } from './fixtures';

function openSaved() {
  const room = project();
  localStorage.setItem(CURRENT_KEY, JSON.stringify(room));
  localStorage.setItem(SAVED_KEY, JSON.stringify([
    { id: 'first', updatedAt: '2026-10-15T10:00:00Z', project: { ...room, name: 'First layout' } },
    { id: 'second', updatedAt: '2026-10-15T10:00:00Z', project: { ...room, name: 'Second layout' } },
  ]));
  const view = render(<App />);
  fireEvent.click(view.container.querySelector('.main-nav button:nth-child(2)')!);
  return view;
}
const saved = () => JSON.parse(localStorage.getItem(SAVED_KEY)!);
const askToDelete = () => fireEvent.click(screen.getByRole('button', { name: 'First layout delete layout' }));

describe('saved layout deletion', () => {
  it('shows the selected name and keeps both layouts when cancelled or closed', () => {
    openSaved(); askToDelete();
    expect(screen.getByRole('dialog', { name: 'Delete saved layout?' })).toHaveTextContent('First layout');
    expect(saved()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Your layouts' })).toBeVisible();
    expect(saved()).toHaveLength(2);
    askToDelete(); fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(saved()).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'First layout delete layout' })).toBeVisible();
  });

  it('deletes only the confirmed saved copy and preserves the current workspace', () => {
    openSaved(); const workspace = localStorage.getItem(CURRENT_KEY);
    askToDelete(); fireEvent.click(screen.getByRole('button', { name: 'Delete layout' }));
    expect(saved().map((entry: { id: string }) => entry.id)).toEqual(['second']);
    expect(localStorage.getItem(CURRENT_KEY)).toBe(workspace);
    expect(screen.getByRole('dialog', { name: 'Your layouts' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'First layout delete layout' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Second layout delete layout' })).toBeVisible();
  });

  it('keeps the saved layout and shows an error if storage fails, allowing retry', () => {
    openSaved(); askToDelete();
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    fireEvent.click(screen.getByRole('button', { name: 'Delete layout' }));
    expect(saved()).toHaveLength(2);
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Could not delete the layout.');
    storage.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Delete layout' }));
    expect(saved()).toHaveLength(1);
  });

  it.each([
    ['ru', 'Удалить планировку: First layout', 'Удалить сохранённую планировку?', 'Отмена'],
    ['tr', 'First layout planını sil', 'Kaydedilen plan silinsin mi?', 'İptal'],
  ] as const)('translates the confirmation into %s', (language, trigger, title, cancel) => {
    setLanguage(language); openSaved();
    fireEvent.click(screen.getByRole('button', { name: trigger }));
    expect(screen.getByRole('dialog', { name: title })).toHaveTextContent('First layout');
    fireEvent.click(screen.getByRole('button', { name: cancel }));
    expect(saved()).toHaveLength(2);
  });
});
