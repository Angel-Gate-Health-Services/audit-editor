import { create } from 'zustand';
import { timers } from '../../app/runtime/services.ts';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

export const THEMES: [ThemeMode, string, string][] = [
  ['auto', 'System', 'device-desktop'],
  ['light', 'Light', 'sun'],
  ['dark', 'Dark', 'moon'],
];

const PALETTE_KEY = 'aghs-palette';
export const DEFAULT_PALETTE = 'github';
const validPalette = (id: string | null): id is string => Boolean(id && /^[a-z-]{1,40}$/.test(id));
const darkQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

const readMode = (): ThemeMode => {
  const mode = document.documentElement.getAttribute('data-color-mode');
  return mode === 'light' || mode === 'dark' ? mode : 'auto';
};

const readPalette = () => {
  const value = document.documentElement.getAttribute('data-palette');
  return validPalette(value) ? value : DEFAULT_PALETTE;
};

export const schemeFor = (mode: ThemeMode): Scheme => (mode === 'dark' || (mode === 'auto' && darkQuery?.matches) ? 'dark' : 'light');

export const useTheme = create(() => ({ mode: readMode(), palette: readPalette(), scheme: schemeFor(readMode()) }));

export const themeInfo = (mode: ThemeMode) => THEMES.find((t) => t[0] === mode)!;

function transition() {
  const root = document.documentElement;
  root.classList.add('is-theme-transition');
  clearTimeout(timers.theme);
  timers.theme = setTimeout(() => root.classList.remove('is-theme-transition'), 280);
}

function syncScheme() {
  const scheme = schemeFor(useTheme.getState().mode);
  document.documentElement.setAttribute('data-scheme', scheme);
  if (useTheme.getState().scheme !== scheme) useTheme.setState({ scheme });
}

darkQuery?.addEventListener?.('change', syncScheme);

export function applyTheme(mode: ThemeMode) {
  if (!THEMES.some(([value]) => value === mode)) return;
  const root = document.documentElement;
  transition();
  root.setAttribute('data-color-mode', mode);
  try {
    if (mode === 'auto') localStorage.removeItem('aghs-theme');
    else localStorage.setItem('aghs-theme', mode);
  } catch {
    root.setAttribute('data-color-mode', mode);
  }
  useTheme.setState({ mode });
  syncScheme();
}

export function applyPalette(id: string) {
  if (!validPalette(id)) return;
  const root = document.documentElement;
  transition();
  if (id === DEFAULT_PALETTE) root.removeAttribute('data-palette');
  else root.setAttribute('data-palette', id);
  try {
    if (id === DEFAULT_PALETTE) localStorage.removeItem(PALETTE_KEY);
    else localStorage.setItem(PALETTE_KEY, id);
  } catch {
    root.setAttribute('data-palette', id);
  }
  useTheme.setState({ palette: id });
  syncScheme();
}
