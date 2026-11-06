import RESOLVED from './palette-colors.json' with { type: 'json' };

export const ROLES = [
  'bg', 'bgMuted', 'bgInset', 'bgHover', 'border', 'borderMuted', 'fg', 'fgMuted',
  'accent', 'success', 'attention', 'severe', 'danger', 'done', 'sponsors',
  'header', 'headerFg', 'onEmphasis',
] as const;

export type Role = (typeof ROLES)[number];
export type RoleMap = Record<Role, string>;

export interface Palette {
  id: string;
  name: string;
  group: 'GitHub' | 'Community';
  description: string;
  source: { label: string; url: string };
  primer?: { light?: string; dark?: string };
  primary?: 'success' | 'accent';
  roles?: { light: RoleMap; dark: RoleMap };
}


const PRIMER = { label: 'GitHub Primer primitives', url: 'https://github.com/primer/primitives' };

export const PALETTES: Palette[] = [
  { id: 'github', name: 'GitHub', group: 'GitHub', description: 'The standard GitHub light and dark colours.', source: PRIMER },
  { id: 'github-high-contrast', name: 'High contrast', group: 'GitHub', description: 'GitHub’s high contrast themes, with stronger text and borders.', source: PRIMER, primer: { light: 'light-high-contrast', dark: 'dark-high-contrast' } },
  { id: 'github-dimmed', name: 'Dimmed', group: 'GitHub', description: 'GitHub dark dimmed: a softer dark theme. Light stays standard.', source: PRIMER, primer: { dark: 'dark-dimmed' } },
  { id: 'github-colorblind', name: 'Colourblind', group: 'GitHub', description: 'GitHub’s protanopia and deuteranopia themes: blue and orange instead of green and red.', source: PRIMER, primer: { light: 'light-colorblind', dark: 'dark-colorblind' } },
  { id: 'github-tritanopia', name: 'Tritanopia', group: 'GitHub', description: 'GitHub’s tritanopia themes for blue–yellow colour blindness.', source: PRIMER, primer: { light: 'light-tritanopia', dark: 'dark-tritanopia' } },
  {
    id: 'catppuccin', name: 'Catppuccin', group: 'Community', description: 'Soothing pastels. Latte when light, Mocha when dark.',
    source: { label: '@catppuccin/palette', url: 'https://github.com/catppuccin/palette' },
    roles: {
      light: {
        bg: 'latte.base', bgMuted: 'latte.mantle', bgInset: 'latte.crust', bgHover: 'latte.surface0', border: 'latte.surface1', borderMuted: 'latte.surface0',
        fg: 'latte.text', fgMuted: 'latte.subtext0', accent: 'latte.blue', success: 'latte.green', attention: 'latte.yellow', severe: 'latte.peach',
        danger: 'latte.red', done: 'latte.mauve', sponsors: 'latte.pink', header: 'mocha.crust', headerFg: 'mocha.text', onEmphasis: 'latte.base',
      },
      dark: {
        bg: 'mocha.base', bgMuted: 'mocha.mantle', bgInset: 'mocha.crust', bgHover: 'mocha.surface0', border: 'mocha.surface1', borderMuted: 'mocha.surface0',
        fg: 'mocha.text', fgMuted: 'mocha.subtext0', accent: 'mocha.blue', success: 'mocha.green', attention: 'mocha.yellow', severe: 'mocha.peach',
        danger: 'mocha.red', done: 'mocha.mauve', sponsors: 'mocha.pink', header: 'mocha.crust', headerFg: 'mocha.text', onEmphasis: 'mocha.crust',
      },
    },
  },
  {
    id: 'nord', name: 'Nord', group: 'Community', description: 'Arctic blues. Snow Storm when light, Polar Night when dark.', primary: 'accent',
    source: { label: 'nord (arcticicestudio)', url: 'https://github.com/nordtheme/nord' },
    roles: {
      light: {
        bg: 'nord6', bgMuted: 'nord5', bgInset: 'nord4', bgHover: 'nord4', border: 'nord4', borderMuted: 'nord5',
        fg: 'nord0', fgMuted: 'nord3', accent: 'nord10', success: 'nord14', attention: 'nord13', severe: 'nord12',
        danger: 'nord11', done: 'nord15', sponsors: 'nord15', header: 'nord0', headerFg: 'nord6', onEmphasis: 'nord6',
      },
      dark: {
        bg: 'nord0', bgMuted: 'nord1', bgInset: 'nord0', bgHover: 'nord2', border: 'nord3', borderMuted: 'nord2',
        fg: 'nord6', fgMuted: 'nord4', accent: 'nord8', success: 'nord14', attention: 'nord13', severe: 'nord12',
        danger: 'nord11', done: 'nord15', sponsors: 'nord15', header: 'nord1', headerFg: 'nord6', onEmphasis: 'nord0',
      },
    },
  },
  {
    id: 'atom', name: 'Atom One', group: 'Community', description: 'The Atom editor’s One Light and One Dark.', primary: 'accent',
    source: { label: 'atom/atom one-ui and one-syntax themes', url: 'https://github.com/atom/atom/tree/master/packages' },
    roles: {
      light: {
        bg: 'light.base-background-color', bgMuted: 'light.app-background-color', bgInset: 'light.app-background-color', bgHover: 'light.background-color-highlight',
        border: 'light.base-border-color', borderMuted: 'light.base-border-color', fg: 'light.text-color-highlight', fgMuted: 'light.text-color',
        accent: 'light.accent-color', success: 'light.text-color-success', attention: 'light.text-color-warning', severe: 'light.hue-6',
        danger: 'light.text-color-error', done: 'light.hue-3', sponsors: 'light.hue-5-2', header: 'dark.app-background-color', headerFg: 'dark.text-color-highlight',
        onEmphasis: 'light.text-color-selected',
      },
      dark: {
        bg: 'dark.base-background-color', bgMuted: 'dark.tool-panel-background-color', bgInset: 'dark.app-background-color', bgHover: 'dark.button-background-color-hover',
        border: 'dark.base-border-color', borderMuted: 'dark.base-border-color', fg: 'dark.text-color-highlight', fgMuted: 'dark.text-color',
        accent: 'dark.accent-color', success: 'dark.text-color-success', attention: 'dark.text-color-warning', severe: 'dark.hue-6',
        danger: 'dark.text-color-error', done: 'dark.hue-3', sponsors: 'dark.hue-3', header: 'dark.app-background-color', headerFg: 'dark.text-color-highlight',
        onEmphasis: 'dark.text-color-selected',
      },
    },
  },
  {
    id: 'solarized', name: 'Solarized', group: 'Community', description: 'Ethan Schoonover’s precision colours on cream or deep teal.',
    source: { label: 'altercation/solarized', url: 'https://github.com/altercation/solarized' },
    roles: {
      light: {
        bg: 'base3', bgMuted: 'base2', bgInset: 'base2', bgHover: 'base2', border: 'base1', borderMuted: 'base2',
        fg: 'base01', fgMuted: 'base00', accent: 'blue', success: 'green', attention: 'yellow', severe: 'orange',
        danger: 'red', done: 'violet', sponsors: 'magenta', header: 'base03', headerFg: 'base1', onEmphasis: 'base3',
      },
      dark: {
        bg: 'base03', bgMuted: 'base02', bgInset: 'base03', bgHover: 'base02', border: 'base01', borderMuted: 'base02',
        fg: 'base1', fgMuted: 'base0', accent: 'blue', success: 'green', attention: 'yellow', severe: 'orange',
        danger: 'red', done: 'violet', sponsors: 'magenta', header: 'base02', headerFg: 'base1', onEmphasis: 'base03',
      },
    },
  },
  {
    id: 'gruvbox', name: 'Gruvbox', group: 'Community', description: 'Warm, retro, earthy colours.',
    source: { label: 'morhetz/gruvbox', url: 'https://github.com/morhetz/gruvbox' },
    roles: {
      light: {
        bg: 'light0', bgMuted: 'light1', bgInset: 'light1', bgHover: 'light2', border: 'light3', borderMuted: 'light2',
        fg: 'dark1', fgMuted: 'dark4', accent: 'faded_blue', success: 'faded_green', attention: 'faded_yellow', severe: 'faded_orange',
        danger: 'faded_red', done: 'faded_purple', sponsors: 'faded_purple', header: 'dark0_hard', headerFg: 'light1', onEmphasis: 'light0',
      },
      dark: {
        bg: 'dark0', bgMuted: 'dark1', bgInset: 'dark0_hard', bgHover: 'dark2', border: 'dark2', borderMuted: 'dark1',
        fg: 'light1', fgMuted: 'light4', accent: 'bright_blue', success: 'bright_green', attention: 'bright_yellow', severe: 'bright_orange',
        danger: 'bright_red', done: 'bright_purple', sponsors: 'bright_purple', header: 'dark0_hard', headerFg: 'light1', onEmphasis: 'dark0',
      },
    },
  },
  {
    id: 'rose-pine', name: 'Rosé Pine', group: 'Community', description: 'Soho vibes. Dawn when light, the original when dark.', primary: 'accent',
    source: { label: '@rose-pine/palette', url: 'https://github.com/rose-pine/palette' },
    roles: {
      light: {
        bg: 'dawn.base', bgMuted: 'dawn.surface', bgInset: 'dawn.overlay', bgHover: 'dawn.highlightMed', border: 'dawn.highlightHigh', borderMuted: 'dawn.highlightMed',
        fg: 'dawn.text', fgMuted: 'dawn.subtle', accent: 'dawn.pine', success: 'dawn.foam', attention: 'dawn.gold', severe: 'dawn.rose',
        danger: 'dawn.love', done: 'dawn.iris', sponsors: 'dawn.rose', header: 'main.base', headerFg: 'main.text', onEmphasis: 'dawn.base',
      },
      dark: {
        bg: 'main.base', bgMuted: 'main.surface', bgInset: 'main.base', bgHover: 'main.overlay', border: 'main.highlightMed', borderMuted: 'main.highlightLow',
        fg: 'main.text', fgMuted: 'main.subtle', accent: 'main.foam', success: 'main.pine', attention: 'main.gold', severe: 'main.rose',
        danger: 'main.love', done: 'main.iris', sponsors: 'main.rose', header: 'main.surface', headerFg: 'main.text', onEmphasis: 'main.base',
      },
    },
  },
];

export type ResolvedColors = Record<Role, string>;

export const PALETTE_COLORS = RESOLVED as unknown as Record<string, { light: ResolvedColors; dark: ResolvedColors }>;

export const paletteById = (id: string | null | undefined) => PALETTES.find((p) => p.id === id) || PALETTES[0];
