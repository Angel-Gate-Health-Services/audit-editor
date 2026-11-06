import { Icon } from '../../components/icons/Icon.tsx';
import { useAdmin } from '../../app/store/stores.ts';

export const ADMIN_SECTIONS: [string, string, string, string][] = [
  ['sites', 'Sites', 'home', 'Sites, addresses and the individuals who live in each one.'],
  ['employees', 'Employees', 'person', 'DSP staff offered in the shift Author dropdown.'],
  ['users', 'Users', 'people', 'Accounts that can sign in, and who is an admin.'],
  ['sessions', 'Signed in', 'device-desktop', 'Who is online right now, where from, and what they’re auditing.'],
  ['settings', 'Settings', 'gear', 'Appearance, your account and how sign-in is protected.'],
];

export function AdminFlash() {
  const error = useAdmin((s) => s.error);
  const notice = useAdmin((s) => s.notice);
  if (error) return <div className="flash flash-error" role="alert"><Icon name="alert" /><span>{error}</span></div>;
  if (notice) return <div className="flash flash-success" role="status"><Icon name="check-circle" /><span>{notice}</span></div>;
  return null;
}
