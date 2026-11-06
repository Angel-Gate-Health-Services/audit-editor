import type { ReactNode } from 'react';
import * as api from '../../services/api/api.ts';
import { APP_VERSION, ORG } from '../../domain/audits/config.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { Breadcrumbs, useTitle } from '../../components/ui/basics.tsx';
import { Field } from '../../components/ui/Field.tsx';
import { useSession, useUi, type Message } from '../../app/store/stores.ts';
import { action } from '../../app/runtime/actions.ts';
import { SESSION_DURATION_SECONDS } from '../../app/runtime/session-runtime.ts';
import { THEMES, applyPalette, applyTheme, useTheme, type ThemeMode } from './theme.ts';
import { PALETTES, PALETTE_COLORS, type Palette } from './palettes.ts';

const setSettings = (patch: Partial<{ password: string; busy: boolean; message: Message | null }>) => useUi.setState((s) => ({ settings: { ...s.settings, ...patch } }));

export async function saveMyPassword() {
  const st = useUi.getState().settings;
  if (st.busy) return;
  if ((st.password || '').length < 6) {
    setSettings({ message: { ok: false, text: 'Passwords need at least 6 characters.' } });
    return;
  }
  setSettings({ busy: true, message: null });
  try {
    await api.changeOwnPassword(st.password);
    setSettings({ password: '', message: { ok: true, text: 'Your password was changed. Use it next time you sign in.' } });
  } catch (err) {
    setSettings({ message: { ok: false, text: (err as Error).message } });
  } finally {
    setSettings({ busy: false });
  }
}

const setTheme = action('setTheme', (mode: ThemeMode) => applyTheme(mode));
const setPalette = action('setPalette', (id: string) => applyPalette(id));

function PalettePreview({ palette }: { palette: Palette }) {
  const scheme = useTheme((s) => s.scheme);
  const c = PALETTE_COLORS[palette.id][scheme];
  return (
    <span className="PalettePreview" aria-hidden="true" style={{ background: c.bg, borderColor: c.border }}>
      <span className="PalettePreview-bar" style={{ background: c.header }}><span style={{ background: c.headerFg }} /></span>
      <span className="PalettePreview-body">
        <span className="PalettePreview-line" style={{ background: c.fg }} />
        <span className="PalettePreview-line is-short" style={{ background: c.fgMuted }} />
        <span className="PalettePreview-dots">
          {[c.accent, c.success, c.attention, c.danger, c.done].map((color, i) => <span key={i} style={{ background: color }} />)}
        </span>
      </span>
    </span>
  );
}

function PaletteChoices() {
  const current = useTheme((s) => s.palette);
  const scheme = useTheme((s) => s.scheme);
  return (
    <div className="PaletteGroups">
      {(['GitHub', 'Community'] as const).map((group) => (
        <div key={group} className="PaletteGroup" role="radiogroup" aria-label={`${group} colour palettes`}>
          <h3 className="PaletteGroup-title">{group}</h3>
          <div className="PaletteChoices">
            {PALETTES.filter((p) => p.group === group).map((p) => (
              <button key={p.id} type="button" className="PaletteChoice" role="radio" aria-checked={p.id === current} data-palette-choice={p.id} title={`${p.description} Colours from ${p.source.label}.`} onClick={() => setPalette(p.id)}>
                <PalettePreview palette={p} />
                <span className="PaletteChoice-name">{p.name}{p.id === current ? <Icon name="check" size={14} /> : null}</span>
                <span className="PaletteChoice-desc">{p.description}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="FormField-caption">Saves automatically in this browser. Colours come unchanged from each palette’s official source. Previews show the {scheme} version; each palette has a light and a dark version that follows the mode above.</p>
    </div>
  );
}
const savePassword = action('saveMyPassword', saveMyPassword);

export function ThemeChoices() {
  const mode = useTheme((s) => s.mode);
  return (
    <div className="Box">
      <div className="Box-header"><h2 className="Box-title">Appearance</h2></div>
      <div className="Box-body">
        <div className="ThemeChoices" role="radiogroup" aria-label="Theme">
          {THEMES.map(([value, label, ic]) => (
            <button key={value} className="ThemeChoice" role="radio" aria-checked={value === mode} onClick={() => setTheme(value)}>
              <span className="ThemeChoice-icon"><Icon name={ic} size={20} /></span>
              <span className="ThemeChoice-label">{label}</span>
              <span className="ThemeChoice-desc">{value === 'auto' ? 'Match this device' : `Always ${label.toLowerCase()}`}</span>
            </button>
          ))}
        </div>
        <p className="FormField-caption">Saved in this browser only. The theme button in the header does the same.</p>
        <h3 className="Appearance-subtitle">Colour palette</h3>
        <PaletteChoices />
      </div>
    </div>
  );
}

export const Fact = ({ label, children }: { label: ReactNode; children: ReactNode }) => <div><dt>{label}</dt><dd>{children}</dd></div>;

export function SettingsPage() {
  useTitle('Settings');
  const me = useSession((s) => s.profile)!;
  const st = useUi((s) => s.settings);
  return (
    <>
      <Breadcrumbs items={[['Home', '#/'], ['Settings']]} />
      <div className="PageHeader">
        <div>
          <h1 className="PageHeader-title">Settings</h1>
          <p className="PageHeader-description">Your theme, your account and how sign-in protection works.</p>
        </div>
      </div>
      {st.message && <div className={`flash ${st.message.ok ? 'flash-success' : 'flash-error'}`} role="status"><Icon name={st.message.ok ? 'check-circle' : 'alert'} /><span>{st.message.text}</span></div>}
      <ThemeChoices />
      <div className="Box">
        <div className="Box-header"><h2 className="Box-title">Your account</h2></div>
        <div className="Box-body">
          <div className="FormGrid">
            <Field bind="mySettings:username" label="Username" value={me.username} onCommit={() => {}} readOnly hint="Usernames can’t be changed." />
            <Field bind="mySettings:name" label="Full name" value={me.display_name || ''} onCommit={() => {}} readOnly hint="Fills “Audit by” on your new audits. Ask an admin to change it." />
            <Field bind="mySettings:password" label="New password" type="password" value={st.password} onCommit={(password) => setSettings({ password })} hint="At least 6 characters." input={{ autoComplete: 'new-password' }} />
          </div>
        </div>
        <div className="Box-footer Box-footer--end">
          <button className="btn btn-primary" disabled={st.busy} onClick={() => savePassword()}><Icon name="key" />Change password</button>
        </div>
      </div>
      <div className="Box">
        <div className="Box-header"><h2 className="Box-title">Sign-in protection</h2><span className="Label"><Icon name="lock" size={12} />Always on</span></div>
        <div className="Box-body">
          <dl className="HomeFacts">
            <Fact label="Automatic sign-out">After {SESSION_DURATION_SECONDS / 60} minutes without activity, with a warning in the last minute</Fact>
            <Fact label="New tabs and links">Always ask for sign-in again</Fact>
            <Fact label="Your audits">Saved to your account, so they show up wherever you sign in</Fact>
          </dl>
        </div>
      </div>
      <div className="Box">
        <div className="Box-header"><h2 className="Box-title">About</h2></div>
        <div className="Box-body">
          <dl className="HomeFacts">
            <Fact label="Version">v{APP_VERSION}</Fact>
            <Fact label="Department">{ORG.name} · {ORG.department}</Fact>
          </dl>
        </div>
      </div>
    </>
  );
}
