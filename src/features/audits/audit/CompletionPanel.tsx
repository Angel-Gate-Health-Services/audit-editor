import { canReopenCompletion, completionMatchesAudit } from '../../../domain/audits/progress.ts';
import { Icon } from '../../../components/icons/Icon.tsx';
import { shortDate } from '../../../components/ui/basics.tsx';
import { useProgress, useSession } from '../../../app/store/stores.ts';
import { action } from '../../../app/runtime/actions.ts';
import { completionReadiness, homeCompletionOf } from '../../progress/progress.ts';
import { useProgressInputs } from '../../progress/ProgressArea.tsx';
import { reopenHome } from '../../progress/actions.ts';
import { markAuditComplete } from '../audit-actions.ts';
import { useLock } from './context.tsx';
import type { Audit } from '../../../types/audit.ts';

const reopen = action('reopenHome', reopenHome);
const complete = action('markAuditComplete', markAuditComplete);

export function CompletionPanel({ audit, name = null }: { audit: Audit; name?: string | null }) {
  const profile = useProgressInputs();
  const msg = useProgress((s) => s.completeMsg);
  const completing = useProgress((s) => s.completing);
  const lock = useLock();
  const userId = useSession((s) => s.profile?.id);
  const flash = msg ? <div className={`flash ${msg.ok ? 'flash-success' : 'flash-error'}`} role="status"><Icon name={msg.ok ? 'check-circle' : 'alert'} /><span>{msg.text}</span></div> : null;
  const rec = homeCompletionOf(audit);
  if (rec) {
    const linked = completionMatchesAudit(rec, audit, userId);
    return (
      <>
        {flash}
        <div className="Box CompletePanel is-complete"><div className="Box-row">
          <span className="CompletePanel-icon"><Icon name="check-circle" size={24} /></span>
          <div className="flex-1">
            <p className="CompletePanel-title">{linked ? 'Audit complete' : 'Site already audited'}</p>
            <p className="CompletePanel-text">Marked complete by {rec.completed_by_name || 'a user'} on {shortDate(rec.completed_at)}. {audit.site.name} counts toward this pay period’s progress.</p>
          </div>
          {canReopenCompletion(rec, profile) && <button className="btn btn-sm" disabled={completing} {...lock('reopenHome')} onClick={() => reopen(rec.id, audit.payStart)}><Icon name="undo" />Reopen</button>}
        </div></div>
      </>
    );
  }
  const { left, ready } = completionReadiness(audit, name);
  if (!ready) return flash;
  const text = left.length === 0
    ? `Every individual at ${audit.site.name} is done.`
    : name && left[0] === name
      ? `${name} is the last individual. When you’re done here, mark the audit complete.`
      : `Only ${left[0]} is left.`;
  return (
    <>
      {flash}
      <div className="Box CompletePanel"><div className="Box-row">
        <span className="CompletePanel-icon"><Icon name="checklist" size={24} /></span>
        <div className="flex-1">
          <p className="CompletePanel-title">Ready to finish this audit</p>
          <p className="CompletePanel-text">{text} Marking it complete updates the pay period progress for everyone.</p>
        </div>
        <button className="btn btn-primary" disabled={completing} {...lock('markAuditComplete')} onClick={() => complete()}><Icon name={completing ? 'sync' : 'check'} />Mark audit as complete</button>
      </div></div>
    </>
  );
}
