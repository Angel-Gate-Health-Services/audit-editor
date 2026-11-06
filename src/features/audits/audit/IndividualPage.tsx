import { useEffect } from 'react';
import { useParams } from 'react-router';
import {
  DAY_ISSUES, addDays, dateLabel, dayIssueDates, entryComplete, entryFlagged, fmtRange, individualDone, individualNotes, parseISO, payPeriod,
  payPeriodAt, payPeriodIndexFor, shiftLabel, sortedEntries, todayISO,
} from '../../../domain/audits/model.ts';
import { QUESTIONS } from '../../../domain/audits/config.ts';
import { Icon } from '../../../components/icons/Icon.tsx';
import { Avatar, Breadcrumbs, plural, useTitle } from '../../../components/ui/basics.tsx';
import { Field } from '../../../components/ui/Field.tsx';
import { useSession } from '../../../app/store/stores.ts';
import { action } from '../../../app/runtime/actions.ts';
import { residentId } from '../../../app/runtime/people.ts';
import { ensureIndividual, livePosition } from '../../../app/runtime/audit-access.ts';
import { href } from '../../../app/navigation/route.ts';
import { MissingPage } from '../../../app/shell/pages.tsx';
import { ENTRY_STEPS, addEntry, deleteEntry, editAudit, setAdequate, setDayIssue, toggleDayIssue } from '../audit-actions.ts';
import { PhotoControls } from '../../admin/PhotoControls.tsx';
import { CompletionPanel } from './CompletionPanel.tsx';
import { LiveLabel, auditLabel } from './AuditTabsLayout.tsx';
import { useAuditContext, useLock } from './context.tsx';
import type { Audit, Check, Individual, Question } from '../../../types/audit.ts';

const add = action('addEntry', addEntry);
const remove = action('deleteEntry', deleteEntry);
const markAdequate = action('markAdequate', () => setAdequate(true));
const undoAdequate = action('undoAdequate', () => setAdequate(false));
const toggleDay = action('toggleDayIssue', toggleDayIssue);
const setDay = action('setDayIssue', setDayIssue);

export const splitCount = (text: string) => (text || '').split('\n').filter((s) => s.trim().replace(/^[-–•*]\s*/, '')).length;

export function AnswerLabel({ q, check }: { q: Question; check: Check }) {
  if (!check.answer) return <span className="Label">{q.short}</span>;
  const bad = check.answer === q.flagOn;
  return <span className={`Label ${bad ? 'Label--danger' : 'Label--success'}`}><Icon name={bad ? 'x' : 'check'} />{q.short}</span>;
}

function DayIssuesBox({ audit, name, ind }: { audit: Audit; name: string; ind: Individual }) {
  const lock = useLock();
  const header = (
    <div className="Box-header DayIssues-header">
      <h2 className="Box-title">Which days aren’t adequately documented?</h2>
      <span className="DayIssues-note">Pick each day, then choose what’s wrong. These are added to {name}’s Notes in the PDF.</span>
    </div>
  );
  if (!audit.payStart) {
    return <div className="Box DayIssues">{header}<div className="Box-body color-fg-muted"><Icon name="info" /> Set this audit’s pay period on the Details tab first.</div></div>;
  }
  const issues = ind.dayIssues || {};
  const days = Array.from({ length: 14 }, (_, i) => addDays(audit.payStart, i));
  const period = payPeriodAt(payPeriodIndexFor(audit.payStart));
  const today = todayISO();
  const shiftsOn: Record<string, number> = {};
  for (const e of ind.entries) if (!e.allShifts && e.date) shiftsOn[e.date] = (shiftsOn[e.date] || 0) + 1;
  const long = (iso: string) => parseISO(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const tagFor = (kind: string) => (kind === 'one' ? 'Only 1' : kind === 'none' ? 'None' : 'Choose');
  const picked = dayIssueDates(ind);
  return (
    <div className="Box DayIssues">
      {header}
      <div className="Box-body">
        <div className="ShiftCal" role="group" aria-label={`Days in pay period #${period.number}`}>
          <div className="ShiftCal-head">
            <span><Icon name="calendar" /> Pay period #{period.number} · {fmtRange(audit.payStart, audit.payEnd)}</span>
            <span className="ShiftCal-picked">{picked.length ? `${plural(picked.length, 'day')} picked` : 'Pick inadequate dates'}</span>
          </div>
          <div className="ShiftCal-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => <span key={w} className="ShiftCal-dow" aria-hidden="true">{w}</span>)}
            {days.map((iso, i) => {
              const d = parseISO(iso);
              const isPicked = Object.hasOwn(issues, iso);
              const kind = issues[iso];
              const count = shiftsOn[iso] || 0;
              const label = `${long(iso)}${isPicked ? `, ${kind ? (DAY_ISSUES as Record<string, string>)[kind].toLowerCase() : 'not chosen yet'}` : ''}${count ? `, ${plural(count, 'shift')} added` : ''}`;
              return (
                <button key={iso} type="button" className={`ShiftCal-day DayIssues-day ${iso === today ? 'is-today' : ''} ${isPicked ? `is-${kind || 'unset'}` : ''}`}
                  aria-pressed={isPicked} aria-label={label} title={label} {...lock('toggleDayIssue')} onClick={() => toggleDay(iso)}>
                  <span className="ShiftCal-month">{i === 0 || d.getDate() === 1 ? d.toLocaleDateString('en-US', { month: 'short' }) : ' '}</span>
                  <span className="ShiftCal-num">{d.getDate()}</span>
                  {isPicked ? <span className="DayIssues-tag">{tagFor(kind)}</span> : <span className="ShiftCal-dots">{Array.from({ length: Math.min(count, 3) }, (_, k) => <span key={k} className="ShiftCal-dot" />)}</span>}
                </button>
              );
            })}
          </div>
        </div>
        {picked.length ? (
          <div className="DayIssues-list">
            {picked.map((iso) => {
              const audited = shiftsOn[iso] || 0;
              const conflict = audited && issues[iso] === 'none';
              return (
                <div key={iso} className={`DayIssues-row ${issues[iso] && !conflict ? '' : 'is-unset'}`}>
                  <span className="DayIssues-date"><Icon name="calendar" />{long(iso)}{days.includes(iso) ? '' : ' (outside this pay period)'}</span>
                  <div className="DayIssues-choices" role="group" aria-label={`What’s wrong on ${long(iso)}`}>
                    {Object.entries(DAY_ISSUES).map(([kind, text]) => {
                      const blocked = kind === 'none' && audited > 0;
                      const locked = lock('setDayIssue');
                      return (
                        <button key={kind} type="button" className="DayIssues-choice" aria-pressed={issues[iso] === kind} {...locked}
                          disabled={blocked || locked.disabled} title={blocked ? `${plural(audited, 'shift')} audited on this day, so there was a submission` : locked.title}
                          onClick={() => setDay(iso, kind)}>{text}</button>
                      );
                    })}
                  </div>
                  <button className="btn-octicon btn-octicon-danger" type="button" aria-label={`Remove ${long(iso)}`} title="Remove day" {...lock('toggleDayIssue')} onClick={() => toggleDay(iso)}><Icon name="x" /></button>
                  {audited ? <p className="DayIssues-why"><Icon name={conflict ? 'alert' : 'info'} size={12} />{conflict ? `${plural(audited, 'shift')} audited on this day, so it can’t have no submission. Choose “Only one submission” or remove the audit on this day.` : `${plural(audited, 'shift')} audited on this day, so “No submission” isn’t available.`}</p> : null}
                </div>
              );
            })}
          </div>
        ) : <p className="FormField-caption">A dot means a shift for {name} is already added that day.</p>}
      </div>
    </div>
  );
}

export function IndividualPage() {
  const { audit, live } = useAuditContext();
  const params = useParams();
  const name = params.name || '';
  const admin = useSession((s) => Boolean(s.profile?.is_admin));
  const lock = useLock();
  useTitle(`${name} · ${audit.site.name}`);
  const known = audit.site.residents.includes(name);
  useEffect(() => {
    if (known) ensureIndividual(audit.id, name);
  }, [known, audit.id, name]);
  if (!known) return <MissingPage />;
  const ind: Individual = Object.hasOwn(audit.individuals, name) ? audit.individuals[name] : { notes: '', entries: [] };
  const entries = sortedEntries(ind.entries);
  const position = live ? livePosition() : {};
  const rid = residentId(audit, name);
  const flaggedAny = entries.some((e) => entryComplete(e) && entryFlagged(e));
  const doneLabel = individualDone(audit, name)
    ? <span className="Label Label--success Label--large"><Icon name="check" />{ind.adequate && !flaggedAny ? 'Adequate documentation' : 'Done'}</span> : null;
  const adequacy = !entries.length || flaggedAny ? null : ind.adequate
    ? <div className="flash flash-success"><Icon name="check-circle" /><div className="flex-1"><strong>Adequate documentation.</strong> {name} is done; nothing is flagged.</div>
      <button className="btn btn-sm" {...lock('undoAdequate')} onClick={() => undoAdequate()}><Icon name="undo" />Undo</button></div>
    : <div className="Box AdequateBox"><div className="Box-row">
      <span className="color-fg-muted"><Icon name="info" /></span>
      <p className="flex-1 m-0">No shifts are flagged for {name}. If their documentation is fine, mark it adequate to move on.</p>
      <button className="btn" {...lock('markAdequate')} onClick={() => markAdequate()}><Icon name="check-circle" />Individual has adequate documentation</button>
    </div></div>;
  const auditing = live && position.individual === name ? <LiveLabel text="Currently auditing" /> : null;
  const top = entries.length ? (
    <>
      <div className="PageHeader">
        <div className="PageHeader-lead">
          <Avatar kind="residents" id={rid} name={name} className="InitialsAvatar--large" />
          <div>
            <h1 className="PageHeader-title">{name}</h1>
            <p className="PageHeader-description">{audit.site.name} · Pay period {payPeriod(audit)}</p>
          </div>
        </div>
        <div className="PageHeader-actions">{auditing}{doneLabel}<button className="btn btn-primary" {...lock('addEntry')} onClick={() => add()}><Icon name="plus" />Add a shift</button></div>
      </div>
      <div className="Box">
        <div className="Box-header"><h2 className="Box-title">Flagged documentation</h2><span className="Counter">{entries.length}</span></div>
        {entries.map((e) => {
          const status = !entryComplete(e) ? <span className="Label Label--attention">Unfinished</span>
            : entryFlagged(e) ? <span className="Label Label--danger">In audit log</span> : <span className="Label Label--success">No issues</span>;
          return (
            <div className="Box-row EntryRow" key={e.id}>
              <a className="EntryRow-link" href={href('a', audit.id, 'i', name, 'e', e.id, entryComplete(e) ? 'review' : 'details')}>
                <span><span className="EntryRow-date d-block">{dateLabel(e) || 'No date'}</span>{e.allShifts ? null : <span className="EntryRow-shift">{shiftLabel(e) || 'No shift time'}</span>}</span>
                <span className="EntryRow-author"><Icon name="person" /> {e.author || 'No author'}</span>
                {live && position.entryId === e.id ? <LiveLabel text={`Currently editing · ${ENTRY_STEPS.find(([k]) => k === position.step)?.[1] || 'Shift'}`} /> : null}
                {status}
                <span className="EntryRow-labels">{QUESTIONS.map((q) => <AnswerLabel key={q.key} q={q} check={e.checks[q.key]} />)}</span>
              </a>
              <button className="btn-octicon btn-octicon-danger" aria-label="Delete this shift" title="Delete shift" {...lock('deleteEntry')} onClick={() => remove(e.id)}><Icon name="trash" /></button>
            </div>
          );
        })}
      </div>
      {adequacy}
    </>
  ) : (
    <section className="IndividualHero">
      <Avatar kind="residents" id={rid} name={name} className="InitialsAvatar--hero" />
      {admin ? <div className="IndividualHero-photo"><PhotoControls kind="residents" id={rid} name={name} /></div> : null}
      <h1 className="IndividualHero-name">{name}</h1>
      {auditing}
      <p className="IndividualHero-meta">
        <span><Icon name="home" /> {audit.site.name}</span>
        <span><Icon name="calendar" /> Pay period {payPeriod(audit)}</span>
      </p>
      {ind.adequate ? (
        <>
          <p className="IndividualHero-done"><Icon name="check-circle" size={20} /> Adequate documentation</p>
          <p className="IndividualHero-text">{name} is done, with nothing flagged. Add a shift if you find something after all.</p>
          <div className="IndividualHero-actions">
            <button className="btn btn-large" {...lock('addEntry')} onClick={() => add()}><Icon name="plus" />Add a shift</button>
            <button className="btn btn-large btn-invisible" {...lock('undoAdequate')} onClick={() => undoAdequate()}><Icon name="undo" />Undo</button>
          </div>
        </>
      ) : (
        <>
          <p className="IndividualHero-text">No shifts reviewed yet. Add a shift to flag documentation, or mark it adequate if nothing needs flagging.</p>
          <div className="IndividualHero-actions">
            <button className="btn btn-primary btn-large" data-autofocus="" {...lock('addEntry')} onClick={() => add()}><Icon name="plus" />Add a shift</button>
            <button className="btn btn-large" {...lock('markAdequate')} onClick={() => markAdequate()}><Icon name="check-circle" />Individual has adequate documentation</button>
          </div>
        </>
      )}
    </section>
  );
  const fromShifts = individualNotes(audit, name).slice(splitCount(ind.notes));
  return (
    <>
      <Breadcrumbs items={[['Audits', '#/audits'], [auditLabel(audit), href('a', audit.id)], [name]]} />
      {top}
      <DayIssuesBox audit={audit} name={name} ind={ind} />
      <CompletionPanel audit={audit} name={name} />
      <div className="Box">
        <div className="Box-header"><h2 className="Box-title">Notes for {name}</h2></div>
        <div className="Box-body">
          <Field bind="ind:notes" label="General notes about this individual" type="textarea" value={ind.notes} disabled={live}
            placeholder="e.g. There is only one submission of documentation on the 29th of September." hint="Each line becomes a bullet under this individual’s Notes in the PDF."
            onCommit={(value) => editAudit((a) => {
              if (!Object.hasOwn(a.individuals, name)) Object.defineProperty(a.individuals, name, { value: { notes: '', entries: [] }, writable: true, enumerable: true, configurable: true });
              a.individuals[name].notes = value;
            }, value)} />
          {fromShifts.length ? <div className="NotesPreview mt-3"><p className="NotesPreview-title">Also included in the PDF notes</p><ul>{fromShifts.map((n, i) => <li key={i}>{n}</li>)}</ul></div> : null}
        </div>
      </div>
      <div className="NavBar">
        <a className="btn" href={href('a', audit.id)}><Icon name="chevron-left" />All individuals</a>
      </div>
    </>
  );
}
