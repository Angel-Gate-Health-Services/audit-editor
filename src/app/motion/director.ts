import { animate } from 'motion/mini';
import { useSession, useStatus } from '../store/stores.ts';
import { ADMIN_TAB_ORDER, motionDirection, motionRoute, type MotionDirection } from '../navigation/motion-route.ts';
import { partsOf } from '../navigation/route.ts';
import { DISTANCE, DURATION, EASE_OUT, EASE_STANDARD, prefersReducedMotion } from './tokens.ts';

export type LayerScope = 'page' | 'outlet' | 'admin';

interface EnterPlan {
  key: string;
  direction: MotionDirection;
  at: number;
}

const AUDIT_TABS = [undefined, 'setup', 'general', 'pdf'];
const AUDIT_TAB_ORDER = ['setup', undefined, 'general', 'pdf'];
const PLAN_TTL = 1500;
const GHOST_NODE_LIMIT = 4000;

const plans = new Map<LayerScope, EnterPlan>();
let lastHash: string | null = null;

export const isAuditShell = (parts: string[]) => parts[0] === 'a' && AUDIT_TABS.includes(parts[2]);
export const isAdminTabs = (parts: string[]) => parts[0] === 'dashboard' && Boolean(parts[1]) && parts[1] !== 'site';

export function pageKeyFor(parts: string[], hash: string) {
  if (isAuditShell(parts)) return `audit:${parts[1]}`;
  if (isAdminTabs(parts)) return 'admin-tabs';
  return `app:${hash || '#/'}`;
}

export const auditTabKey = (parts: string[]) => parts[2] || 'people';

const LAYER_SELECTOR: Record<LayerScope, string> = {
  page: '#app > .PageView',
  outlet: '#app > .PageView .RouteOutlet',
  admin: '#app > .PageView .AdminTabBody',
};

const canAnimate = () => typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';

const orderDirection = (from: number, to: number): MotionDirection => (to > from ? 'forward' : to < from ? 'back' : 'replace');

export function motionAllowed() {
  return canAnimate() && !prefersReducedMotion() && !useStatus.getState().instant;
}

export function offsetFor(direction: MotionDirection, distance: number) {
  if (direction === 'forward') return { x: distance, y: 0 };
  if (direction === 'back') return { x: -distance, y: 0 };
  if (direction === 'replace') return { x: 0, y: DISTANCE.rise };
  return { x: 0, y: 0 };
}

function stripIdentity(root: HTMLElement, source: HTMLElement) {
  const sourceFields = source.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select').forEach((field, i) => {
    const original = sourceFields[i];
    if (original && field.type !== 'file' && field.type !== 'password') field.value = original.value;
    if (field.type === 'password') field.value = '';
  });
  for (const el of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    el.removeAttribute('id');
    el.removeAttribute('for');
    el.removeAttribute('name');
    el.removeAttribute('autofocus');
    el.removeAttribute('data-autofocus');
    el.removeAttribute('aria-live');
    el.removeAttribute('role');
    el.removeAttribute('tabindex');
  }
  root.querySelectorAll('iframe').forEach((frame) => {
    const placeholder = document.createElement('div');
    placeholder.style.height = `${frame.getBoundingClientRect().height}px`;
    frame.replaceWith(placeholder);
  });
}

export function clearGhosts() {
  document.querySelectorAll('.RouteGhost').forEach((el) => el.remove());
}

export function ghost(source: Element | null, direction: MotionDirection) {
  clearGhosts();
  if (!(source instanceof HTMLElement)) return;
  if (source.getElementsByTagName('*').length > GHOST_NODE_LIMIT) return;
  const rect = source.getBoundingClientRect();
  if (!rect.height || !rect.width || rect.bottom < 0 || rect.top > window.innerHeight) return;
  const startOpacity = Math.min(1, Number(getComputedStyle(source).opacity) || 1);
  const clone = source.cloneNode(true) as HTMLElement;
  stripIdentity(clone, source);
  clone.setAttribute('aria-hidden', 'true');
  clone.inert = true;
  clone.classList.add('RouteGhost');
  Object.assign(clone.style, {
    position: 'fixed',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${Math.min(rect.height, window.innerHeight - rect.top + 40)}px`,
    margin: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '0',
  });
  document.body.appendChild(clone);
  const { x, y } = offsetFor(direction, DISTANCE.ghost);
  const remove = () => clone.remove();
  const timer = setTimeout(remove, 800);
  const controls = animate(
    clone,
    { opacity: [startOpacity, 0], transform: ['translate3d(0, 0, 0)', `translate3d(${-x * 0.7}px, ${-y * 0.5}px, 0)`] },
    { duration: DURATION.exit, ease: EASE_STANDARD },
  );
  void controls.finished.then(() => {
    clearTimeout(timer);
    remove();
  }, remove);
}

function plan(scope: LayerScope, key: string, direction: MotionDirection) {
  plans.set(scope, { key, direction, at: performance.now() });
}

export function onRouteChange(nextHash: string) {
  const previousHash = lastHash;
  lastHash = nextHash;
  if (previousHash === null || previousHash === nextHash) return;
  plans.clear();
  if (!motionAllowed() || !useSession.getState().profile) return;
  const prev = partsOf(previousHash);
  const next = partsOf(nextHash);
  if (prev[2] === 'pdf' || next[2] === 'pdf' || document.querySelector('#app iframe')) return;
  const prevKey = pageKeyFor(prev, previousHash);
  const nextKey = pageKeyFor(next, nextHash);
  if (prevKey !== nextKey) {
    const direction = motionDirection(motionRoute({ checked: true, signedIn: true, parts: prev }), motionRoute({ checked: true, signedIn: true, parts: next }));
    ghost(document.querySelector(LAYER_SELECTOR.page), direction);
    plan('page', nextKey, direction);
    return;
  }
  if (isAuditShell(prev) && isAuditShell(next) && auditTabKey(prev) !== auditTabKey(next)) {
    const direction = orderDirection(AUDIT_TAB_ORDER.indexOf(prev[2]), AUDIT_TAB_ORDER.indexOf(next[2]));
    ghost(document.querySelector(LAYER_SELECTOR.outlet), direction);
    plan('outlet', auditTabKey(next), direction);
    return;
  }
  if (isAdminTabs(prev) && isAdminTabs(next) && prev[1] !== next[1]) {
    const direction = orderDirection(ADMIN_TAB_ORDER.indexOf(prev[1]), ADMIN_TAB_ORDER.indexOf(next[1]));
    ghost(document.querySelector(LAYER_SELECTOR.admin), direction);
    plan('admin', next[1], direction);
  }
}

export function onSignedIn(hash: string) {
  lastHash = hash;
  plans.clear();
  if (!motionAllowed()) return;
  ghost(document.querySelector(`${LAYER_SELECTOR.page}.PageView--auth`), 'fade');
  plan('page', pageKeyFor(partsOf(hash), hash), 'fade');
}

export function onSignedOut(hash: string) {
  plans.clear();
  clearGhosts();
  lastHash = hash;
}

interface RouterLike {
  state: { location: { pathname: string } };
  subscribe: (fn: (state: { location: { pathname: string } }) => void) => () => void;
}

let uninstall: (() => void) | null = null;

export function installMotionDirector(router: RouterLike) {
  uninstall?.();
  const hashOf = (pathname: string) => `#${pathname || '/'}`;
  lastHash = hashOf(router.state.location.pathname);
  const offRouter = router.subscribe((state) => onRouteChange(hashOf(state.location.pathname)));
  const offSession = useSession.subscribe((s, p) => {
    if (s.profile && !p.profile && p.checked) onSignedIn(hashOf(router.state.location.pathname));
    else if (!s.profile && p.profile) onSignedOut(hashOf(router.state.location.pathname));
  });
  uninstall = () => {
    offRouter();
    offSession();
    plans.clear();
  };
  return uninstall;
}

export function takeEnter(scope: LayerScope, key: string) {
  const found = plans.get(scope);
  if (!found || found.key !== key || performance.now() - found.at > PLAN_TTL) return null;
  plans.delete(scope);
  return found;
}

export function enterLayer(el: HTMLElement, direction: MotionDirection, distance = DISTANCE.page, stagger = true) {
  if (direction === 'none') return;
  const { x, y } = offsetFor(direction, distance);
  const clear = () => {
    clearTimeout(timer);
    el.style.removeProperty('transform');
    el.style.removeProperty('opacity');
    el.style.removeProperty('will-change');
  };
  const timer = setTimeout(clear, 1200);
  el.style.willChange = 'transform, opacity';
  const running: Promise<unknown>[] = [
    animate(el, { opacity: [0, 1] }, { duration: DURATION.enterFade, ease: EASE_STANDARD, delay: DURATION.enterDelay }).finished,
  ];
  if (x || y) {
    running.push(animate(
      el,
      { transform: [`translate3d(${x}px, ${y}px, 0)`, 'translate3d(0, 0, 0)'] },
      { duration: DURATION.enter, ease: EASE_OUT },
    ).finished);
  }
  void Promise.all(running).then(clear, clear);
  if (stagger) staggerIn(el);
}

export function staggerIn(root: HTMLElement) {
  const groups = root.querySelectorAll<HTMLElement>('[data-stagger]');
  groups.forEach((group) => {
    if (group.getBoundingClientRect().top > window.innerHeight) return;
    const items = Array.from(group.children).slice(0, 12) as HTMLElement[];
    items.forEach((item, i) => {
      const done = () => {
        item.style.removeProperty('opacity');
        item.style.removeProperty('transform');
      };
      void animate(
        item,
        { opacity: [0, 1], transform: [`translate3d(0, ${DISTANCE.rise}px, 0)`, 'translate3d(0, 0, 0)'] },
        { duration: DURATION.reveal, ease: EASE_OUT, delay: DURATION.enterDelay + 0.03 + i * DURATION.stagger },
      ).finished.then(done, done);
    });
  });
}
