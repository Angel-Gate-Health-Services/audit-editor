import { Fragment, useEffect, type ReactNode } from 'react';
import { currentPayPeriod, fmtDate, fmtRange, fmtShiftLength, fmtTime, lastPayPeriod, payPeriodAt, payPeriodIndexFor } from '../../domain/audits/model.ts';
import { QUESTIONS } from '../../domain/audits/config.ts';
import { employeeIndex, homeKey, nameKey, reasonLabel, type EmployeeStats, type PeriodStat } from '../../domain/employees/stats.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { Avatar, clockTime, percentText, plural } from '../../components/ui/basics.tsx';
import { Field } from '../../components/ui/Field.tsx';
import { useData, useSession, useStaff } from '../../app/store/stores.ts';
import { action } from '../../app/runtime/actions.ts';
import { allSites } from '../../app/runtime/people.ts';
import { href } from '../../app/navigation/route.ts';
import { PhotoControls } from '../admin/PhotoControls.tsx';
import { STAFF_RANGES } from './staff-data.ts';
import {
  cancelEmployeeEdit, cancelExcuse, loadEmployeeNote, saveEmployeeEdit, saveEmployeeNote, saveExcuse, setStaffRange, startExcuse, unexcuseFinding,
} from './staff-actions.ts';
import type { Employee, Finding, FindingReview } from '../../types/audit.ts';

const rangeAction = action('setStaffRange', setStaffRange);
const excuse = action('startExcuse', startExcuse);
const cancelExcuseAction = action('cancelExcuse', cancelExcuse);
const saveExcuseAction = action('saveExcuse', saveExcuse);
const unexcuse = action('unexcuseFinding', unexcuseFinding);
const cancelEdit = action('cancelEmployeeEdit', cancelEmployeeEdit);
const saveEdit = action('saveEmployeeEdit', saveEmployeeEdit);
const saveNote = action('saveEmployeeNote', saveEmployeeNote);

export const employeeHref = (e: Pick<Employee, 'id'>) => href('employees', e.id);
export const unlistedHref = (key: string) => href('employees', 'name', key);
export const homeHref = (key: string) => href('sites', key);

export function StaffRangeSelect() {
  const range = useStaff((s) => s.range);
  return (
    <label className="SortMenu">
      <span className="SortMenu-label"><Icon name="calendar" size={14} />Showing</span>
      <select className="form-select select-sm" aria-label="Time range" value={range} onChange={(ev) => rangeAction(ev.target.value)}>
        {STAFF_RANGES.map(([k, label]) => <option key={k} value={k}>{k === 'current' ? `${label} (#${currentPayPeriod().number})` : k === 'last' ? `${label} (#${lastPayPeriod().number})` : label}</option>)}
      </select>
    </label>
  );
}

export function SortSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return (
    <label className="SortMenu"><span className="SortMenu-label"><Icon name="sort-desc" size={14} />Sort</span>
      <select className="form-select select-sm" aria-label={label} value={value} onChange={(ev) => onChange(ev.target.value)}>
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

export function TrendChart({ s }: { s: EmployeeStats }) {
  if (!s.periods.length) return <p className="color-fg-muted m-0">No finished shifts in this range yet.</p>;
  const last = s.periods.at(-1)!.index;
  const firstShown = Math.max(s.periods[0].index, last - 7);
  const byIndex = new Map(s.periods.map((p) => [p.index, p]));
  const bars: PeriodStat[] = [];
  for (let i = firstShown; i <= last; i += 1) bars.push(byIndex.get(i) || { index: i, period: payPeriodAt(i), shifts: 0, flagged: 0 });
  const tip = (p: PeriodStat) => (p.shifts ? `#${p.period.number} (${fmtRange(p.period.start, p.period.end)}): ${p.flagged} of ${plural(p.shifts, 'shift')} flagged, ${percentText(p.flagged / p.shifts)}` : `#${p.period.number}: no shifts audited`);
  return (
    <>
      <div className="TrendChart" role="img" aria-label="Flag rate by pay period">
        <div className="TrendChart-grid" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
        <div className="TrendChart-bars">
          {bars.map((p) => (
            <div key={p.index} className="TrendChart-col" tabIndex={0} data-tip={tip(p)} aria-label={tip(p)}>
              <span className={`TrendChart-bar ${p.shifts ? '' : 'is-empty'}`} style={{ height: `${p.shifts ? Math.max(2, Math.round((p.flagged / p.shifts) * 100)) : 0}%` }} />
              <span className="TrendChart-label">#{p.period.number}</span>
            </div>
          ))}
        </div>
      </div>
      <details className="TrendTable">
        <summary>Show as a table</summary>
        <table className="DataTable"><thead><tr><th>Pay period</th><th>Audited</th><th>Flagged</th><th>Flag rate</th></tr></thead>
          <tbody>{[...bars].reverse().map((p) => <tr key={p.index}><td>#{p.period.number} · {fmtRange(p.period.start, p.period.end)}</td><td>{p.shifts}</td><td>{p.flagged}</td><td>{p.shifts ? percentText(p.flagged / p.shifts) : '—'}</td></tr>)}</tbody>
        </table>
      </details>
    </>
  );
}

export function BarList({ items, total, empty }: { items: { label: string; count: number }[]; total: number; empty: string }) {
  if (!items.length) return <p className="color-fg-muted m-0">{empty}</p>;
  const max = Math.max(...items.map((i) => i.count));
  return (
    <ul className="BarList">{items.map((i) => (
      <li key={i.label} className="BarList-item" title={`${i.label}: ${plural(i.count, 'time')}${total ? `, ${percentText(i.count / total)} of flagged shifts` : ''}`}>
        <span className="BarList-label">{i.label}</span>
        <span className="BarList-track"><span className="BarList-fill" style={{ width: `${Math.max(4, Math.round((i.count / max) * 100))}%` }} /></span>
        <span className="BarList-count">{i.count}</span>
      </li>
    ))}</ul>
  );
}

export function FindingStatus({ f, review }: { f: Finding; review: FindingReview | undefined }) {
  if (!f.complete) return <span className="Label Label--attention">In progress</span>;
  if (f.flagged && review?.excused) return <span className="Label" title={`Excused by ${review.reviewer_name}${review.note ? `: ${review.note}` : ''}`}><Icon name="check" size={12} />Excused</span>;
  if (f.flagged) return <span className="Label Label--danger">Flagged</span>;
  return <span className="Label Label--success">No issues</span>;
}

export function FindingIssues({ f }: { f: Finding }) {
  const labels = (f.flags || []).flatMap((flag) => {
    const reasons = (flag.reasons || []).map((r) => reasonLabel(flag.q, r));
    if (flag.other) reasons.push(reasonLabel(flag.q, 'other'));
    return reasons.length ? reasons : [QUESTIONS.find((q) => q.key === flag.q)?.short || flag.q];
  });
  if (!labels.length) return <span className="color-fg-muted">—</span>;
  return <>{labels.map((l, i) => <Fragment key={i}>{i ? <br /> : null}{l}</Fragment>)}</>;
}

function PersonLink({ f, index }: { f: Finding; index: Map<string, Employee> }) {
  const employee = index.get(f.employee_key || nameKey(f.employee_name));
  return employee ? <a href={employeeHref(employee)}>{employee.name}</a> : <a href={unlistedHref(f.employee_key || nameKey(f.employee_name))}>{f.employee_name}</a>;
}

export function ShiftsTable({ s, canReview, column = 'home', clockCell }: { s: EmployeeStats; canReview: boolean; column?: 'home' | 'employee'; clockCell?: (f: Finding) => ReactNode }) {
  const st = useStaff();
  const employees = useData((d) => d.employees);
  const index = employeeIndex(employees || []);
  if (!s.rows.length) return <div className="blankslate blankslate--narrow"><p>No audited shifts in this range.</p></div>;
  return (
    <>
      <div className="TableScroll"><table className="DataTable ShiftTable">
        <thead><tr><th>Date</th><th>{column === 'home' ? 'Site' : 'Employee'}</th><th>Shift</th>{clockCell ? <th>Clock-in</th> : null}<th>Status</th><th>Issues</th>{canReview ? <th><span className="sr-only">Review</span></th> : null}</tr></thead>
        <tbody>{s.rows.slice(0, 200).map((f) => {
          const review = st.reviews.get(f.id);
          const excusing = st.excusing === f.id;
          const when = f.all_shifts ? 'All shifts' : f.shift_start && f.shift_end ? `${fmtTime(f.shift_start)} – ${fmtTime(f.shift_end)}` : '—';
          return (
            <Fragment key={f.id}>
              <tr className={review?.excused ? 'is-excused' : ''}>
                <td>{f.shift_date ? fmtDate(f.shift_date) : f.pay_period_start ? `Pay period #${payPeriodAt(payPeriodIndexFor(f.pay_period_start)).number}` : '—'}</td>
                <td>{column === 'home' ? (f.home_name ? <a href={homeHref(homeKey(f))}>{f.home_name}</a> : '—') : <PersonLink f={f} index={index} />}</td>
                <td>{when}</td>
                {clockCell ? <td className="ShiftTable-clock">{clockCell(f)}</td> : null}
                <td><FindingStatus f={f} review={review} />{review?.excused && review.note ? <span className="ShiftTable-note">{review.note}</span> : null}</td>
                <td className="ShiftTable-issues"><FindingIssues f={f} /></td>
                {canReview ? <td className="ShiftTable-review">{f.complete && f.flagged
                  ? review?.excused
                    ? <button className="btn btn-sm" disabled={st.busy} onClick={() => unexcuse(f.id)}><Icon name="undo" />Count again</button>
                    : <button className="btn btn-sm" disabled={st.busy} onClick={() => excuse(f.id)}>Excuse</button>
                  : null}</td> : null}
              </tr>
              {excusing ? (
                <tr className="ShiftTable-excuse"><td colSpan={clockCell ? 7 : 6}>
                  <div className="ExcuseForm">
                    <Field bind="excuse:excuseNote" label="Why is this flag excused?" value={st.excuseNote} autoFocus placeholder="e.g. Supervisor confirmed the notes were submitted on paper"
                      input={{ maxLength: 500 }} onCommit={(excuseNote) => useStaff.setState({ excuseNote })} />
                    <div className="ExcuseForm-actions"><button className="btn btn-sm" onClick={() => cancelExcuseAction()}>Cancel</button><button className="btn btn-sm btn-primary" disabled={st.busy} onClick={() => saveExcuseAction(f.id)}>Excuse flag</button></div>
                  </div>
                </td></tr>
              ) : null}
            </Fragment>
          );
        })}</tbody>
      </table></div>
      {s.rows.length > 200 ? <p className="Box-row color-fg-muted f6 m-0">Showing the 200 most recent of {s.rows.length} shifts.</p> : null}
    </>
  );
}

export function EmployeeEditForm({ e }: { e: Employee }) {
  const d = useStaff((s) => s.draft)!;
  const busy = useStaff((s) => s.busy);
  const homes = allSites();
  const patch = (p: Partial<typeof d>) => useStaff.setState((s) => ({ draft: s.draft ? { ...s.draft, ...p } : s.draft }));
  return (
    <div className="Box EmployeeEdit">
      <div className="Box-header"><h2 className="Box-title">Edit {e.name}</h2></div>
      <div className="Box-body">
        <div className="EditPanel-photo mb-3"><Avatar kind="employees" id={e.id} name={e.name} className="InitialsAvatar--xl" /><div className="EditPanel-photoActions"><PhotoControls kind="employees" id={e.id} name={e.name} /></div></div>
        <div className="FormGrid">
          <Field bind="empProfile:name" label="Full name" value={d.name} autoFocus input={{ maxLength: 200 }} onCommit={(name) => patch({ name })} />
          <Field bind="empProfile:title" label="Job title" value={d.title} placeholder="e.g. DSP, Lead DSP" optional input={{ maxLength: 80 }} onCommit={(title) => patch({ title })} />
          <Field bind="empProfile:hireDate" label="Start date" type="date" value={d.hireDate} optional onCommit={(hireDate) => patch({ hireDate })} />
          <div className="FormField">
            <label className="FormField-label" htmlFor="f-empProfile-primaryHomeId">Main site <span className="FormField-optional">optional</span></label>
            <select className="form-select" id="f-empProfile-primaryHomeId" value={d.primaryHomeId} onChange={(ev) => patch({ primaryHomeId: ev.target.value })}>
              <option value="">Not set</option>
              {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <Field bind="empProfile:aliases" label="Other spellings of their name" type="textarea" value={d.aliases} placeholder="One per line, e.g. Jon Smith" hint="Shifts typed with these names count toward this employee." optional wide onCommit={(aliases) => patch({ aliases })} />
        </div>
        <label className="CheckRow mt-2"><input type="checkbox" checked={d.active} onChange={(ev) => patch({ active: ev.target.checked })} /><span>Active (shown in the Author dropdown on shifts)</span></label>
      </div>
      <div className="Box-footer NavBar">
        <button className="btn" onClick={() => cancelEdit()}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => saveEdit(e.id)}><Icon name="check" />Save</button>
      </div>
    </div>
  );
}

export function EmployeeNotesBox({ e }: { e: Employee }) {
  const admin = useSession((s) => Boolean(s.profile?.is_admin));
  const note = useStaff((s) => s.notes.get(e.id));
  const draft = useStaff((s) => s.noteDraft);
  const busy = useStaff((s) => s.busy);
  useEffect(() => {
    if (admin) loadEmployeeNote(e.id);
  }, [admin, e.id]);
  useEffect(() => {
    if (note && useStaff.getState().noteDraft?.id !== e.id) useStaff.setState({ noteDraft: { id: e.id, text: note.notes } });
  }, [note, e.id]);
  if (!admin) return null;
  let body: ReactNode;
  if (!note) body = <p className="color-fg-muted m-0">Loading…</p>;
  else if (note.error) body = <p className="color-fg-danger m-0">{note.error === 'missing-table' ? <>Run <code>supabase/employee-stats.sql</code> to turn on admin notes.</> : note.error}</p>;
  else body = (
    <>
      <Field bind="staffNote:text" label="Notes" type="textarea" value={draft?.id === e.id ? draft.text : note.notes} placeholder="Coaching, follow-ups, anything other admins should know"
        hint={note.updatedAt ? `Last saved ${clockTime(note.updatedAt)}.` : 'Not saved yet.'} onCommit={(text) => useStaff.setState({ noteDraft: { id: e.id, text } })} />
      <div className="NavBar mt-2"><div className="NavBar-end"><button className="btn btn-sm btn-primary" disabled={busy} onClick={() => saveNote(e.id)}>Save notes</button></div></div>
    </>
  );
  return (
    <div className="Box">
      <div className="Box-header AuditsHeader"><h2 className="Box-title"><Icon name="lock" />Admin notes</h2><span className="f6 color-fg-muted">Only admins can see these.</span></div>
      <div className="Box-body">{body}</div>
    </div>
  );
}

export function WorkPattern({ s, extra }: { s: EmployeeStats; extra: ReactNode }) {
  return (
    <dl className="FactList">
      <div><dt>Shift types</dt><dd>{s.kinds.length ? s.kinds.map((k) => `${k.kind} ${k.count}`).join(' · ') : '—'}</dd></div>
      <div><dt>Busiest day</dt><dd>{s.topWeekday || '—'}</dd></div>
      <div><dt>Average shift</dt><dd>{s.avgLength ? fmtShiftLength(s.avgLength) : '—'}</dd></div>
      <div><dt>Clock-in mismatches</dt><dd>{s.clockIn}</dd></div>
      <div><dt>“All shifts” flags</dt><dd>{s.allShifts}</dd></div>
      {extra}
    </dl>
  );
}

export function StaffMessage() {
  const message = useStaff((s) => s.message);
  if (!message) return null;
  return <div className={`flash ${message.ok ? 'flash-success' : 'flash-error'}`} role="status"><Icon name={message.ok ? 'check-circle' : 'alert'} /><span>{message.text}</span></div>;
}

export function LoadingStats({ crumbs }: { crumbs: ReactNode }) {
  return <>{crumbs}<div className="Box"><div className="blankslate"><span className="blankslate-icon"><Icon name="sync" size={24} /></span><p>Loading statistics…</p></div></div></>;
}
