import { useEffect, useRef } from 'react';
import { Icon } from '../../components/icons/Icon.tsx';
import { Logo } from '../../components/icons/Logo.tsx';
import { Avatar } from '../../components/ui/basics.tsx';
import { THEMES, applyTheme, themeInfo, useTheme } from '../../features/settings/theme.ts';
import { useSession, useStatus } from '../store/stores.ts';
import { sessionTimerState, signOutNow } from '../runtime/session-runtime.ts';

function SaveState() {
  const text = useStatus((s) => s.saveState);
  return <div className="Header-item AppHeader-save" id="save-state" aria-live="polite">{text}</div>;
}

function SessionTimer() {
  const signedIn = useSession((s) => Boolean(s.profile));
  const seconds = useStatus((s) => s.sessionSeconds);
  const warning = useStatus((s) => s.sessionWarning);
  if (!signedIn) return <div className="Header-item AppHeader-session" id="session-timer" title="Session time remaining" hidden />;
  const state = sessionTimerState(seconds, warning);
  const className = ['Header-item', 'AppHeader-session', state.active && 'is-active', state.idle && 'is-idle', state.danger && 'is-warning'].filter(Boolean).join(' ');
  return (
    <div className={className} id="session-timer" title={state.active ? 'Session active' : state.danger ? 'Session expires in one minute or less' : 'Session inactivity timer'}>
      <Icon name={state.active ? 'check-circle' : state.danger ? 'alert-circle' : 'clock'} />
      <span>{state.label}</span>
    </div>
  );
}

function useEscapeToClose(ref: React.RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const menu = ref.current;
      if (ev.key === 'Escape' && menu?.open) {
        menu.removeAttribute('open');
        menu.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ref]);
}

function ThemeMenu() {
  const mode = useTheme((s) => s.mode);
  const ref = useRef<HTMLDetailsElement>(null);
  useEscapeToClose(ref);
  return (
    <div className="Header-item">
      <details className="details-reset details-overlay ThemeMenu" id="theme-menu" ref={ref}>
        <summary className="AppHeader-iconBtn" aria-haspopup="menu" aria-label="Theme" title="Theme">
          <span id="theme-icon"><Icon name={themeInfo(mode)[2]} /></span>
        </summary>
        <div className="SelectMenu right-0">
          <div className="SelectMenu-modal ThemeMenu-modal">
            <div className="SelectMenu-header"><span className="SelectMenu-title">Theme</span></div>
            <div className="SelectMenu-list" role="menu" id="theme-options">
              {THEMES.map(([value, label, ic]) => (
                <button
                  key={value}
                  className="SelectMenu-item"
                  role="menuitemradio"
                  aria-checked={value === mode}
                  data-theme={value}
                  onClick={() => {
                    applyTheme(value);
                    ref.current?.removeAttribute('open');
                  }}
                >
                  <Icon name={ic} /><span>{label}</span><span className="ThemeMenu-check"><Icon name="check" /></span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function UserMenu() {
  const p = useSession((s) => s.profile);
  const ref = useRef<HTMLDetailsElement>(null);
  if (!p) return <div className="Header-item mr-0" id="user-menu" />;
  const close = () => ref.current?.removeAttribute('open');
  return (
    <div className="Header-item mr-0" id="user-menu">
      <details className="details-reset details-overlay ThemeMenu" id="user-details" ref={ref}>
        <summary className="UserMenu-button" aria-haspopup="menu" aria-label={`Account menu for ${p.username}`}>
          <Avatar kind="users" id={p.id} name={p.display_name || p.username} className="UserMenu-avatar" />
        </summary>
        <div className="SelectMenu right-0">
          <div className="SelectMenu-modal ThemeMenu-modal">
            <div className="SelectMenu-header UserMenu-head">
              <span className="SelectMenu-title">{p.display_name || p.username}</span>
              <span className="f6 color-fg-muted">{p.username}{p.is_admin ? ' · Admin' : ''}</span>
            </div>
            <div className="SelectMenu-list" role="menu">
              <a className="SelectMenu-item" role="menuitem" href="#/" onClick={close}><Icon name="home" /><span>Homepage</span></a>
              {p.is_admin
                ? <a className="SelectMenu-item" role="menuitem" href="#/dashboard" onClick={close}><Icon name="shield-lock" /><span>Admin dashboard</span></a>
                : <a className="SelectMenu-item" role="menuitem" href="#/settings" onClick={close}><Icon name="gear" /><span>Settings</span></a>}
              <button className="SelectMenu-item" role="menuitem" data-signout="" onClick={(ev) => { ev.preventDefault(); void signOutNow(); }}>
                <Icon name="arrow-left" /><span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

export function Header() {
  return (
    <header className="Header AppHeader">
      <div className="AppHeader-inner">
        <a className="Header-item AppHeader-brand" href="#/" aria-label="AGHS Auditing Department home">
          <span className="AppHeader-logo"><Logo id="header" decorative /></span>
        </a>
        <div className="Header-item Header-item--full" />
        <SaveState />
        <SessionTimer />
        <ThemeMenu />
        <UserMenu />
      </div>
    </header>
  );
}
