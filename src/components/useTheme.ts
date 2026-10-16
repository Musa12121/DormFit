import { useEffect, useState } from 'react';

export const THEME_KEY = 'dormfit.theme';
type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* The switch still works when browser storage is unavailable. */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* Use this session's choice. */ }
  }, [theme]);

  return { theme, toggleTheme: () => setTheme((current) => current === 'dark' ? 'light' : 'dark') };
}
