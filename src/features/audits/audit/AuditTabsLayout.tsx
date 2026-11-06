import { Outlet } from 'react-router';
import { allEntries, entryFlagged, fmtLong, payPeriod } from '../../../domain/audits/model.ts';
import { Icon } from '../../../components/icons/Icon.tsx';
import { Breadcrumbs, plural } from '../../../components/ui/basics.tsx';
import { useRouteParts } from '../../../app/navigation/hooks.ts';
import { href } from '../../../app/navigation/route.ts';
import { RouteLayer } from '../../../app/motion/RouteLayer.tsx';
import { TabIndicator } from '../../../app/motion/TabIndicator.tsx';
import { auditTabKey } from '../../../app/motion/director.ts';
import { completionOf } from '../../progress/progress.ts';
import { useAuditContext } from './context.tsx';
import type { Audit } from '../../../types/audit.ts';

export const auditLabel = (audit: Audit) => `${audit.site.name} · ${payPeriod(audit)}`;

export const LiveLabel = ({ text }: { text: string }) => <span className="Label LiveLabel"><span className="LiveLabel-dot" aria-hidden="true" />{text}</span>;

const TAB_FOR = { setup: 'details', general: 'general', pdf: 'pdf' } as Record<string, string>;

export function AuditTabsLayout() {
  const { audit } = useAuditContext();
  const parts = useRouteParts();
  const kind = parts[2];
  const current = kind ? TAB_FOR[kind] : 'people';
  const entries = allEntries(audit);
  const flagged = entries.filter(entryFlagged).length;
  const tabs: [string, string, string, string, number?][] = [
    ['details', 'Details', 'note', href('a', audit.id, 'setup')],
    ['people', 'Individuals', 'people', href('a', audit.id), audit.site.residents.length],
    ['general', 'General notes', 'checklist', href('a', audit.id, 'general')],
    ['pdf', 'PDF', 'file', href('a', audit.id, 'pdf')],
  ];
  return (
    <>
      <Breadcrumbs items={[['Audits', '#/audits'], [auditLabel(audit)]]} className="AuditBreadcrumbs" />
      <div className="PageHeader AuditHeader">
        <div>
          <h1 className="PageHeader-title">{audit.site.name}</h1>
          <p className="PageHeader-description" data-audit-summary="">Pay period {payPeriod(audit) || '—'} · Dated {fmtLong(audit.auditDate)}{audit.auditor ? ` · Audit by ${audit.auditor}` : ''}</p>
        </div>
        <div className="PageHeader-actions" data-audit-stats="">
          <span className="Label Label--large"><Icon name="clock" /> {plural(entries.length, 'shift')} reviewed</span>
          <span className={`Label Label--large ${flagged ? 'Label--danger' : ''}`}><Icon name={flagged ? 'issue-opened' : 'check-circle'} /> {flagged} flagged</span>
          {completionOf(audit) && <span className="Label Label--large Label--success"><Icon name="check-circle" /> Complete</span>}
        </div>
      </div>
      <nav className="UnderlineNav AuditTabs has-indicator" aria-label="Audit sections">
        {tabs.map(([key, label, ic, link, count]) => (
          <a key={key} className="UnderlineNav-item" data-audit-tab={key} href={link} aria-current={key === current ? 'page' : undefined}>
            <Icon name={ic} /><span>{label}</span>{count != null ? <span className="Counter">{count}</span> : null}
          </a>
        ))}
        <TabIndicator activeKey={current} />
      </nav>
      <RouteLayer scope="outlet" layerKey={auditTabKey(parts)} className="RouteOutlet">
        <Outlet />
      </RouteLayer>
    </>
  );
}
