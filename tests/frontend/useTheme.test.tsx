import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { THEME_KEY, useTheme } from '../../src/components/useTheme';

function ThemeSwitch() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

describe('colour theme', () => {
  it('switches themes and remembers the choice after remount', () => {
    const view = render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole('button', { name: 'light' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    view.unmount(); render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole('button', { name: 'dark' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
  it('uses the system preference when there is no saved choice', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    render(<ThemeSwitch />);
    expect(screen.getByRole('button', { name: 'dark' })).toBeInTheDocument();
  });
  it('keeps an explicit choice even if the system prefers dark mode', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    localStorage.setItem(THEME_KEY, 'light'); render(<ThemeSwitch />);
    expect(screen.getByRole('button', { name: 'light' })).toBeInTheDocument();
  });
  it('works if browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole('button', { name: 'light' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
