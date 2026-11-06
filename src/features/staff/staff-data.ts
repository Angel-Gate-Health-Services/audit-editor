import * as api from '../../services/api/api.ts';
import { currentPayPeriod, payPeriodIndexFor } from '../../domain/audits/model.ts';
import { groupByHome, groupFindings, rateFor } from '../../domain/employees/stats.ts';
import { useData, useSession, useStaff } from '../../app/store/stores.ts';
import { generation } from '../../app/runtime/people.ts';
import { clearInterval_, timers } from '../../app/runtime/services.ts';
import { parseRoute } from '../../app/navigation/route.ts';
import type { Finding } from '../../types/audit.ts';

export const STAFF_RANGES = [['all', 'All time'], ['p6', 'Last 6 pay periods'], ['p3', 'Last 3 pay periods'], ['current', 'This pay period'], ['last', 'Last pay period']] as const;
export const STAFF_SORTS = [['flagged', 'Most flagged'], ['rate', 'Highest flag rate'], ['audited', 'Most shifts audited'], ['recent', 'Recently audited'], ['name', 'Name (A–Z)']] as const;
export const HOME_SORTS = [['flagged', 'Most flagged'], ['rate', 'Highest flag rate'], ['audited', 'Most shifts audited'], ['coverage', 'Least audited lately'], ['name', 'Name (A–Z)']] as const;

const STAFF_ROUTES = ['employees', 'sites', 'pay-periods', undefined];

export async function loadStaff(force = false) {
  const st = useStaff.getState();
  if (st.loading || (!force && st.findings && Date.now() - st.loadedAt < 15000)) return;
  useStaff.setState({ loading: true });
  const gen = generation();
  try {
    const [findings, reviews, completions] = await Promise.all([api.listFindings(), api.listFindingReviews().catch(() => []), api.listAllCompletions().catch(() => [])]);
    if (gen !== generation()) return;
    useStaff.setState({ findings, completions, reviews: new Map(reviews.map((r) => [r.finding_id, r])), error: '' });
  } catch (err) {
    if (gen !== generation()) return;
    const message = (err as Error).message;
    useStaff.setState((s) => ({ findings: s.findings || [], error: /could not find the table|does not exist/i.test(message) ? 'missing-table' : message }));
  } finally {
    if (gen === generation()) useStaff.setState({ loading: false, loadedAt: Date.now() });
  }
}

export function watchStaff() {
  void loadStaff();
  if (timers.staff) return;
  timers.staff = setInterval(() => {
    if (!STAFF_ROUTES.includes(parseRoute()[0]) || !useSession.getState().profile) {
      clearInterval_('staff');
      return;
    }
    if (!document.hidden) void loadStaff(true);
  }, 15000);
}

export function staffInRange(f: Pick<Finding, 'pay_period_start'>, range = useStaff.getState().range) {
  if (range === 'all') return true;
  if (!f.pay_period_start) return false;
  const index = payPeriodIndexFor(f.pay_period_start);
  const current = currentPayPeriod().index;
  if (range === 'p6') return index > current - 6 && index <= current;
  if (range === 'p3') return index > current - 3 && index <= current;
  if (range === 'last') return index === current - 1;
  return index === current;
}

export function staffData() {
  const st = useStaff.getState();
  const findings = (st.findings || []).filter((f) => staffInRange(f, st.range));
  const grouped = groupFindings(findings, useData.getState().employees || []);
  return { findings, grouped, orgRate: findings.some((f) => f.complete) ? rateFor(findings, st.reviews) : null };
}

export function homeData() {
  const { findings, grouped, orgRate } = staffData();
  const sites = useData.getState().homes || [];
  const byHome = new Map<string, { key: string; id: string | null; name: string; rows: Finding[]; site?: (typeof sites)[number] | null }>(groupByHome(findings));
  for (const h of sites) if (!byHome.has(h.id)) byHome.set(h.id, { key: h.id, id: h.id, name: h.name, rows: [] });
  for (const entry of byHome.values()) {
    const site = entry.id ? sites.find((h) => h.id === entry.id) : undefined;
    if (site) entry.name = site.name;
    entry.site = site || null;
  }
  return { findings, grouped, orgRate, byHome };
}
