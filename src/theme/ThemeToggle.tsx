import { useTheme } from './ThemeProvider';

export const ThemeToggle = () => {
  const { theme, toggle } = useTheme();
  return (
    <button className="theme-toggle" onClick={toggle}>
      {theme === 'light' ? '🌙 深色模式' : '☀️ 浅色模式'}
    </button>
  );
};
