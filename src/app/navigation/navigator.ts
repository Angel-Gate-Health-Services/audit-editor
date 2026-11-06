import { href } from './route.ts';

type Navigate = (to: string, options?: { replace?: boolean }) => void;

let navigateImpl: Navigate | null = null;

export const setNavigator = (fn: Navigate | null) => { navigateImpl = fn; };

export function navigateHash(hash: string, options: { replace?: boolean } = {}) {
  const path = hash.replace(/^#/, '') || '/';
  if (navigateImpl) navigateImpl(path, options);
  else if (options.replace) history.replaceState(null, '', hash);
  else location.hash = hash;
}

export const go = (...parts: string[]) => navigateHash(href(...parts));
