export type Bezier = [number, number, number, number];

export const EASE_OUT: Bezier = [0.16, 1, 0.3, 1];
export const EASE_OUT_SOFT: Bezier = [0.22, 1, 0.36, 1];
export const EASE_IN: Bezier = [0.4, 0, 1, 1];
export const EASE_STANDARD: Bezier = [0.2, 0, 0, 1];

export const DURATION = {
  enter: 0.42,
  enterFade: 0.22,
  enterDelay: 0.07,
  exit: 0.11,
  tab: 0.3,
  reveal: 0.26,
  stagger: 0.028,
  micro: 0.18,
};

export const DISTANCE = {
  page: 18,
  tab: 12,
  rise: 8,
  ghost: 10,
};

export const SPRING = {
  press: { type: 'spring' as const, stiffness: 700, damping: 32, mass: 0.6 },
  pop: { type: 'spring' as const, stiffness: 520, damping: 26, mass: 0.7 },
  soft: { type: 'spring' as const, stiffness: 360, damping: 34, mass: 0.9 },
};

export const bezier = ([a, b, c, d]: Bezier) => `cubic-bezier(${a}, ${b}, ${c}, ${d})`;

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
