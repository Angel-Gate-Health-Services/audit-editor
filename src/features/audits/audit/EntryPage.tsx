import { useEffect } from 'react';
import { useParams } from 'react-router';
import {
  addDays, allEntries, coveredReason, entryFlagged, entryReason, fmtDate, fmtRange, generatedReason, isFlagged, noSubmissionOn, parseISO,
  payPeriodAt, payPeriodIndexFor, shiftLabel, shiftLengthOk, todayISO,
} from '../../../domain/audits/model.ts';
import { QUESTIONS, REASON_MAX } from '../../../domain/audits/config.ts';
import { Icon } from '../../../components/icons/Icon.tsx';
import { Breadcrumbs, ErrorBox, plural, useTitle } from '../../../components/ui/basics.tsx';
import { Field, useDraft } from '../../../components/ui/Field.tsx';
import { useData, useSession, useUi } from '../../../app/store/stores.ts';
import { action } from '../../../app/runtime/actions.ts';
import { activeEmployeeNames, isEmployee, refreshEmployees } from '../../../app/runtime/people.ts';
import { ensureIndividual, livePosition } from '../../../app/runtime/audit-access.ts';
import { href } from '../../../app/navigation/route.ts';
import { MissingPage } from '../../../app/shell/pages.tsx';
import {
  ENTRY_STEPS, addAuthorAsEmployee, addEntry, answer, editEntry, entryNext, pickShiftDate, resetReason, toggleReason,
} from '../audit-actions.ts';
import { auditLabel } from './AuditTabsLayout.tsx';
import { EntryTimes } from './EntryTimes.tsx';
import { IndividualPage } from './IndividualPage.tsx';
import { useAuditContext, useLock } from './context.tsx';
import type { Answer, Audit, Entry, Individual, Question } from '../../../types/audit.ts';

const next = action('entryNext', entryNext);
const add = action('addEntry', addEntry);
const pick = action('pickShiftDate', pickShiftDate);
const choose = action('answer', answer);
const toggle = action('toggleReason', toggleReason);
const reset = action('resetReason', resetReason);
const addAuthor = action('addAuthorAsEmployee', addAuthorAsEmployee);


function AuthorHint({ author }: { author: string }) {
  const employees = useData((s) => s.employees);
  const admin = useSession((s) => Boolean(s.profile?.is_admin));
  const typed = (author || '').trim();
  const haveList = (employees || []).length > 0;
  const warn = Boolean(typed && haveList && !isEmployee(typed));
  let body;
  if (!haveList) body = admin ? 'Add employees in the admin dashboard to choose names from a list.' : 'Type the staff member’s full name.';
  else if (warn) body = <><Icon name="alert" size={12} /> Not on the employee list. Check the spelling{admin ? <>, or <button className="LinkBtn" onClick={() => addAuthor()}>add {typed} to employees</button></> : null}.</>;
  else body = 'Type to search, or pick from the list.';
  return <p className={`FormField-caption ${warn ? 'is-warning' : ''}`} id="f-entry-author-caption">{body}</p>;
}

function ShiftCalendar({ audit, name, entry, locked }: { audit: Audit; name: string; entry: Entry; locked: boolean }) {
  const lock = useLock();
  if (!audit.payStart) {
    return <Field bind="entry:date" label="Submission date" type="date" value={entry.date} wide disabled={locked} onCommit={(value) => editEntry((e) => { e.date = value; }, value)} />;
  }
  const days = Array.from({ length: 14 }, (_, i) => addDays(audit.payStart, i));
  const period = payPeriodAt(payPeriodIndexFor(audit.payStart));
  const today = todayISO();
  const ind: Individual | null = Object.hasOwn(audit.individuals, name) ? audit.individuals[name] : null;
  const shiftsOn: Record<string, number> = {};
  for (const other of ind?.entries || []) {
    if (other.id !== entry.id && !other.allShifts && other.date) shiftsOn[other.date] = (shiftsOn[other.date] || 0) + 1;
  }
  const long = (iso: string) => parseISO(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const outside = entry.date && !days.includes(entry.date);
  const noSubmission = Boolean(entry.date && noSubmissionOn(ind, entry.date));
  return (
    <div className="FormField wide">
      <span className="FormField-label" id="shift-date-label">Submission date</span>
      <div className="ShiftCal" role="group" aria-labelledby="shift-date-label">
        <div className="ShiftCal-head">
          <span><Icon name="calendar" /> Pay period #{period.number} · {fmtRange(audit.payStart, audit.payEnd)}</span>
          <span className="ShiftCal-picked">{entry.date && !outside ? long(entry.date) : 'Pick a day'}</span>
        </div>
        <div className="ShiftCal-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => <span key={w} className="ShiftCal-dow" aria-hidden="true">{w}</span>)}
          {days.map((iso, i) => {
            const d = parseISO(iso);
            const count = shiftsOn[iso] || 0;
            const blocked = noSubmissionOn(ind, iso) && entry.date !== iso;
            const label = `${long(iso)}${blocked ? ', marked as no submission' : ''}${count ? `, ${plural(count, 'shift')} already added` : ''}${iso === today ? ', today' : ''}`;
            const locks = lock('pickShiftDate');
            return (
              <button key={iso} type="button" className={`ShiftCal-day ${iso === today ? 'is-today' : ''} ${blocked ? 'is-blocked' : ''}`}
                aria-pressed={entry.date === iso} aria-label={label} title={locks.title || label} {...locks} disabled={blocked || locks.disabled}
                onClick={() => pick(iso)}>
                <span className="ShiftCal-month">{i === 0 || d.getDate() === 1 ? d.toLocaleDateString('en-US', { month: 'short' }) : ' '}</span>
                <span className="ShiftCal-num">{d.getDate()}</span>
                <span className="ShiftCal-dots">{Array.from({ length: Math.min(count, 3) }, (_, k) => <span key={k} className="ShiftCal-dot" />)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className={`FormField-caption ${noSubmission ? 'is-warning' : ''}`}>{outside
        ? <><Icon name="alert" size={12} /> This shift is saved as {fmtDate(entry.date)}, outside this pay period. Pick a day above to change it.</>
        : noSubmission
          ? <><Icon name="alert" size={12} /> {fmtDate(entry.date)} is marked as having no submission for {name}. Pick another day, or change that day on {name}’s page.</>
          : `Only days in this audit’s pay period. A dot means a shift for ${name} is already added that day. Days marked “No submission” can’t be picked.`}</p>
    </div>
  );
}

function AuthorField({ audit, entry, locked }: { audit: Audit; entry: Entry; locked: boolean }) {
  const employees = useData((s) => s.employees);
  const draft = useDraft(entry.author, (value) => editEntry((e) => { e.author = value; }, value));
  const authors = [...new Set([...activeEmployeeNames(), ...allEntries(audit).map((x) => x.author.trim()).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
  void employees;
  return (
    <>
      <div className="FormField wide">
        <label className="FormField-label" htmlFor="f-entry-author">Author (DSP staff)</label>
        <input className="form-control" id="f-entry-author" type="text" placeholder="Start typing a name" list="authors" autoComplete="off" spellCheck={false}
          aria-describedby="f-entry-author-caption" data-autofocus={entry.author ? undefined : ''} disabled={locked} {...draft} />
        <AuthorHint author={entry.author} />
      </div>
      <datalist id="authors">{authors.map((a) => <option key={a} value={a} />)}</datalist>
    </>
  );
}

function EntryDetails({ audit, name, entry, locked }: { audit: Audit; name: string; entry: Entry; locked: boolean }) {
  const employees = useData((s) => s.employees);
  useEffect(() => {
    if (employees === null) void refreshEmployees();
  }, [employees]);
  return (
    <>
      <div>
        <h1 className="PageHeader-title">Which documentation are you auditing?</h1>
        <p className="PageHeader-description">These fill the Submission Date, Author and Shift columns of the audit log.</p>
      </div>
      <div className="Box">
        <div className="Box-body">
          <div className="FormGrid">
            <AuthorField audit={audit} entry={entry} locked={locked} />
            {entry.allShifts ? null : (
              <>
                <ShiftCalendar audit={audit} name={name} entry={entry} locked={locked} />
                <EntryTimes entry={entry} locked={locked} />
              </>
            )}
          </div>
        </div>
        <div className="Box-body">
          <label className="CheckRow">
            <input type="checkbox" checked={entry.allShifts} disabled={locked} onChange={(ev) => editEntry((e) => { e.allShifts = ev.target.checked; }, ev.target.checked)} />
            <span className="CheckRow-text"><span className="CheckRow-label">Applies to all shifts by this author</span><span className="CheckRow-caption">Prints “ALL SHIFTS DOCUMENTED” instead of a date and shift.</span></span>
          </label>
          {entry.allShifts ? (
            <label className="CheckRow CheckRow--nested mt-3">
              <input type="checkbox" checked={entry.otherThanListed} disabled={locked} onChange={(ev) => editEntry((e) => { e.otherThanListed = ev.target.checked; }, ev.target.checked)} />
              <span className="CheckRow-text"><span className="CheckRow-label">Other than the shifts listed separately</span><span className="CheckRow-caption">Adds “(Other than listed above)”.</span></span>
            </label>
          ) : null}
        </div>
      </div>
    </>
  );
}

function EntryQuestion({ name, entry, q, locked }: { name: string; entry: Entry; q: Question; locked: boolean }) {
  const lock = useLock();
  const c = entry.checks[q.key];
  const flagged = isFlagged(q, c);
  return (
    <>
      <div>
        <h1 className="PageHeader-title">{q.title}</h1>
        <p className="PageHeader-description">{q.help}</p>
      </div>
      <div className="Choices" role="group" aria-label={q.title}>
        {(['yes', 'no'] as Answer[]).map((v) => (
          <button key={v} className={`Choice ${v === q.flagOn ? 'Choice--flag' : 'Choice--ok'}`} aria-pressed={c.answer === v} {...lock('answer')} onClick={() => choose(q.key, v)}>
            <Icon name={v === 'yes' ? 'check-circle' : 'x-circle'} size={20} /><span>{v === 'yes' ? 'Yes' : 'No'}</span>
          </button>
        ))}
      </div>
      {flagged ? (
        <div className="Box ReasonBox">
          <div className="Box-header">
            <h2 className="Box-title">{q.why}</h2>
            <span className="f6 color-fg-muted">Choose all that apply. These write the Reason column.</span>
          </div>
          {q.reasons.map((r) => {
            const covered = coveredReason(q, c.reasons, r);
            const checked = c.reasons.includes(r.key) && !covered;
            const locks = lock('toggleReason');
            return (
              <label key={r.key} className={`Box-row ReasonRow ${checked ? 'is-checked' : ''} ${covered ? 'is-disabled' : ''}`}>
                <input type="checkbox" checked={checked} {...locks} disabled={covered || locks.disabled} title={covered ? 'Already covered by your other choice' : locks.title}
                  onChange={() => toggle(q.key, r.key)} />
                <span className="ReasonRow-label">{r.label}</span>
              </label>
            );
          })}
          <label className={`Box-row ReasonRow ${c.otherOn ? 'is-checked' : ''}`}>
            <input type="checkbox" checked={c.otherOn} disabled={locked} onChange={(ev) => editEntry((e) => { e.checks[q.key].otherOn = ev.target.checked; }, ev.target.checked)} />
            <span className="ReasonRow-label">Other</span>
          </label>
          {c.otherOn ? (
            <div className="Box-body">
              <Field bind={`entry:checks.${q.key}.other`} label="Describe the reason" type="textarea" value={c.other} autoFocus disabled={locked}
                placeholder="e.g. Behaviors were described throughout the documentation, but…" onCommit={(value) => editEntry((e) => { e.checks[q.key].other = value; }, value)} />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="Box">
        <div className="Box-body">
          <Field bind={`entry:checks.${q.key}.notes`} label="Notes" optional type="textarea" value={c.notes} disabled={locked}
            placeholder="Anything worth noting about this part of the documentation" hint={`Added under ${name}’s Notes in the PDF.`}
            onCommit={(value) => editEntry((e) => { e.checks[q.key].notes = value; }, value)} />
        </div>
      </div>
    </>
  );
}

export function ReasonCount({ text }: { text: string }) {
  const n = text.trim().length;
  const over = n > REASON_MAX;
  return <span className={`ReasonCount ${over ? 'is-over' : ''}`} id="reason-count" aria-live="polite">{n} / {REASON_MAX}{over ? ' · try shortening it' : ''}</span>;
}

function ReasonEditor({ entry, locked }: { entry: Entry; locked: boolean }) {
  const draft = useDraft(entryReason(entry), (value) => editEntry((e) => { e.reasonOverride = value; }, value));
  return (
    <div className="FormField">
      <textarea className="form-control" rows={4} aria-label="Reason in the audit log" aria-describedby="reason-caption reason-count" disabled={locked} {...draft} />
      <div className="ReasonMeta">
        <p className="FormField-caption" id="reason-caption">Written from your answers as one short sentence. Edit it freely; your wording is kept.</p>
        <ReasonCount text={draft.value} />
      </div>
    </div>
  );
}

function EntryReview({ audit, name, entry, locked }: { audit: Audit; name: string; entry: Entry; locked: boolean }) {
  const lock = useLock();
  const overridden = entry.reasonOverride != null && entry.reasonOverride.trim() !== generatedReason(entry);
  return (
    <>
      <div><h1 className="PageHeader-title">Review this shift</h1></div>
      <div className="Box">
        <div className="Box-body">
          <dl className="Summary">
            <div><dt>Submission date</dt><dd>{entry.allShifts ? 'All shifts documented' : fmtDate(entry.date) || '—'}</dd></div>
            <div><dt>Author</dt><dd>{entry.author || '—'}</dd></div>
            <div><dt>Shift</dt><dd>{shiftLabel(entry) || '—'}</dd></div>
          </dl>
        </div>
        {QUESTIONS.map((q) => {
          const c = entry.checks[q.key];
          const picked = q.reasons.filter((r) => c.reasons.includes(r.key)).map((r) => r.label);
          if (c.otherOn && c.other.trim()) picked.push(`Other: ${c.other.trim()}`);
          const bad = isFlagged(q, c);
          return (
            <div className="Box-row ReviewRow" key={q.key}>
              <a className="ReviewRow-q" href={href('a', audit.id, 'i', name, 'e', entry.id, q.key)}>{q.title}</a>
              {c.answer ? <span className={`Label ${bad ? 'Label--danger' : 'Label--success'}`}><Icon name={bad ? 'x' : 'check'} />{c.answer === 'yes' ? 'Yes' : 'No'}</span> : <span className="Label">Not answered</span>}
              {bad && picked.length ? <span className="ReviewRow-detail">{picked.join(' · ')}</span> : null}
              {c.notes.trim() ? <span className="ReviewRow-detail"><Icon name="note" size={12} /> {c.notes.trim()}</span> : null}
            </div>
          );
        })}
      </div>
      {entryFlagged(entry) ? (
        <div className="Box">
          <div className="Box-header">
            <h2 className="Box-title">Reason in the audit log</h2>
            {overridden ? <div className="Box-headerActions"><button className="btn btn-sm" {...lock('resetReason')} onClick={() => reset()}><Icon name="undo" />Reset to generated</button></div> : null}
          </div>
          <div className="Box-body"><ReasonEditor entry={entry} locked={locked} /></div>
        </div>
      ) : (
        <div className="flash flash-success"><Icon name="check-circle" /><span><strong>No issues found.</strong> This shift won’t appear in the audit log table, but any notes you wrote are still added to {name}’s notes.</span></div>
      )}
    </>
  );
}

export function EntryPage() {
  const { audit, live } = useAuditContext();
  const params = useParams();
  const name = params.name || '';
  const entryId = params.entryId || '';
  const error = useUi((s) => s.error);
  const lock = useLock();
  const known = audit.site.residents.includes(name);
  const ind = known && Object.hasOwn(audit.individuals, name) ? audit.individuals[name] : null;
  const entry = ind?.entries.find((x) => x.id === entryId) || null;
  useTitle(entry ? `${name} · Shift` : `${name} · ${audit.site.name}`);
  useEffect(() => {
    if (known) ensureIndividual(audit.id, name);
  }, [known, audit.id, name]);
  if (!known) return <MissingPage />;
  if (!entry) return <IndividualPage />;
  const step = ENTRY_STEPS.some((s) => s[0] === params.step) ? params.step! : 'details';
  const idx = ENTRY_STEPS.findIndex((s) => s[0] === step);
  const detailsDone = entry.author && (entry.allShifts || (entry.date && entry.shiftStart && entry.shiftEnd && shiftLengthOk(entry.shiftStart, entry.shiftEnd)));
  const position = live ? livePosition() : {};
  const auditorHere = live && position.entryId === entry.id ? position.step : null;
  const q = QUESTIONS.find((x) => x.key === step);
  return (
    <>
      <Breadcrumbs items={[['Audits', '#/audits'], [auditLabel(audit), href('a', audit.id)], [name, href('a', audit.id, 'i', name)], ['Shift']]} />
      <ol className="ProgressSteps">
        {ENTRY_STEPS.map(([key, label], i) => {
          const sq = QUESTIONS.find((x) => x.key === key);
          let state = '';
          let marker = null;
          if (sq && entry.checks[key].answer) {
            const bad = isFlagged(sq, entry.checks[key]);
            state = bad ? 'is-bad' : 'is-good';
            marker = <Icon name={bad ? 'x' : 'check'} size={12} />;
          } else if (key === 'details' && detailsDone) {
            state = 'is-done';
            marker = <Icon name="check" size={12} />;
          }
          return (
            <li key={key} className={`ProgressSteps-item ${state} ${i === idx ? 'is-current' : ''}`}>
              <a className="ProgressSteps-link" href={href('a', audit.id, 'i', name, 'e', entry.id, key)} aria-current={i === idx ? 'step' : undefined}>
                <span className="ProgressSteps-marker">{marker}</span>{label}{auditorHere === key ? <span className="LiveLabel-dot" title="The auditor is on this step" /> : null}
              </a>
            </li>
          );
        })}
      </ol>
      {step === 'details' ? <EntryDetails audit={audit} name={name} entry={entry} locked={live} />
        : step === 'review' ? <EntryReview audit={audit} name={name} entry={entry} locked={live} />
          : <EntryQuestion name={name} entry={entry} q={q!} locked={live} />}
      <ErrorBox error={error} />
      <div className="NavBar">
        {idx > 0
          ? <a className="btn" href={href('a', audit.id, 'i', name, 'e', entry.id, ENTRY_STEPS[idx - 1][0])}><Icon name="chevron-left" />Back</a>
          : <a className="btn" href={href('a', audit.id, 'i', name)}><Icon name="chevron-left" />{name}</a>}
        {step === 'review' ? (
          <div className="NavBar-end">
            <button className="btn" {...lock('addEntry')} onClick={() => add()}><Icon name="plus" />Add another shift</button>
            <a className="btn btn-primary" href={href('a', audit.id, 'i', name)}><Icon name="check" />Done</a>
          </div>
        ) : live ? (
          <div className="NavBar-end"><a className="btn btn-primary" href={href('a', audit.id, 'i', name, 'e', entry.id, ENTRY_STEPS[idx + 1][0])}>Next<Icon name="chevron-right" /></a></div>
        ) : (
          <div className="NavBar-end"><button className="btn btn-primary" onClick={() => next(step)}>Next<Icon name="chevron-right" /></button></div>
        )}
      </div>
    </>
  );
}
