import { createContext, useContext } from 'react';

// Kept apart from ThemeProvider so ThemeContext.jsx exports only a component,
// which React Fast Refresh needs to hot-reload it.
export const ThemeContext = createContext();

export function useTheme() {
  return useContext(ThemeContext);
}
