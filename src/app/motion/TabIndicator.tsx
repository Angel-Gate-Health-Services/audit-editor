import { useLayoutEffect, useRef } from 'react';
import { animate } from 'motion/mini';
import { DURATION, EASE_OUT, prefersReducedMotion } from './tokens.ts';

const placement = (item: HTMLElement) => `translateX(${item.offsetLeft}px) scaleX(${item.offsetWidth})`;

const activeItem = (bar: HTMLElement) => bar.parentElement?.querySelector<HTMLElement>('[aria-current="page"]') ?? null;

function sync(bar: HTMLElement) {
  const item = activeItem(bar);
  if (!item) {
    bar.style.opacity = '0';
    return false;
  }
  bar.style.transform = placement(item);
  bar.style.opacity = '1';
  return true;
}

const sliding = (bar: HTMLElement) => bar.getAnimations?.().some((a) => a.playState === 'running') ?? false;

export function TabIndicator({ activeKey }: { activeKey: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(false);
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const from = shown.current ? getComputedStyle(bar).transform : '';
    shown.current = sync(bar);
    if (!shown.current || !from || from === 'none' || typeof bar.animate !== 'function' || prefersReducedMotion()) return;
    const target = bar.style.transform;
    void animate(bar, { transform: [from, target] }, { duration: DURATION.tab, ease: EASE_OUT }).finished.then(() => {
      if (ref.current === bar) sync(bar);
    }, () => undefined);
  }, [activeKey]);
  useLayoutEffect(() => {
    const bar = ref.current;
    const nav = bar?.parentElement;
    if (!bar || !nav || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!sliding(bar)) shown.current = sync(bar);
    });
    observer.observe(nav);
    nav.querySelectorAll('.UnderlineNav-item').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return <span ref={ref} className="UnderlineNav-indicator" aria-hidden="true" />;
}
