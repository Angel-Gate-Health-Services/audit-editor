import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = 'dist';
const BUDGETS = {
  initialJsGzip: 250 * 1024,
  initialCssGzip: 80 * 1024,
  largestLazyJsGzip: 160 * 1024,
};

const manifest = JSON.parse(readFileSync(join(DIST, '.vite', 'manifest.json'), 'utf8'));
const size = (file) => {
  const bytes = readFileSync(join(DIST, file));
  return { raw: statSync(join(DIST, file)).size, gzip: gzipSync(bytes, { level: 9 }).length };
};

const entry = Object.values(manifest).find((chunk) => chunk.isEntry);
const initial = new Set();
const css = new Set();
const visit = (key) => {
  const chunk = manifest[key];
  if (!chunk || initial.has(chunk.file)) return;
  initial.add(chunk.file);
  for (const file of chunk.css || []) css.add(file);
  for (const next of chunk.imports || []) visit(next);
};
visit(Object.keys(manifest).find((key) => manifest[key] === entry));

const lazy = Object.values(manifest).filter((chunk) => chunk.file.endsWith('.js') && !initial.has(chunk.file));
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const rows = [];
let initialJs = { raw: 0, gzip: 0 };
for (const file of initial) {
  const s = size(file);
  initialJs = { raw: initialJs.raw + s.raw, gzip: initialJs.gzip + s.gzip };
  rows.push(['initial', file, s]);
}
let initialCss = { raw: 0, gzip: 0 };
for (const file of css) {
  const s = size(file);
  initialCss = { raw: initialCss.raw + s.raw, gzip: initialCss.gzip + s.gzip };
  rows.push(['css', file, s]);
}
let largestLazy = 0;
for (const chunk of lazy) {
  const s = size(chunk.file);
  largestLazy = Math.max(largestLazy, s.gzip);
  rows.push(['lazy', `${chunk.file}${chunk.name ? ` (${chunk.name})` : ''}`, s]);
}
for (const [kind, file, s] of rows) console.log(`${kind.padEnd(8)} ${kb(s.raw).padStart(10)} ${kb(s.gzip).padStart(10)} gz  ${file}`);
console.log(`\ninitial JS ${kb(initialJs.raw)} (${kb(initialJs.gzip)} gz), initial CSS ${kb(initialCss.raw)} (${kb(initialCss.gzip)} gz), largest lazy chunk ${kb(largestLazy)} gz`);

const failures = [];
if (initialJs.gzip > BUDGETS.initialJsGzip) failures.push(`initial JS ${kb(initialJs.gzip)} gz exceeds ${kb(BUDGETS.initialJsGzip)}`);
if (initialCss.gzip > BUDGETS.initialCssGzip) failures.push(`initial CSS ${kb(initialCss.gzip)} gz exceeds ${kb(BUDGETS.initialCssGzip)}`);
if (largestLazy > BUDGETS.largestLazyJsGzip) failures.push(`a lazy chunk ${kb(largestLazy)} gz exceeds ${kb(BUDGETS.largestLazyJsGzip)}`);
if (failures.length) {
  console.error(`\nBundle budget exceeded:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
