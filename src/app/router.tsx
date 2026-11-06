import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createHashRouter, Navigate, useParams } from 'react-router';
import { AppShell } from './shell/AppShell.tsx';
import { MissingPage, LoadingBlank } from './shell/pages.tsx';
import { useSession } from './store/stores.ts';
import { installMotionDirector } from './motion/director.ts';
import { enableTrail, installTrail, resetTrail } from './navigation/trail.ts';
import { DepartmentPage } from '../features/department/DepartmentPage.tsx';
import { PayPeriodsPage } from '../features/department/PayPeriodsPage.tsx';
import { AuditsPage } from '../features/audits/AuditsPage.tsx';
import { MyAuditsPage } from '../features/audits/MyAuditsPage.tsx';
import { NewAuditPage } from '../features/audits/NewAuditPage.tsx';
import { AuditGate } from '../features/audits/audit/AuditGate.tsx';
import { AuditTabsLayout } from '../features/audits/audit/AuditTabsLayout.tsx';
import { HubPage } from '../features/audits/audit/HubPage.tsx';
import { SetupPage } from '../features/audits/audit/SetupPage.tsx';
import { GeneralPage } from '../features/audits/audit/GeneralPage.tsx';
import { PdfPage } from '../features/audits/audit/PdfPage.tsx';
import { IndividualPage } from '../features/audits/audit/IndividualPage.tsx';
import { EntryPage } from '../features/audits/audit/EntryPage.tsx';

type PageModule = { default: ComponentType };

const preloaders: (() => Promise<PageModule>)[] = [];

function preloadable(load: () => Promise<PageModule>) {
  let loaded: PageModule | null = null;
  let pending: Promise<PageModule> | null = null;
  const fetchModule = () => (pending ||= load().then((mod) => (loaded = mod), (error: unknown) => {
    pending = null;
    throw error;
  }));
  preloaders.push(fetchModule);
  return lazy(() => (loaded ? ({ then: (resolve: (mod: PageModule) => void) => resolve(loaded!) } as unknown as Promise<PageModule>) : fetchModule()));
}

export function preloadRoutes() {
  for (const preload of preloaders) void preload().catch(() => undefined);
}

const EmployeesPage = preloadable(() => import('../features/staff/EmployeesPage.tsx'));
const EmployeePage = preloadable(() => import('../features/staff/EmployeePage.tsx'));
const HomesPage = preloadable(() => import('../features/staff/HomesPage.tsx'));
const HomeStatsPage = preloadable(() => import('../features/staff/HomeStatsPage.tsx'));
const AdminDashboardPage = preloadable(() => import('../features/admin/AdminDashboardPage.tsx'));
const AdminTabsPage = preloadable(() => import('../features/admin/AdminTabsPage.tsx'));
const AdminHomePage = preloadable(() => import('../features/admin/AdminHomePage.tsx'));
const SettingsPage = preloadable(() => import('../features/settings/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage })));
const TimeTrackingPage = preloadable(() => import('../features/timeclock/TimeTrackingPage.tsx'));
const ShiftsPage = preloadable(() => import('../features/timeclock/ShiftsPage.tsx'));

const loading = <LoadingBlank text="Loading…" />;
const lazily = (node: ReactNode) => <Suspense fallback={loading}>{node}</Suspense>;

function AdminOnly({ children }: { children: ReactNode }) {
  const admin = useSession((s) => Boolean(s.profile?.is_admin));
  return admin ? lazily(children) : <MissingPage />;
}

function SettingsRoute() {
  const admin = useSession((s) => Boolean(s.profile?.is_admin));
  return admin ? <Navigate to="/dashboard/settings" replace /> : lazily(<SettingsPage />);
}

function RenamedRedirect({ to }: { to: string }) {
  const params = useParams();
  const rest = params['*'] ? `/${params['*']}` : '';
  return <Navigate to={`${to}${rest}`} replace />;
}

function LegacyAdminRedirect() {
  const params = useParams();
  const rest = params['*'] ? `/${params['*']}` : '';
  return <Navigate to={`/dashboard${rest}`} replace />;
}

export const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <DepartmentPage /> },
      { path: 'audits', element: <AuditsPage /> },
      { path: 'pay-periods', element: <PayPeriodsPage /> },
      { path: 'my-audits', element: <MyAuditsPage /> },
      { path: 'settings', element: <SettingsRoute /> },
      { path: 'admin/*', element: <LegacyAdminRedirect /> },
      { path: 'admin', element: <LegacyAdminRedirect /> },
      { path: 'homes/*', element: <RenamedRedirect to="/sites" /> },
      { path: 'dashboard/homes/*', element: <RenamedRedirect to="/dashboard/sites" /> },
      { path: 'dashboard/home/*', element: <RenamedRedirect to="/dashboard/site" /> },
      { path: 'dashboard', element: <AdminOnly><AdminDashboardPage /></AdminOnly> },
      { path: 'dashboard/site/:homeId?', element: <AdminOnly><AdminHomePage /></AdminOnly> },
      { path: 'dashboard/:section/*', element: <AdminOnly><AdminTabsPage /></AdminOnly> },
      { path: 'employees', element: lazily(<EmployeesPage />) },
      { path: 'employees/name/:key/*', element: lazily(<EmployeePage />) },
      { path: 'employees/:id/*', element: lazily(<EmployeePage />) },
      { path: 'sites', element: lazily(<HomesPage />) },
      { path: 'time', element: lazily(<TimeTrackingPage />) },
      { path: 'shifts', element: lazily(<ShiftsPage />) },
      { path: 'sites/:key/*', element: lazily(<HomeStatsPage />) },
      { path: 'new/*', element: <NewAuditPage /> },
      {
        path: 'a/:auditId',
        element: <AuditGate />,
        children: [
          {
            element: <AuditTabsLayout />,
            children: [
              { index: true, element: <HubPage /> },
              { path: 'setup/*', element: <SetupPage /> },
              { path: 'general/*', element: <GeneralPage /> },
              { path: 'pdf/*', element: <PdfPage /> },
            ],
          },
          { path: 'i/:name/e/:entryId/:step?/*', element: <EntryPage /> },
          { path: 'i/:name/e/*', element: <IndividualPage /> },
          { path: 'i/:name/*', element: <IndividualPage /> },
          { path: '*', element: <MissingPage /> },
        ],
      },
      { path: '*', element: <MissingPage /> },
    ],
  },
]);

installMotionDirector(router);
installTrail(router);
if (useSession.getState().profile) enableTrail();
useSession.subscribe((s, p) => {
  if (p.profile && !s.profile) resetTrail();
  else if (s.profile && !p.profile) enableTrail();
});

function preloadWhenIdle() {
  const run = () => preloadRoutes();
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}

if (useSession.getState().profile) preloadWhenIdle();
else {
  const stop = useSession.subscribe((s) => {
    if (!s.profile) return;
    stop();
    preloadWhenIdle();
  });
}
