import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { Icon } from '../icons/Icon.tsx';
import { parentsFor, recordCrumbs, type Crumb } from '../../app/navigation/trail.ts';
import { photoPath, requestPhoto } from '../../app/runtime/people.ts';
import { useData } from '../../app/store/stores.ts';

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const percentText = (r: number | null | undefined) => `${Math.round((r || 0) * 100)}%`;

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function clockTime(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${shortDate(iso)}, ${time}`;
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Auditing Department`;
  }, [title]);
}

export function Breadcrumbs({ items, className = '', remember = false }: { items: Crumb[]; className?: string; remember?: boolean }) {
  const location = useLocation();
  const hash = `#${location.pathname || '/'}`;
  const shown = remember && items.length > 1 ? [...parentsFor(location.key, hash, items.slice(0, -1)), items[items.length - 1]] : items;
  const signature = JSON.stringify(shown);
  useEffect(() => {
    recordCrumbs(location.key, hash, JSON.parse(signature) as Crumb[]);
  }, [location.key, hash, signature]);
  return (
    <nav aria-label="Breadcrumb">
      <ol className={`Breadcrumbs ${className}`}>
        {shown.map(([label, link], i) => (
          <li className="Breadcrumbs-item" key={`${i}-${label}`}>
            {i === shown.length - 1 ? <span aria-current="page">{label}</span> : <a href={link}>{label}</a>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Flash({ kind, icon, role, className = '', children }: { kind: 'error' | 'warn' | 'success' | 'info'; icon: string; role?: 'alert' | 'status'; className?: string; children: ReactNode }) {
  return (
    <div className={`flash flash-${kind}${className ? ` ${className}` : ''}`} role={role}>
      <Icon name={icon} />
      {children}
    </div>
  );
}

export function ErrorBox({ error }: { error: string }) {
  if (!error) return null;
  return <Flash kind="error" icon="alert" role="alert"><span>{error}</span></Flash>;
}

export function StatTile({ label, value, sub, small = false }: { label: ReactNode; value: ReactNode; sub: ReactNode; small?: boolean }) {
  return (
    <div className="StatTile">
      <span className="StatTile-label">{label}</span>
      <strong className={`StatTile-value ${small ? 'is-small' : ''}`}>{value}</strong>
      <span className="StatTile-sub">{sub}</span>
    </div>
  );
}

export function RateBar({ rate, label }: { rate: number; label: string }) {
  return (
    <span className="RateBar" role="img" aria-label={label}>
      <span className="RateBar-fill" style={{ width: `${Math.min(100, Math.round(rate * 100))}%` }} />
    </span>
  );
}

export function Avatar({ kind, id, name, className = '' }: { kind: string; id: string | null | undefined; name: string; className?: string }) {
  const path = photoPath(kind, id);
  const indexed = useData((s) => Boolean(path && s.photoIndex?.has(path)));
  const url = useData((s) => (path && s.photoIndex?.has(path) ? s.photoUrls.get(`${path}@${s.photoIndex.get(path) || ''}`) : undefined));
  useEffect(() => {
    if (indexed && !url) requestPhoto(path);
  }, [indexed, url, path]);
  if (url) return <img className={`InitialsAvatar ${className} InitialsAvatar--photo`} src={url} alt="" />;
  return <span className={`InitialsAvatar ${className}`} data-photo={indexed ? path || undefined : undefined}>{initials(name || '?')}</span>;
}

export function Blank({ icon, children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="Box">
      <div className="blankslate">
        {icon && <span className="blankslate-icon"><Icon name={icon} size={24} /></span>}
        {children}
      </div>
    </div>
  );
}
