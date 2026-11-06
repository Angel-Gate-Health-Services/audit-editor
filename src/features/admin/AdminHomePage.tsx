import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { Icon } from '../../components/icons/Icon.tsx';
import { Avatar, Breadcrumbs, useTitle } from '../../components/ui/basics.tsx';
import { Field } from '../../components/ui/Field.tsx';
import { useAdmin, useData, type HomeDraft } from '../../app/store/stores.ts';
import { action } from '../../app/runtime/actions.ts';
import { allSites, refreshHomes } from '../../app/runtime/people.ts';
import { MissingPage } from '../../app/shell/pages.tsx';
import { PhotoControls } from './PhotoControls.tsx';
import { AdminFlash } from './shared.tsx';
import {
  adminAddResident, adminCancelEditHome, adminDeleteHome, adminEditHome, adminRemoveResident, adminRenameResident, adminSaveHome, homeDraftFor,
} from './admin-actions.ts';
import type { Home, ResidentRow } from '../../types/audit.ts';

const a = {
  save: action('adminSaveHome', adminSaveHome),
  edit: action('adminEditHome', adminEditHome),
  cancel: action('adminCancelEditHome', adminCancelEditHome),
  remove: action('adminDeleteHome', adminDeleteHome),
  addResident: action('adminAddResident', adminAddResident),
  renameResident: action('adminRenameResident', adminRenameResident),
  removeResident: action('adminRemoveResident', adminRemoveResident),
};

function HomeFact({ label, value, link = '' }: { label: string; value: string; link?: string }) {
  return <div><dt>{label}</dt><dd>{value ? (link ? <a href={link}>{value}</a> : value) : <span className="color-fg-muted">—</span>}</dd></div>;
}

function HomeInfo({ home }: { home: Home }) {
  const residents = home.residentRows;
  return (
    <>
      <Breadcrumbs items={[['Home', '#/'], ['Admin dashboard', '#/dashboard'], ['Sites', '#/dashboard/sites'], [home.name]]} />
      <div className="PageHeader">
        <div className="PageHeader-lead">
          <span className="UnlockHero-icon AdminHomeIcon"><Icon name="home" size={20} /></span>
          <div>
            <h1 className="PageHeader-title">{home.name}</h1>
            <p className="PageHeader-description">{home.address || 'No address'}</p>
          </div>
        </div>
        <div className="PageHeader-actions"><button className="btn btn-primary" onClick={() => a.edit(home.id)}><Icon name="pencil" />Edit</button></div>
      </div>
      <AdminFlash />
      <div className="Box">
        <div className="Box-header"><h2 className="Box-title">Site details</h2></div>
        <div className="Box-body">
          <dl className="HomeFacts">
            <HomeFact label="Site name" value={home.name} />
            <HomeFact label="Phone" value={home.phone} link={home.phone && `tel:${home.phone.replace(/[^\d+]/g, '')}`} />
            <HomeFact label="Address" value={home.address} />
            <HomeFact label={home.managerTitle || 'Lead'} value={home.manager} />
            <HomeFact label="Cell phone" value={home.cell} link={home.cell && `tel:${home.cell.replace(/[^\d+]/g, '')}`} />
            <HomeFact label="Email" value={home.email} link={home.email && `mailto:${home.email}`} />
            <HomeFact label="Supervisor" value={home.supervisor} />
          </dl>
        </div>
      </div>
      <div className="Box">
        <div className="Box-header"><h2 className="Box-title">Individuals</h2><span className="Counter">{residents.length}</span></div>
        <div className="Box-body">
          {residents.length
            ? <ul className="ResidentList">{residents.map((r) => <li key={r.id}><Avatar kind="residents" id={r.id} name={r.name} />{r.name}</li>)}</ul>
            : <p className="m-0 color-fg-muted">No individuals yet. Click Edit to add them.</p>}
        </div>
      </div>
      <div className="NavBar"><a className="btn" href="#/dashboard/sites"><Icon name="chevron-left" />All sites</a></div>
    </>
  );
}

function ResidentEdit({ r }: { r: ResidentRow }) {
  const [name, setName] = useState(r.name);
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    a.renameResident(r.id, name);
  };
  return (
    <div className="Box-row">
      <Avatar kind="residents" id={r.id} name={r.name} />
      <form className="InlineAdd ResidentEdit" onSubmit={submit}>
        <input className="form-control" type="text" name="name" value={name} aria-label={`Name of ${r.name}`} onChange={(ev) => setName(ev.target.value)} />
        <button className="btn btn-sm" type="submit">Rename</button>
      </form>
      <PhotoControls kind="residents" id={r.id} name={r.name} />
      <button className="btn-octicon btn-octicon-danger" aria-label={`Remove ${r.name}`} title="Remove" onClick={() => a.removeResident(r.id, r.name)}><Icon name="trash" /></button>
    </div>
  );
}

function AddResident({ id }: { id: string }) {
  const [name, setName] = useState('');
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    a.addResident(id, name, () => setName(''));
  };
  return (
    <form className="InlineAdd" onSubmit={submit}>
      <input className="form-control" type="text" name="name" placeholder="Full name" aria-label="New individual’s name" value={name} onChange={(ev) => setName(ev.target.value)} />
      <button className="btn" type="submit"><Icon name="plus" />Add individual</button>
    </form>
  );
}

function HomeEditor({ id, home, d }: { id: string; home: Home | null; d: HomeDraft }) {
  const busy = useAdmin((s) => s.busy);
  const isNew = id === 'new';
  const residents = home?.residentRows || [];
  const patch = (p: Partial<HomeDraft>) => useAdmin.setState((s) => ({ draft: s.draft ? { ...s.draft, ...p } : s.draft }));
  const field = (bind: keyof HomeDraft, label: string, extra: { type?: string; placeholder?: string; wide?: boolean; autoFocus?: boolean } = {}): ReactNode => (
    <Field bind={`draft:${bind}`} label={label} value={d[bind]} type={extra.type} placeholder={extra.placeholder} wide={extra.wide} autoFocus={extra.autoFocus} onCommit={(value) => patch({ [bind]: value })} />
  );
  return (
    <>
      <Breadcrumbs items={[['Home', '#/'], ['Admin dashboard', '#/dashboard'], ['Sites', '#/dashboard/sites'], [isNew ? 'Add site' : home!.name]]} />
      <div className="PageHeader">
        <div className="PageHeader-lead">
          <span className="UnlockHero-icon AdminHomeIcon"><Icon name="home" size={20} /></span>
          <div>
            <h1 className="PageHeader-title">{isNew ? 'Add a site' : home!.name}</h1>
            <p className="PageHeader-description">{isNew ? 'Save the site first, then add its individuals.' : 'Editing. Changes are shared with every signed-in user.'}</p>
          </div>
        </div>
        {isNew ? null : <div className="PageHeader-actions"><button className="btn" onClick={() => a.cancel()}><Icon name="x" />Done editing</button></div>}
      </div>
      <AdminFlash />
      <div className="Box">
        <div className="Box-header"><h2 className="Box-title">Site details</h2></div>
        <div className="Box-body">
          <div className="FormGrid">
            {field('name', 'Site name', { placeholder: 'e.g. Example Site', autoFocus: isNew })}
            {field('phone', 'Phone', { type: 'tel' })}
            {field('address', 'Address', { placeholder: 'Street, City ST 00000', wide: true })}
            <div className="FormField">
              <label className="FormField-label" htmlFor="f-draft-managerTitle">Title</label>
              <select className="form-select" id="f-draft-managerTitle" value={d.managerTitle} onChange={(ev) => patch({ managerTitle: ev.target.value })}>
                {['Lead', 'Manager'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            {field('manager', 'Lead / Manager name')}
            {field('cell', 'Cell phone', { type: 'tel' })}
            {field('email', 'Email', { type: 'email' })}
            {field('supervisor', 'Supervisor')}
          </div>
        </div>
        <div className="Box-footer">
          {isNew ? null : <button className="btn btn-danger" onClick={() => a.remove(id)}><Icon name="trash" />Delete site</button>}
          <div className="NavBar-end">
            {isNew ? null : <button className="btn" onClick={() => a.cancel()}>Cancel</button>}
            <button className="btn btn-primary" disabled={busy} onClick={() => a.save(id)}><Icon name="check" />{isNew ? 'Create site' : 'Save changes'}</button>
          </div>
        </div>
      </div>
      {isNew ? null : (
        <div className="Box">
          <div className="Box-header"><h2 className="Box-title">Individuals</h2><span className="Counter">{residents.length}</span></div>
          {residents.length ? residents.map((r) => <ResidentEdit key={`${r.id}:${r.name}`} r={r} />) : <div className="blankslate blankslate--narrow"><p>No individuals yet.</p></div>}
          <div className="Box-footer"><AddResident id={id} /></div>
        </div>
      )}
      <div className="NavBar"><a className="btn" href="#/dashboard/sites"><Icon name="chevron-left" />All sites</a></div>
    </>
  );
}

export default function AdminHomePage() {
  const id = useParams().homeId;
  const homesState = useData((s) => s.homes);
  const draft = useAdmin((s) => s.draft);
  const draftFor = useAdmin((s) => s.draftFor);
  const editHome = useAdmin((s) => s.editHome);
  const isNew = id === 'new';
  const home = homesState && !isNew ? allSites().find((h) => h.id === id) || null : null;
  useEffect(() => {
    if (homesState === null) void refreshHomes();
  }, [homesState]);
  useEffect(() => {
    if (homesState !== null && useAdmin.getState().draftFor !== (id ?? null)) useAdmin.setState({ draftFor: id ?? null, draft: homeDraftFor(id) });
  }, [homesState, id, draftFor]);
  useTitle(homesState === null ? 'Site' : isNew ? 'Add site' : home ? home.name : 'Not found');
  if (homesState === null) return <div className="Box"><div className="blankslate"><p>Loading…</p></div></div>;
  if (!isNew && !home) return <MissingPage />;
  if (!isNew && editHome !== id) return <HomeInfo home={home!} />;
  if (!draft || draftFor !== (id ?? null)) return null;
  return <HomeEditor id={id} home={home} d={draft} />;
}
