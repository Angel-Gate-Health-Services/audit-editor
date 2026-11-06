import { Icon } from '../../components/icons/Icon.tsx';
import { APP_VERSION, GITHUB_URL } from '../../domain/audits/config.ts';
import { useSession, useStatus } from '../store/stores.ts';
import { noteSessionActivity } from '../runtime/session-runtime.ts';
import { useLinger } from '../motion/presence.ts';
import { prefersReducedMotion } from '../motion/tokens.ts';

const TOAST_EXIT_MS = 160;

export function Toasts() {
  const toast = useStatus((s) => s.toast);
  const warning = useStatus((s) => s.warningSeconds);
  const instant = useStatus((s) => s.instant);
  const signedIn = useSession((s) => Boolean(s.profile));
  const immediate = instant || !signedIn || prefersReducedMotion();
  const audit = useLinger(toast, TOAST_EXIT_MS, immediate);
  const session = useLinger(warning, TOAST_EXIT_MS, immediate);
  return (
    <>
      <div id="audit-toast" className={`AuditToast${audit.leaving ? ' is-leaving' : ''}`} role="status" aria-live="polite" aria-atomic="true" hidden={!audit.shown}>
        {audit.shown && <><Icon name="alert-circle" size={20} /><span>{audit.shown.message}</span></>}
      </div>
      <div id="session-toast" className={`AuditToast SessionToast${session.leaving ? ' is-leaving' : ''}`} role="alert" aria-live="assertive" aria-atomic="true" hidden={session.shown === null}>
        {session.shown !== null && (
          <>
            <Icon name="alert-circle" size={20} />
            <span data-session-countdown="">{`Warning: session expires in ${session.shown}s due to inactivity.`}</span>
            <button className="btn btn-sm" type="button" data-stay-signed-in="" disabled={session.leaving} onClick={noteSessionActivity}>Stay signed in</button>
          </>
        )}
      </div>
    </>
  );
}

export function Footer() {
  return (
    <footer className="AppFooter">
      <span>Angel Gate Health Services · Auditing Department</span>
      <a
        id="app-version"
        href={GITHUB_URL || '#'}
        aria-disabled={String(!GITHUB_URL) as 'true' | 'false'}
        target="_blank"
        title={GITHUB_URL ? 'View project on GitHub' : 'GitHub repository coming soon'}
        onClick={(ev) => { if (!GITHUB_URL) ev.preventDefault(); }}
      >
        {`v${APP_VERSION}`}
      </a>
    </footer>
  );
}
