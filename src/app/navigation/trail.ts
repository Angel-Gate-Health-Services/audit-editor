export type Crumb = [string, string?];

interface Shown {
  hash: string;
  crumbs: Crumb[];
}

interface RouterLike {
  state: { historyAction: string; location: { pathname: string; key: string } };
  subscribe: (fn: (state: RouterLike['state']) => void) => () => void;
}

const STORE_KEY = 'aghs-trail';
const LIMIT = 80;
const MAX_PARENTS = 3;

let shown = new Map<string, Shown>();
let origin = new Map<string, string>();
let trails = new Map<string, Crumb[]>();
let currentId = '';
let enabled = false;

const entryId = (key: string, hash: string) => `${key}|${hash}`;

const hashOf = (pathname: string) => `#${pathname || '/'}`;
const clean = (hash: string) => (hash === '#' ? '#/' : hash);

function trim<T>(map: Map<string, T>) {
  while (map.size > LIMIT) map.delete(map.keys().next().value!);
}

function save() {
  if (!enabled) return;
  trim(shown);
  trim(origin);
  trim(trails);
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({ shown: [...shown], origin: [...origin], trails: [...trails] }));
  } catch {
    return;
  }
}

function restore() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as { shown?: [string, Shown][]; origin?: [string, string][]; trails?: [string, Crumb[]][] };
    shown = new Map(data.shown || []);
    origin = new Map(data.origin || []);
    trails = new Map(data.trails || []);
  } catch {
    return;
  }
}

function titleCrumbs(hash: string): Crumb[] | null {
  if (hash === '#/') return null;
  const title = (typeof document === 'undefined' ? '' : document.title).replace(/\s·\sAuditing Department$/, '').trim();
  return title && title !== 'Auditing Department' ? [['Home', '#/'], [title]] : null;
}

export function installTrail(router: RouterLike) {
  restore();
  currentId = entryId(router.state.location.key, clean(hashOf(router.state.location.pathname)));
  return router.subscribe((state) => {
    const nextId = entryId(state.location.key, clean(hashOf(state.location.pathname)));
    if (nextId === currentId) return;
    const leavingId = currentId;
    currentId = nextId;
    if (!enabled) return;
    const leavingHash = leavingId.slice(leavingId.indexOf('|') + 1);
    if (!shown.has(leavingId)) {
      const fallback = titleCrumbs(leavingHash);
      if (fallback) shown.set(leavingId, { hash: leavingHash, crumbs: fallback });
    }
    if (state.historyAction === 'PUSH') origin.set(nextId, leavingId);
    else if (state.historyAction === 'REPLACE') {
      const from = origin.get(leavingId);
      if (from) origin.set(nextId, from);
    }
    save();
  });
}

export function recordCrumbs(key: string, hash: string, crumbs: Crumb[]) {
  if (!enabled) return;
  const id = entryId(key, clean(hash));
  const prev = shown.get(id);
  if (prev && JSON.stringify(prev.crumbs) === JSON.stringify(crumbs)) return;
  shown.set(id, { hash: clean(hash), crumbs });
  save();
}

export function parentsFor(key: string, rawHash: string, defaults: Crumb[]): Crumb[] {
  if (!enabled) return defaults;
  const hash = clean(rawHash);
  const id = entryId(key, hash);
  const kept = trails.get(id);
  if (kept) return kept;
  const from = origin.get(id);
  const source = from ? shown.get(from) : null;
  let parents = defaults;
  if (source && source.hash !== hash && source.hash !== '#/' && source.crumbs.length) {
    const linked: Crumb[] = source.crumbs.map(([label, link], i) => (i === source.crumbs.length - 1 ? [label, source.hash] : [label, link]));
    const loop = linked.findIndex(([, link]) => link && clean(link) === hash);
    const chain = loop >= 0 ? linked.slice(0, loop) : linked;
    const [first, ...rest] = chain;
    parents = first && first[1] === '#/' ? [first, ...rest.slice(-(MAX_PARENTS - 1))] : chain.slice(-MAX_PARENTS);
    if (!parents.length) parents = defaults;
  }
  trails.set(id, parents);
  save();
  return parents;
}

export function enableTrail() {
  enabled = true;
}

export function resetTrail() {
  enabled = false;
  shown = new Map();
  origin = new Map();
  trails = new Map();
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    return;
  }
}
