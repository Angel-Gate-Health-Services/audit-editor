import { useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from 'react';

export const fieldId = (bind: string) => 'f-' + bind.replace(/[^\w]/g, '-');

type Control = HTMLInputElement | HTMLTextAreaElement;

export function useDraft(value: string, onCommit: (next: string) => void) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const composing = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  return {
    value: draft,
    onChange(ev: ChangeEvent<Control>) {
      setDraft(ev.target.value);
      if (!composing.current) onCommit(ev.target.value);
    },
    onFocus() {
      focused.current = true;
    },
    onBlur() {
      focused.current = false;
      setDraft(value);
    },
    onCompositionStart() {
      composing.current = true;
    },
    onCompositionEnd(ev: { currentTarget: Control }) {
      composing.current = false;
      onCommit(ev.currentTarget.value);
    },
  };
}

export interface FieldProps {
  bind: string;
  label: ReactNode;
  value: string;
  onCommit: (value: string) => void;
  type?: string;
  placeholder?: string;
  hint?: ReactNode;
  wide?: boolean;
  optional?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  input?: InputHTMLAttributes<HTMLInputElement> & InputHTMLAttributes<HTMLTextAreaElement>;
}

export function Field({ bind, label, value, onCommit, type = 'text', placeholder = '', hint, wide = false, optional = false, autoFocus = false, disabled, readOnly, input = {} }: FieldProps) {
  const id = fieldId(bind);
  const draft = useDraft(value, onCommit);
  const common = {
    className: 'form-control',
    id,
    placeholder,
    'aria-describedby': hint ? `${id}-caption` : undefined,
    'data-autofocus': autoFocus ? '' : undefined,
    disabled,
    readOnly,
    ...input,
    ...draft,
  };
  return (
    <div className={`FormField ${wide ? 'wide' : ''}`}>
      <label className="FormField-label" htmlFor={id}>{label}{optional && <span className="FormField-optional">(optional)</span>}</label>
      {type === 'textarea' ? <textarea {...common} /> : <input {...common} type={type} />}
      {hint && <p className="FormField-caption" id={`${id}-caption`}>{hint}</p>}
    </div>
  );
}
