import { useEffect, useRef, useState } from 'react';
import { SHIFT_MAX_HOURS, SHIFT_MIN_HOURS, fmtShiftLength, fmtTime, parseTime, shiftEndOptions, shiftEndRange, shiftLengthOk, shiftMinutes } from '../../../domain/audits/model.ts';
import { useUi } from '../../../app/store/stores.ts';
import { auditEditingBlocked } from '../../../app/runtime/audit-access.ts';
import { editEntry } from '../audit-actions.ts';
import type { Entry } from '../../../types/audit.ts';

export const TIME_HINT = 'Type it any way: 7a, 7 pm, 3p or 15:00.';

export function shiftEndHint(start: string, end: string) {
  if (!start) return 'Enter the shift start first.';
  if (end && shiftLengthOk(start, end)) return `Shift length: ${fmtShiftLength(shiftMinutes(start, end)!)}.`;
  const range = shiftEndRange(start)!;
  return `${SHIFT_MIN_HOURS} to ${SHIFT_MAX_HOURS} hours after the start: ${fmtTime(range.earliest)} to ${fmtTime(range.latest)}.`;
}

interface Caption { text: string; tone: '' | 'is-error' | 'is-warning' }

function TimeInput({ id, label, value, list, caption, disabled, placeholder, invalid, onFocusText, onCommitText }: {
  id: string; label: string; value: string; list: string; caption: Caption; disabled: boolean; placeholder: string; invalid: boolean;
  onFocusText: () => void; onCommitText: (text: string, previous: string, setText: (text: string) => void) => void;
}) {
  const [text, setText] = useState(fmtTime(value));
  const previous = useRef('');
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmtTime(value));
  }, [value]);
  return (
    <div className="FormField">
      <label className="FormField-label" htmlFor={id}>{label}</label>
      <input className="form-control" id={id} type="text" value={text} placeholder={placeholder} list={list} autoComplete="off" spellCheck={false}
        aria-describedby={`${id}-caption`} aria-invalid={invalid ? 'true' : undefined} disabled={disabled}
        onFocus={() => {
          focused.current = true;
          previous.current = text;
          setText('');
          onFocusText();
        }}
        onChange={(ev) => setText(ev.target.value)}
        onBlur={(ev) => {
          focused.current = false;
          onCommitText(ev.target.value, previous.current, setText);
        }} />
      <p className={`FormField-caption${caption.tone ? ` ${caption.tone}` : ''}`} id={`${id}-caption`}>{caption.text}</p>
    </div>
  );
}

export function EntryTimes({ entry, locked }: { entry: Entry; locked: boolean }) {
  const [startCaption, setStartCaption] = useState<Caption>({ text: TIME_HINT, tone: '' });
  const [startInvalid, setStartInvalid] = useState(false);
  const [endCaption, setEndCaption] = useState<Caption>({ text: shiftEndHint(entry.shiftStart, entry.shiftEnd), tone: '' });
  const [endInvalid, setEndInvalid] = useState(false);
  const start = entry.shiftStart;
  const clearFormError = () => { if (useUi.getState().error) useUi.setState({ error: '' }); };

  const commit = (path: 'shiftStart' | 'shiftEnd', text: string, previous: string, setText: (text: string) => void) => {
    const setCaption = path === 'shiftStart' ? setStartCaption : setEndCaption;
    const setInvalid = path === 'shiftStart' ? setStartInvalid : setEndInvalid;
    if (auditEditingBlocked()) return;
    if (!text.trim()) {
      setText(previous || '');
      return;
    }
    const time = parseTime(text);
    if (time === null) {
      setInvalid(true);
      setCaption({ text: 'That isn’t a time. Try 7a, 7 pm or 15:00.', tone: 'is-error' });
      return;
    }
    if (path === 'shiftEnd' && !shiftLengthOk(entry.shiftStart, time)) {
      const range = shiftEndRange(entry.shiftStart);
      setInvalid(true);
      setCaption({
        text: range
          ? `A shift is ${SHIFT_MIN_HOURS} to ${SHIFT_MAX_HOURS} hours long. Pick an end time from ${fmtTime(range.earliest)} to ${fmtTime(range.latest)}.`
          : 'Enter the shift start first.',
        tone: 'is-error',
      });
      return;
    }
    let cleared = false;
    const saved = editEntry((e) => {
      e[path] = time;
      if (path === 'shiftStart' && e.shiftEnd && !shiftLengthOk(e.shiftStart, e.shiftEnd)) {
        e.shiftEnd = '';
        cleared = true;
      }
    }, time);
    if (!saved) return;
    setText(fmtTime(time));
    setInvalid(false);
    if (path === 'shiftEnd') {
      setCaption({ text: shiftEndHint(entry.shiftStart, time), tone: '' });
    } else {
      setCaption({ text: TIME_HINT, tone: '' });
      setEndInvalid(false);
      setEndCaption(cleared
        ? { text: `The end time was cleared because a shift is ${SHIFT_MIN_HOURS} to ${SHIFT_MAX_HOURS} hours long. ${shiftEndHint(time, '')}`, tone: 'is-warning' }
        : { text: shiftEndHint(time, cleared ? '' : entry.shiftEnd), tone: '' });
    }
    clearFormError();
  };

  return (
    <>
      <TimeInput id="f-entry-shiftStart" label="Shift start" value={entry.shiftStart} list="time-options" caption={startCaption} invalid={startInvalid}
        disabled={locked} placeholder="e.g. 7:00 AM" onFocusText={() => {}} onCommitText={(text, previous, setText) => commit('shiftStart', text, previous, setText)} />
      <TimeInput id="f-entry-shiftEnd" label="Shift end" value={entry.shiftEnd} list="shift-end-options" caption={endCaption} invalid={endInvalid}
        disabled={locked || !start} placeholder={start ? `e.g. ${fmtTime(shiftEndRange(start)!.earliest)}` : 'Start time first'}
        onFocusText={() => {}} onCommitText={(text, previous, setText) => commit('shiftEnd', text, previous, setText)} />
      <datalist id="time-options">{Array.from({ length: 24 }, (_, h) => <option key={h} value={fmtTime(`${String(h).padStart(2, '0')}:00`)} />)}</datalist>
      <datalist id="shift-end-options">{shiftEndOptions(start).map((t) => <option key={t} value={fmtTime(t)} label={fmtShiftLength(shiftMinutes(start, t)!)} />)}</datalist>
    </>
  );
}
