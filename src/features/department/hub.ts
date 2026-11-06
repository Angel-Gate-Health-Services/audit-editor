import * as api from '../../services/api/api.ts';
import { useSession, useUi } from '../../app/store/stores.ts';
import { generation } from '../../app/runtime/people.ts';
import { clearInterval_, timers } from '../../app/runtime/services.ts';
import { parseRoute } from '../../app/navigation/route.ts';

const setHub = (patch: Partial<ReturnType<typeof useUi.getState>['hub']>) => useUi.setState((s) => ({ hub: { ...s.hub, ...patch } }));

export async function loadHubActivity() {
  if (useUi.getState().hub.loading) return;
  setHub({ loading: true });
  const gen = generation();
  try {
    const rows = await api.listAuditActivity();
    if (gen !== generation()) return;
    setHub({ activity: rows.filter((r) => Date.parse(r.expires_at) > Date.now()) });
  } catch {
    if (gen === generation()) setHub({ activity: useUi.getState().hub.activity || [] });
  } finally {
    if (gen === generation()) setHub({ loading: false, loadedAt: Date.now() });
  }
}

export function watchHub() {
  if (Date.now() - useUi.getState().hub.loadedAt > 8000) void loadHubActivity();
  if (timers.hub) return;
  timers.hub = setInterval(() => {
    if (parseRoute()[0] || !useSession.getState().profile) {
      clearInterval_('hub');
      return;
    }
    if (!document.hidden) void loadHubActivity();
  }, 10000);
}
