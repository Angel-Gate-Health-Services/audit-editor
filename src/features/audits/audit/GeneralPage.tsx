import { useState, type FormEvent } from 'react';
import { flaggedAuthors, repeatStaff } from '../../../domain/audits/model.ts';
import { GENERAL_EXAMPLES } from '../../../domain/audits/config.ts';
import { Icon } from '../../../components/icons/Icon.tsx';
import { useTitle } from '../../../components/ui/basics.tsx';
import { Field } from '../../../components/ui/Field.tsx';
import { action } from '../../../app/runtime/actions.ts';
import { href } from '../../../app/navigation/route.ts';
import { addRec, addStaff, editAudit, removeRec, toggleStaff } from '../audit-actions.ts';
import { useAuditContext, useLock } from './context.tsx';

const toggle = action('toggleStaff', toggleStaff);
const add = action('addStaff', addStaff);
const addRecommendation = action('addRec', addRec);
const removeRecommendation = action('removeRec', removeRec);

export function GeneralPage() {
  const { audit, live } = useAuditContext();
  useTitle(`${audit.site.name} · General notes`);
  const lock = useLock();
  const [staffName, setStaffName] = useState('');
  const g = audit.general;
  const authors = flaggedAuthors(audit);
  const chosen = repeatStaff(audit);
  const names = [...new Set([...authors.map((a) => a.name), ...chosen])];
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    add(staffName);
  };
  return (
    <>
      <div>
        <h2 className="SectionHeading">General notes</h2>
        <p className="PageHeader-description">Your text goes on the General Notes page of the PDF. Gray examples are hints and won’t be included.</p>
      </div>
      <div className="Box">
        <div className="Box-header">
          <h2 className="Box-title">Staff with repetitive infractions</h2>
          <span className="f6 color-fg-muted">Staff flagged on 2 or more shifts are selected for you.</span>
        </div>
        {names.length ? names.map((n) => {
          const count = authors.find((a) => a.name === n)?.count;
          return (
            <label key={n} className={`Box-row ReasonRow ${chosen.includes(n) ? 'is-checked' : ''}`}>
              <input type="checkbox" checked={chosen.includes(n)} {...lock('toggleStaff')} onChange={() => toggle(n)} />
              <span className="ReasonRow-label">{n}</span>
              {count ? <span className={`Label ${count >= 2 ? 'Label--danger' : ''}`}>{count >= 2 ? 'Repeated' : '1 flag'}</span> : null}
            </label>
          );
        }) : <div className="blankslate blankslate--narrow"><p>No flagged staff yet. Names appear here as you flag shifts.</p></div>}
        <div className="Box-footer">
          <form className="InlineAdd" onSubmit={submit}>
            <input className="form-control" type="text" name="name" placeholder="Add a staff name" aria-label="Staff name" disabled={live} value={staffName} onChange={(ev) => setStaffName(ev.target.value)} />
            <button className="btn" type="submit" {...lock('addStaff')}><Icon name="plus" />Add</button>
          </form>
        </div>
      </div>
      <div className="Box">
        <div className="Box-header"><h2 className="Box-title">Notes</h2></div>
        <div className="Box-body">
          <Field bind="general:notes" label="General notes for this audit" type="textarea" value={g.notes} disabled={live} placeholder="Anything that applies to the whole site or audit" hint="Each line becomes a bullet."
            onCommit={(value) => editAudit((a) => { a.general.notes = value; }, value)} />
        </div>
      </div>
      <div className="Box">
        <div className="Box-header">
          <h2 className="Box-title">Recommendations</h2>
          <div className="Box-headerActions"><button className="btn btn-sm" {...lock('addRec')} onClick={() => addRecommendation()}><Icon name="plus" />Add</button></div>
        </div>
        {g.recommendations.map((r, i) => (
          <div className="Box-body RecRow" key={i}>
            <div className="RecRow-head">
              <Field bind={`general:recommendations.${i}.title`} label="Title" value={r.title} disabled={live} placeholder={GENERAL_EXAMPLES.recommendations[r.exampleIndex ?? -1]?.title || 'e.g. Recommendation for documentation'}
                onCommit={(value) => editAudit((a) => { if (a.general.recommendations[i]) a.general.recommendations[i].title = value; }, value)} />
              <button className="btn btn-danger" aria-label="Remove recommendation" title="Remove" {...lock('removeRec')} onClick={() => removeRecommendation(i)}><Icon name="trash" /></button>
            </div>
            <Field bind={`general:recommendations.${i}.text`} label="Recommendation" type="textarea" value={r.text} disabled={live} placeholder={GENERAL_EXAMPLES.recommendations[r.exampleIndex ?? -1]?.text || 'Describe what staff should do differently.'}
              onCommit={(value) => editAudit((a) => { if (a.general.recommendations[i]) a.general.recommendations[i].text = value; }, value)} />
          </div>
        ))}
        <div className="Box-body">
          <Field bind="general:closing" label="Closing line" value={g.closing} disabled={live} placeholder={GENERAL_EXAMPLES.closing} hint="Printed in bold at the end of the page when you enter your own text."
            onCommit={(value) => editAudit((a) => { a.general.closing = value; }, value)} />
        </div>
      </div>
      <div className="NavBar">
        <a className="btn" href={href('a', audit.id)}><Icon name="chevron-left" />Individuals</a>
        <div className="NavBar-end"><a className="btn btn-primary" href={href('a', audit.id, 'pdf')}>Create PDF<Icon name="chevron-right" /></a></div>
      </div>
    </>
  );
}
