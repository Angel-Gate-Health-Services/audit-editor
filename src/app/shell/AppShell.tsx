import { useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { configured } from '../../services/api/api.ts';
import { DialogHost } from '../../components/dialog/DialogHost.tsx';
import { LoginPage } from '../../features/auth/LoginPage.tsx';
import { ProgressArea } from '../../features/progress/ProgressArea.tsx';
import { LiveBar } from '../../features/audits/live/LiveBar.tsx';
import { NotConfiguredPage } from './pages.tsx';
import { Header } from './Header.tsx';
import { Footer, Toasts } from './Chrome.tsx';
import { RouteLayer } from '../motion/RouteLayer.tsx';
import { isAuditShell, pageKeyFor } from '../motion/director.ts';
import { useRouteParts } from '../navigation/hooks.ts';
import { setNavigator } from '../navigation/navigator.ts';
import { useAudits, useData, useProgress, useSession, useStatus, useUi } from '../store/stores.ts';
import { syncRouteServices } from '../runtime/audit-access.ts';


function useRouteServices() {
  const location = useLocation();
  useEffect(() => {
    syncRouteServices();
  }, [location]);
  useEffect(() => {
    const unsubscribe = [
      useAudits.subscribe(syncRouteServices),
      useData.subscribe((s, p) => { if (s.homes !== p.homes) syncRouteServices(); }),
      useProgress.subscribe((s, p) => { if (s.completions !== p.completions) syncRouteServices(); }),
      useUi.subscribe((s, p) => { if (s.pickingSite !== p.pickingSite) syncRouteServices(); }),
      useStatus.subscribe((s, p) => { if (s.viewerVersion !== p.viewerVersion) syncRouteServices(); }),
    ];
    return () => unsubscribe.forEach((u) => u());
  }, []);
}

function useRouteChangeEffects(signedIn: boolean) {
  const location = useLocation();
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    useUi.setState({ error: '' });
    useProgress.setState({ completeMsg: null, progressOpen: false });
    window.scrollTo(0, 0);
    const focusRoute = () => {
      const app = document.getElementById('app');
      const auto = app?.querySelector<HTMLElement>('[data-autofocus]');
      (auto || app)?.focus({ preventScroll: true });
    };
    focusRoute();
    const frame = requestAnimationFrame(() => {
      if (!document.activeElement || document.activeElement === document.body) focusRoute();
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, signedIn]);
}

function SignedInView() {
  const parts = useRouteParts();
  const location = useLocation();
  const instant = useStatus((s) => s.instant);
  const id = parts[1];
  const auditShell = isAuditShell(parts);
  const pageKey = pageKeyFor(parts, `#${location.pathname || '/'}`);
  useEffect(() => {
    if (instant) useStatus.setState({ instant: false });
  }, [instant, location.pathname]);
  return (
    <>
      <ProgressArea />
      <LiveBar />
      <RouteLayer scope="page" layerKey={pageKey} className={`PageView${auditShell ? ' PageView--audit' : ''}`} data-shell-key={auditShell ? `audit:${id}` : undefined}>
        <Outlet />
      </RouteLayer>
    </>
  );
}

function AuthView() {
  return (
    <div className="PageView PageView--auth">
      <LoginPage />
    </div>
  );
}

export function AppShell() {
  const navigate = useNavigate();
  const checked = useSession((s) => s.checked);
  const signedIn = useSession((s) => Boolean(s.profile));
  useLayoutEffect(() => {
    setNavigator((to, options) => { void navigate(to, options); });
    return () => setNavigator(null);
  }, [navigate]);
  useEffect(() => {
    const onClick = (ev: globalThis.MouseEvent) => {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const link = (ev.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
      const target = link.getAttribute('href') || '';
      if (!target.startsWith('#/')) return;
      ev.preventDefault();
      if (target === (window.location.hash || '#/')) return;
      void navigate(target.slice(1));
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [navigate]);
  useRouteServices();
  useRouteChangeEffects(signedIn);
  const skip = (ev: MouseEvent) => {
    ev.preventDefault();
    document.getElementById('app')?.focus();
  };
  return (
    <>
      <a className="skip-link" href="#app" onClick={skip}>Skip to content</a>
      <Header />
      <main id="app" className="AppMain" tabIndex={-1}>
        {!configured
          ? <div className="PageView PageView--auth"><NotConfiguredPage /></div>
          : !checked ? <div className="PageView PageView--auth" />
            : signedIn ? <SignedInView /> : <AuthView />}
      </main>
      <Toasts />
      <Footer />
      <DialogHost />
    </>
  );
}
