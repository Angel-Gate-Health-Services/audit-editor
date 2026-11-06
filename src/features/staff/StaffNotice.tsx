import { Icon } from '../../components/icons/Icon.tsx';
import { useSession, useStaff } from '../../app/store/stores.ts';
import { action } from '../../app/runtime/actions.ts';
import { loadStaff } from './staff-data.ts';

const refreshStaff = action('refreshStaff', () => loadStaff(true));

export function StaffNotice() {
  const error = useStaff((s) => s.error);
  const admin = useSession((s) => Boolean(s.profile?.is_admin));
  if (error === 'missing-table') {
    return <div className="flash flash-warn"><Icon name="alert" /><span>Employee statistics aren’t set up yet. {admin ? <>Run <code>supabase/employee-stats.sql</code> in the Supabase SQL Editor, then refresh.</> : 'Ask an admin to finish setting them up.'}</span></div>;
  }
  if (error) return <div className="flash flash-error"><Icon name="alert" /><span>Couldn’t load employee statistics: {error}</span><button className="btn btn-sm" onClick={() => refreshStaff()}>Retry</button></div>;
  return null;
}
