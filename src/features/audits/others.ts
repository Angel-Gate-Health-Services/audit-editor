import * as api from '../../services/api/api.ts';
import { sortAudits } from '../../domain/audits/model.ts';
import { useSession, useUi } from '../../app/store/stores.ts';
import { generation, isAdmin } from '../../app/runtime/people.ts';
import { clearInterval_, timers } from '../../app/runtime/services.ts';
import { parseRoute } from '../../app/navigation/route.ts';
import { viewedPayPeriod } from '../progress/progress.ts';
import { auditSort } from './sort.ts';

const setOthers = (patch: Partial<ReturnType<typeof useUi.getState>['othersAudits']>) => useUi.setState((s) => ({ othersAudits: { ...s.othersAudits, ...patch } }));

export const onHomeRoute = () => isAdmin() && parseRoute()[0] === 'audits';

export async function loadOthersAudits() {
  const o = useUi.getState().othersAudits;
  if (o.loading || !isAdmin()) return;
  setOthers({ loading: true });
  const gen = generation();
  try {
    const list = await api.listOthersLiveAudits(useSession.getState().profile!.id);
    if (gen !== generation()) return;
    setOthers({ list, error: '' });
  } catch (err) {
    if (gen !== generation()) return;
    const message = (err as Error).message;
    setOthers({ list: useUi.getState().othersAudits.list || [], error: /could not find the table|does not exist/i.test(message) ? 'missing-table' : message });
  } finally {
    if (gen === generation()) setOthers({ loading: false, loadedAt: Date.now() });
  }
}

export function watchOthers() {
  if (!isAdmin()) return;
  const o = useUi.getState().othersAudits;
  if (!o.loading && Date.now() - o.loadedAt > 4000) void loadOthersAudits();
  if (!timers.others) {
    timers.others = setInterval(() => {
      if (!onHomeRoute()) {
        clearInterval_('others');
        return;
      }
      void loadOthersAudits();
    }, 5000);
  }
}

export function othersAudits() {
  if (!isAdmin()) return [];
  const period = viewedPayPeriod();
  return sortAudits((useUi.getState().othersAudits.list || []).filter((x) => x.audit?.payStart === period.start), auditSort(), (x) => x.audit);
}
