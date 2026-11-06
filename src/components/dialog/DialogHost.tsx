import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons/Icon.tsx';
import { setDialogHostMounted, useDialogs } from './dialog.ts';

export function DialogHost() {
  const current = useDialogs((s) => s.current);
  const ref = useRef<HTMLDialogElement>(null);
  const result = useRef(false);
  const [closing, setClosing] = useState(false);
  const focusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDialogHostMounted(true);
    return () => setDialogHostMounted(false);
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!current || !dialog) return;
    result.current = false;
    setClosing(false);
    if (!dialog.open) dialog.showModal();
    queueMicrotask(() => focusRef.current?.focus());
  }, [current]);

  if (!current) return null;

  const finish = (value: boolean) => {
    if (closing) return;
    result.current = value;
    setClosing(true);
    setTimeout(() => ref.current?.close(), 140);
  };

  const onClose = () => {
    const done = current;
    useDialogs.setState({ current: null });
    setClosing(false);
    done.resolve(result.current);
  };

  const icon = current.tone === 'danger' ? 'alert' : current.tone === 'info' ? 'info' : 'issue-opened';
  return (
    <dialog
      ref={ref}
      key={current.id}
      className={`AppDialog AppDialog--${current.tone}${closing ? ' is-closing' : ''}`}
      aria-labelledby="app-dialog-title"
      aria-describedby="app-dialog-message"
      onCancel={(ev) => { ev.preventDefault(); finish(false); }}
      onClick={(ev) => { if (ev.target === ref.current) finish(false); }}
      onClose={onClose}
    >
      <div className="AppDialog-header">
        <span className="AppDialog-icon"><Icon name={icon} /></span>
        <h2 className="AppDialog-title" id="app-dialog-title">{current.title}</h2>
      </div>
      <div className="AppDialog-body">
        <p className="AppDialog-message" id="app-dialog-message">{current.message}</p>
        <div className="AppDialog-actions">
          {current.buttons.map((b) => (
            <button
              key={b.label}
              ref={b.focus ? focusRef : undefined}
              type="button"
              className={`btn ${b.primary ? (b.danger ? 'btn-danger' : 'btn-primary') : ''}`}
              onClick={() => finish(b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </dialog>
  );
}
