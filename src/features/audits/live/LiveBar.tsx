import { Icon } from '../../../components/icons/Icon.tsx';
import { useAudits, useSession, useStatus, useUi } from '../../../app/store/stores.ts';
import { useRouteParts } from '../../../app/navigation/hooks.ts';
import { findAudit } from '../../../app/runtime/audit-access.ts';

export function LiveBar() {
  const signedIn = useSession((s) => Boolean(s.profile));
  const [area, id] = useRouteParts();
  const watching = useStatus((s) => s.viewer);
  const publishing = useStatus((s) => s.publishingAuditId);
  const viewers = useUi((s) => s.liveViewers);
  useAudits((s) => s.audits);
  if (!signedIn || area !== 'a') return null;
  if (watching?.auditId === id && watching.live && !findAudit(id)) {
    const { ownerName, active, updatedAt } = watching.live;
    const when = updatedAt ? new Date(updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '';
    const status = watching.status === 'gone'
      ? `${ownerName} has left this audit. This is the last version they shared.`
      : active ? `Live · updates as they work · last change ${when}` : `${ownerName} isn’t working on it right now · last change ${when}`;
    return (
      <div className="LiveBar is-viewing" role="status">
        <span className="LiveBar-icon"><Icon name="eye" /></span>
        <span className="LiveBar-text"><strong>Viewing {ownerName}’s audit</strong><span>View only. {status}</span></span>
        <a className="btn btn-sm" href="#/new">Stop viewing</a>
      </div>
    );
  }
  const mine = findAudit(id);
  if (mine && publishing === mine.id && viewers.length) {
    const names = viewers.map((v) => v.viewer_name);
    const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    return (
      <div className="LiveBar is-watched" role="status">
        <span className="LiveBar-icon"><Icon name="eye" /></span>
        <span className="LiveBar-text"><strong>{who} {names.length === 1 ? 'is' : 'are'} viewing this audit</strong><span>Admins can see your progress as you work. They can’t change anything.</span></span>
      </div>
    );
  }
  return null;
}
