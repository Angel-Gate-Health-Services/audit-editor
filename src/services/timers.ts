export type TimerHandle = unknown;
export type Schedule = (fn: () => unknown) => TimerHandle;
export type ScheduleEvery = (fn: () => void, ms: number) => TimerHandle;
export type Delay = (fn: () => void, ms: number) => TimerHandle;
export type Cancel = (handle: TimerHandle) => void;

export const every = (ms: number): Schedule => (fn) => setInterval(() => { void fn(); }, ms);
export const cancelEvery: Cancel = (handle) => clearInterval(handle as ReturnType<typeof setInterval>);
export const delayBy: Delay = (fn, ms) => setTimeout(fn, ms);
export const cancelDelay: Cancel = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>);
