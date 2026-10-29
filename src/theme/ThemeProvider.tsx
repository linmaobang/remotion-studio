import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} });

export const useTheme = () => useContext(ThemeContext);

const initialTheme = (): Theme => {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);
  return (
    <ThemeContext.Provider value={{ theme, toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')) }}>
      {children}
    </ThemeContext.Provider>
  );
};
