import { create } from 'zustand';

export type DialogTone = 'danger' | 'attention' | 'info';

export interface DialogButton {
  label: string;
  value: boolean;
  primary?: boolean;
  danger?: boolean;
  focus?: boolean;
}

export interface DialogRequest {
  id: number;
  title: string;
  message: string;
  tone: DialogTone;
  buttons: DialogButton[];
  resolve: (value: boolean) => void;
}

export const useDialogs = create(() => ({ current: null as DialogRequest | null }));

let queue: Promise<unknown> = Promise.resolve();
let nextId = 0;

const hostReady = () => typeof document !== 'undefined' && typeof globalThis.HTMLDialogElement === 'function' && dialogHostMounted;

let dialogHostMounted = false;
export const setDialogHostMounted = (mounted: boolean) => { dialogHostMounted = mounted; };

function show(request: Omit<DialogRequest, 'id' | 'resolve'>) {
  const run = () => new Promise<boolean>((resolve) => {
    nextId += 1;
    useDialogs.setState({ current: { ...request, id: nextId, resolve } });
  });
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

export function askConfirm(message: string, { title = 'Are you sure?', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false } = {}) {
  if (!hostReady()) return Promise.resolve(Boolean(globalThis.confirm?.(message)));
  return show({
    title, message, tone: danger ? 'danger' : 'attention',
    buttons: [
      { label: cancelLabel, value: false, focus: danger },
      { label: confirmLabel, value: true, primary: true, danger, focus: !danger },
    ],
  });
}

export function showAlert(message: string, { title = 'Something went wrong', buttonLabel = 'OK', tone = 'danger' }: { title?: string; buttonLabel?: string; tone?: DialogTone } = {}) {
  if (!hostReady()) {
    globalThis.alert?.(message);
    return Promise.resolve();
  }
  return show({ title, message, tone, buttons: [{ label: buttonLabel, value: true, primary: true, focus: true }] }).then(() => {});
}
