import { entryComplete, entryFlagged, individualDone, sortNames } from '../../../domain/audits/model.ts';
import { Icon } from '../../../components/icons/Icon.tsx';
import { Avatar, initials, plural, useTitle } from '../../../components/ui/basics.tsx';
import { useData } from '../../../app/store/stores.ts';
import { photoPath, residentId } from '../../../app/runtime/people.ts';
import { livePosition } from '../../../app/runtime/audit-access.ts';
import { href } from '../../../app/navigation/route.ts';
import { CompletionPanel } from './CompletionPanel.tsx';
import { LiveLabel } from './AuditTabsLayout.tsx';
import { useAuditContext } from './context.tsx';

export function HubPage() {
  const { audit, live } = useAuditContext();
  useTitle(`${audit.site.name} · Individuals`);
  const photoIndex = useData((s) => s.photoIndex);
  useData((s) => s.homes);
  const rows = sortNames(audit.site.residents).map((name) => {
    const ind = Object.hasOwn(audit.individuals, name) ? audit.individuals[name] : null;
    const entries = ind?.entries || [];
    const flagged = entries.filter(entryFlagged).length;
    const unfinished = entries.some((e) => !entryComplete(e));
    const done = individualDone(audit, name);
    const adequate = ind?.adequate && !flagged;
    const rid = residentId(audit, name);
    const path = photoPath('residents', rid);
    return (
      <a key={name} className="Box-row Box-row--link" href={href('a', audit.id, 'i', name)}>
        {path && photoIndex?.has(path)
          ? <Avatar kind="residents" id={rid} name={name} className={done ? 'InitialsAvatar--doneRing' : ''} />
          : <span className={`InitialsAvatar ${done ? 'InitialsAvatar--done' : ''}`}>{done ? <Icon name="check" /> : initials(name)}</span>}
        <span className="PersonRow-main">
          <span className="PersonRow-name d-block">{name}</span>
          <span className="PersonRow-meta">{entries.length ? `${plural(entries.length, 'shift')} reviewed` : adequate ? 'Reviewed, nothing to flag' : 'Not started'}</span>
        </span>
        {live && livePosition().individual === name ? <LiveLabel text="Currently auditing" /> : null}
        {unfinished ? <span className="Label Label--attention">Unfinished</span> : null}
        {adequate ? <span className="Label Label--success"><Icon name="check" />Adequate</span>
          : entries.length ? <span className={`Label ${flagged ? 'Label--danger' : ''}`}>{flagged ? `${flagged} flagged` : 'Nothing flagged yet'}</span> : null}
        <span className="PersonRow-chevron"><Icon name="chevron-right" /></span>
      </a>
    );
  });
  return (
    <>
      <div>
        <h2 className="SectionHeading">Which individual would you like to audit?</h2>
        <p className="PageHeader-description">Come back here any time to switch between individuals.</p>
      </div>
      <div className="Box">
        {rows.length ? rows : <div className="blankslate blankslate--narrow"><p>No individuals are listed for this site. Add them to your sites file and import it again.</p></div>}
      </div>
      <CompletionPanel audit={audit} />
      <div className="NavBar">
        <a className="btn" href={href('a', audit.id, 'setup')}><Icon name="chevron-left" />Details</a>
        <div className="NavBar-end"><a className="btn btn-primary" href={href('a', audit.id, 'general')}>General notes<Icon name="chevron-right" /></a></div>
      </div>
    </>
  );
}
