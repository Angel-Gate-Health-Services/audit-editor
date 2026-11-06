import { sortNames, todayISO } from '../../../domain/audits/model.ts';
import { Icon } from '../../../components/icons/Icon.tsx';
import { Avatar, ErrorBox, useTitle } from '../../../components/ui/basics.tsx';
import { Field, useDraft } from '../../../components/ui/Field.tsx';
import { useAudits, useProgress, useStatus, useUi } from '../../../app/store/stores.ts';
import { action } from '../../../app/runtime/actions.ts';
import { residentId } from '../../../app/runtime/people.ts';
import { changePayStart, dateToday, editAudit, setupNext } from '../audit-actions.ts';
import { payDateCaption, payPeriodChoices, periodTakenReason } from '../NewAuditPage.tsx';
import { useAuditContext, useLock } from './context.tsx';
import type { Audit } from '../../../types/audit.ts';

const setToday = action('dateToday', dateToday);
const next = action('setupNext', setupNext);

function PayPeriodSelect({ audit, disabled }: { audit: Audit; disabled: boolean }) {
  useProgress((s) => s.completions);
  useStatus((s) => s.watcher);
  useAudits((s) => s.audits);
  const { choices, selected, completed } = payPeriodChoices(audit);
  return (
    <div className="FormField wide">
      <label className="FormField-label" htmlFor="f-audit-payStart">Pay period</label>
      <select className="form-select" id="f-audit-payStart" aria-describedby="f-audit-payStart-caption" disabled={completed || disabled} value={selected.start} onChange={(ev) => changePayStart(audit, ev.target.value, periodTakenReason)}>
        {choices.map((c) => <option key={c.start} value={c.start} disabled={Boolean(c.taken)}>{c.label}</option>)}
      </select>
      <p className="FormField-caption" id="f-audit-payStart-caption">{completed ? 'Reopen this audit to change its pay period.' : `${payDateCaption(selected.payDate)}From the AGHS pay schedule. Periods someone else is auditing, or that are already audited, can’t be chosen.`}</p>
    </div>
  );
}

function AuditDate({ audit, disabled }: { audit: Audit; disabled: boolean }) {
  const draft = useDraft(audit.auditDate, (value) => editAudit((a) => { a.auditDate = value; }, value));
  const lock = useLock();
  return (
    <div className="FormField">
      <label className="FormField-label" htmlFor="f-date">Audit date</label>
      <input className="form-control" id="f-date" type="date" disabled={disabled} {...draft} />
      <p className="FormField-caption">{audit.auditDate === todayISO() ? 'Set to today for each new audit.' : <button className="LinkBtn" {...lock('dateToday')} onClick={() => setToday()}>Use today’s date</button>}</p>
    </div>
  );
}

export function SetupPage() {
  const { audit, live } = useAuditContext();
  useTitle(`${audit.site.name} · Details`);
  const error = useUi((s) => s.error);
  const lock = useLock();
  return (
    <>
      <div className="Box">
        <div className="Box-header"><h2 className="Box-title">Audit</h2></div>
        <div className="Box-body">
          <div className="FormGrid">
            <Field bind="audit:auditor" label="Audit by" value={audit.auditor} placeholder="Your full name" disabled={live}
              onCommit={(value) => {
                if (editAudit((a) => { a.auditor = value; }, value)) useAudits.setState({ auditor: value.trim() });
              }} />
            <AuditDate audit={audit} disabled={live} />
            <PayPeriodSelect audit={audit} disabled={live} />
          </div>
        </div>
      </div>
      <div className="Box">
        <div className="Box-header">
          <h2 className="Box-title"><Icon name="home" /> {audit.site.name}</h2>
          <div className="Box-headerActions"><span className="Label"><Icon name="lock" />Managed by AGHS</span></div>
        </div>
        <div className="Box-body">
          <dl className="HomeFacts">
            <div><dt>Location</dt><dd>{audit.site.address || '—'}</dd></div>
            <div><dt>{audit.site.managerTitle || 'Lead/Manager'}</dt><dd>{audit.site.manager || '—'}</dd></div>
          </dl>
        </div>
        <div className="Box-body">
          <p className="HomeFacts-label">Individuals</p>
          <ul className="ResidentList">{sortNames(audit.site.residents).map((r) => <li key={r}><Avatar kind="residents" id={residentId(audit, r)} name={r} />{r}</li>)}</ul>
          <p className="FormField-caption">Site details are printed in the PDF’s Audit Information section. Each individual gets their own table in the audit log.</p>
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="NavBar">
        <a className="btn" href="#/audits"><Icon name="chevron-left" />All audits</a>
        <div className="NavBar-end"><button className="btn btn-primary" {...lock('setupNext')} onClick={() => next()}>Choose individuals<Icon name="chevron-right" /></button></div>
      </div>
    </>
  );
}
