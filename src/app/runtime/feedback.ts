import { useStatus } from '../store/stores.ts';
import { timers } from './services.ts';

let toastId = 0;

export function showToast(message: string) {
  toastId += 1;
  useStatus.setState({ toast: { id: toastId, message } });
  clearTimeout(timers.toast);
  timers.toast = setTimeout(() => useStatus.setState({ toast: null }), 5000);
}

export const setSaveState = (saveState: string) => useStatus.setState({ saveState });

export const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export function scrollToFlash(selector: string, block: ScrollLogicalPosition) {
  requestAnimationFrame(() => {
    document.querySelector(`#app ${selector}`)?.scrollIntoView({ block, behavior: reducedMotion() ? 'instant' : 'smooth' });
  });
}
