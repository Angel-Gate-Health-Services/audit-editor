import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import less from 'less';
import { flavors } from '@catppuccin/palette';
import { variantColors as rosePine } from '@rose-pine/palette';
import { PALETTES, ROLES } from '../src/features/settings/palettes.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = join(ROOT, 'scripts/palette-sources');
const THEMES = join(ROOT, 'node_modules/@primer/primitives/dist/css/functional/themes');
const CSS_OUT = join(ROOT, 'src/styles/palettes.css');
const JSON_OUT = join(ROOT, 'src/features/settings/palette-colors.json');
const HUES = ['accent', 'success', 'attention', 'severe', 'danger', 'done', 'sponsors'];
const TINT = '26';
const TINT_BORDER = '66';

const pad = (n) => Math.round(n).toString(16).padStart(2, '0');

export function cssColorToHex(value) {
  const v = String(value).trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) {
    const h = v.slice(1).toLowerCase();
    return `#${h.length <= 4 ? h.split('').map((c) => c + c).join('') : h}`;
  }
  const hsl = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
  if (hsl) {
    const [h, s, l] = [Number(hsl[1]) / 360, Number(hsl[2]) / 100, Number(hsl[3]) / 100];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (t) => {
      const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    const rgb = s === 0 ? [l, l, l] : [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
    const alpha = hsl[4] !== undefined && Number(hsl[4]) < 1 ? pad(Number(hsl[4]) * 255) : '';
    return `#${rgb.map((c) => pad(c * 255)).join('')}${alpha}`;
  }
  if (/^(white|#fff)$/i.test(v)) return '#ffffff';
  throw new Error(`Unsupported colour value: ${value}`);
}

async function atomColours() {
  const base = join(SOURCES, 'atom-one');
  const names = ['base-background-color', 'app-background-color', 'tool-panel-background-color', 'inset-panel-background-color', 'base-border-color',
    'text-color', 'text-color-subtle', 'text-color-highlight', 'text-color-selected', 'text-color-info', 'text-color-success', 'text-color-warning', 'text-color-error',
    'background-color-highlight', 'button-background-color', 'button-background-color-hover', 'accent-color',
    'hue-1', 'hue-2', 'hue-3', 'hue-4', 'hue-5', 'hue-5-2', 'hue-6', 'hue-6-2', 'mono-1', 'mono-2', 'mono-3'];
  const out = {};
  for (const [key, theme] of [['dark', 'one-dark'], ['light', 'one-light']]) {
    const source = `@import "${theme}-ui/styles/ui-variables.less";\n.x {\n${names.map((n) => `  ${n}: @${n};`).join('\n')}\n}`;
    const { css } = await less.render(source, { paths: [base, join(base, `${theme}-syntax/styles`), join(base, `${theme}-ui/styles`)] });
    for (const m of css.matchAll(/^\s+([\w-]+):\s*([^;]+);/gm)) out[`${key}.${m[1]}`] = cssColorToHex(m[2]);
  }
  return out;
}

function nordColours() {
  const css = readFileSync(join(ROOT, 'node_modules/nord/src/lesscss/nord.less'), 'utf8');
  return Object.fromEntries([...css.matchAll(/^@(nord\d+):\s*(#[0-9a-f]{6});/gim)].map((m) => [m[1], cssColorToHex(m[2])]));
}

function solarizedColours() {
  const readme = readFileSync(join(SOURCES, 'solarized/README.md'), 'utf8');
  const names = ['base03', 'base02', 'base01', 'base00', 'base0', 'base1', 'base2', 'base3', 'yellow', 'orange', 'red', 'magenta', 'violet', 'blue', 'cyan', 'green'];
  return Object.fromEntries(names.map((name) => {
    const m = new RegExp(`^\\s*${name}\\s+(#[0-9a-f]{6})\\s`, 'mi').exec(readme);
    if (!m) throw new Error(`The Solarized README has no row for ${name}`);
    return [name, cssColorToHex(m[1])];
  }));
}

function gruvboxColours() {
  const vim = readFileSync(join(SOURCES, 'gruvbox/gruvbox.vim'), 'utf8');
  return Object.fromEntries([...vim.matchAll(/^let s:gb\.(\w+)\s*=\s*\['(#[0-9a-f]{6})'/gim)].map((m) => [m[1], cssColorToHex(m[2])]));
}

function catppuccinColours() {
  const out = {};
  for (const flavor of ['latte', 'mocha']) {
    for (const [name, colour] of Object.entries(flavors[flavor].colors)) out[`${flavor}.${name}`] = cssColorToHex(colour.hex);
  }
  return out;
}

function rosePineColours() {
  const out = {};
  for (const variant of ['main', 'dawn']) {
    for (const [name, colour] of Object.entries(rosePine[variant])) out[`${variant}.${name}`] = cssColorToHex(`#${colour.hex}`);
  }
  return out;
}

const primerVars = (name) => {
  const css = readFileSync(join(THEMES, `${name}.css`), 'utf8');
  const block = css.slice(css.indexOf('{') + 1, css.indexOf('}'));
  return new Map([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
};

const BASE = { light: primerVars('light'), dark: primerVars('dark') };

const USED = (() => {
  const sources = [
    join(ROOT, 'node_modules/@primer/css/dist/core.css'),
    join(ROOT, 'node_modules/@primer/css/dist/product.css'),
    join(ROOT, 'src/styles/app.css'),
  ].map((f) => readFileSync(f, 'utf8'));
  const names = new Set(sources.flatMap((css) => [...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])));
  let grew = true;
  while (grew) {
    grew = false;
    for (const [k, val] of BASE.light) {
      if (!names.has(k)) continue;
      for (const m of val.matchAll(/var\((--[\w-]+)/g)) if (!names.has(m[1])) { names.add(m[1]); grew = true; }
    }
  }
  return names;
})();

const PRIMER_ROLES = {
  bg: 'bgColor-default', bgMuted: 'bgColor-muted', bgInset: 'bgColor-inset', bgHover: 'control-transparent-bgColor-hover', border: 'borderColor-default', borderMuted: 'borderColor-muted',
  fg: 'fgColor-default', fgMuted: 'fgColor-muted', accent: 'bgColor-accent-emphasis', success: 'bgColor-success-emphasis', attention: 'bgColor-attention-emphasis',
  severe: 'bgColor-severe-emphasis', danger: 'bgColor-danger-emphasis', done: 'bgColor-done-emphasis', sponsors: 'bgColor-sponsors-emphasis',
  header: 'header-bgColor', headerFg: 'header-fgColor-logo', onEmphasis: 'fgColor-onEmphasis',
};

function primerSwatches(theme, mode) {
  const vars = new Map([...BASE[mode], ...(theme ? primerVars(theme) : [])]);
  const resolve = (value, depth = 0) => {
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    return ref && depth < 8 ? resolve(vars.get(ref[1]), depth + 1) : value;
  };
  return Object.fromEntries(Object.entries(PRIMER_ROLES).map(([role, token]) => [role, cssColorToHex(resolve(vars.get(`--${token}`)))]));
}

const v = (name) => `var(--pal-${name})`;
const MAPPING = {
  'bgColor-default': v('bg'), 'bgColor-muted': v('bgMuted'), 'bgColor-inset': v('bgInset'),
  'bgColor-emphasis': v('header'), 'bgColor-inverse': v('fg'),
  'bgColor-neutral-muted': v('bgHover'), 'bgColor-neutral-emphasis': v('fgMuted'),
  'fgColor-default': v('fg'), 'fgColor-muted': v('fgMuted'), 'fgColor-onEmphasis': v('onEmphasis'), 'fgColor-link': v('accent'),
  'borderColor-default': v('border'), 'borderColor-muted': v('borderMuted'), 'borderColor-emphasis': v('fgMuted'),
  'borderColor-neutral-muted': v('borderMuted'),
  'focus-outlineColor': v('accent'),
  'header-bgColor': v('header'), 'header-fgColor-default': v('headerFg'), 'header-fgColor-logo': v('headerFg'), 'header-borderColor-divider': v('headerFg'),
  'underlineNav-borderColor-active': v('accent'),
  'overlay-bgColor': v('bg'), 'overlay-borderColor': v('border'),
  'button-default-bgColor-rest': v('bgMuted'), 'button-default-bgColor-hover': v('bgHover'), 'button-default-bgColor-active': v('bgHover'),
  'button-default-borderColor-rest': v('border'), 'button-default-borderColor-hover': v('border'), 'button-default-fgColor-rest': v('fg'),
  'button-primary-bgColor-rest': v('primary'), 'button-primary-bgColor-hover': v('primary'), 'button-primary-bgColor-active': v('primary'),
  'button-primary-borderColor-rest': v('primary'), 'button-primary-fgColor-rest': v('onEmphasis'),
  'button-danger-fgColor-rest': v('danger'), 'button-danger-bgColor-hover': v('danger'), 'button-danger-fgColor-hover': v('onEmphasis'),
  'button-danger-borderColor-hover': v('danger'),
  'control-bgColor-rest': v('bgMuted'), 'control-bgColor-hover': v('bgHover'), 'control-borderColor-rest': v('border'),
  'control-transparent-bgColor-hover': v('bgHover'), 'control-transparent-bgColor-active': v('bgHover'),
  'control-checked-bgColor-rest': v('accent'), 'control-checked-borderColor-rest': v('accent'),
};
for (const [token, hue] of [['accent', 'accent'], ['success', 'success'], ['attention', 'attention'], ['severe', 'severe'], ['danger', 'danger'], ['done', 'done'], ['sponsors', 'sponsors'], ['open', 'success'], ['closed', 'danger']]) {
  Object.assign(MAPPING, {
    [`bgColor-${token}-muted`]: v(`${hue}-tint`), [`bgColor-${token}-emphasis`]: v(hue),
    [`fgColor-${token}`]: v(hue),
    [`borderColor-${token}-muted`]: v(`${hue}-tint-border`), [`borderColor-${token}-emphasis`]: v(hue),
  });
}

const block = (id, mode, decls) => `:root[data-palette="${id}"][data-scheme="${mode}"] {\n${decls.map(([k, val]) => `  ${k}: ${val};`).join('\n')}\n}\n`;

export async function officialColours() {
  return {
    catppuccin: catppuccinColours(), nord: nordColours(), atom: await atomColours(),
    solarized: solarizedColours(), gruvbox: gruvboxColours(), 'rose-pine': rosePineColours(),
  };
}

export async function resolvePalettes() {
  const official = await officialColours();
  const resolved = {};
  for (const p of PALETTES) {
    if (p.group === 'GitHub') {
      resolved[p.id] = { light: primerSwatches(p.primer?.light, 'light'), dark: primerSwatches(p.primer?.dark, 'dark') };
      continue;
    }
    const table = official[p.id];
    if (!table) throw new Error(`No official source is loaded for ${p.id}`);
    resolved[p.id] = {};
    for (const mode of ['light', 'dark']) {
      resolved[p.id][mode] = Object.fromEntries(ROLES.map((role) => {
        const name = p.roles[mode][role];
        if (!table[name]) throw new Error(`${p.name} has no official colour called ${name}`);
        return [role, table[name]];
      }));
    }
  }
  return { official, resolved };
}

export async function buildOutputs() {
  const missing = Object.keys(MAPPING).filter((t) => !BASE.light.has(`--${t}`));
  if (missing.length) throw new Error(`Primer has no tokens named: ${missing.join(', ')}`);
  const { resolved } = await resolvePalettes();
  let css = '';
  for (const p of PALETTES) {
    for (const mode of ['light', 'dark']) {
      if (p.group === 'GitHub') {
        const theme = p.primer?.[mode];
        if (!theme) continue;
        css += block(p.id, mode, [...primerVars(theme)].filter(([k, val]) => BASE[mode].get(k) !== val && USED.has(k)));
        continue;
      }
      const c = resolved[p.id][mode];
      const decls = ROLES.map((role) => [`--pal-${role}`, c[role]]);
      for (const h of HUES) {
        const solid = c[h].slice(0, 7);
        decls.push([`--pal-${h}-tint`, `${solid}${TINT}`], [`--pal-${h}-tint-border`, `${solid}${TINT_BORDER}`]);
      }
      decls.push(['--pal-primary', c[p.primary || 'success']]);
      css += block(p.id, mode, decls);
    }
  }
  const mapping = Object.entries(MAPPING).map(([k, val]) => `  --${k}: ${val};`).join('\n');
  css += `:root[data-palette]:not([data-palette^="github"]) {\n${mapping}\n}\n`;
  return { css, json: `${JSON.stringify(resolved, null, 2)}\n` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { css, json } = await buildOutputs();
  if (process.argv.includes('--check')) {
    if (readFileSync(CSS_OUT, 'utf8') !== css || readFileSync(JSON_OUT, 'utf8') !== json) {
      console.error('Palette files are out of date. Run npm run palettes.');
      process.exit(1);
    }
  } else {
    writeFileSync(CSS_OUT, css);
    writeFileSync(JSON_OUT, json);
    console.log(`Wrote ${CSS_OUT} and ${JSON_OUT}`);
  }
}
