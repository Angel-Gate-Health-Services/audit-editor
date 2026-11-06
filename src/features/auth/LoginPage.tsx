import { useEffect, useRef, type FormEvent } from 'react';
import * as api from '../../services/api/api.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { Logo } from '../../components/icons/Logo.tsx';
import { Field } from '../../components/ui/Field.tsx';
import { useTitle } from '../../components/ui/basics.tsx';
import { useUi } from '../../app/store/stores.ts';
import { startSession } from '../../app/runtime/session-runtime.ts';

const setLogin = (patch: Partial<ReturnType<typeof useUi.getState>['login']>) =>
  useUi.setState((s) => ({ login: { ...s.login, ...patch } }));

export async function login(focusPassword: () => void) {
  const l = useUi.getState().login;
  if (!l.username.trim() || !l.password) {
    setLogin({ error: 'Enter your username and password.' });
    return;
  }
  setLogin({ busy: true, error: '' });
  try {
    const profile = await api.signIn(l.username, l.password);
    if (profile) await startSession(profile);
  } catch (err) {
    setLogin({ busy: false, password: '', error: (err as Error).message });
    requestAnimationFrame(focusPassword);
  }
}

export function LoginPage() {
  useTitle('Sign in');
  const l = useUi((s) => s.login);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('[data-autofocus]')?.focus({ preventScroll: true });
  }, []);
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    void login(() => formRef.current?.querySelector<HTMLInputElement>('#f-login-password')?.focus());
  };
  return (
    <div className="LoginWrap">
      <span className="LoginCard-logo"><Logo id="login" /></span>
      <div className="Box LoginCard">
        <div className="LoginCard-head">
          <h1 className="LoginCard-title">Sign in</h1>
          <p className="LoginCard-subtitle">Auditing Department</p>
        </div>
        <form className="Box-body LoginCard-form" noValidate onSubmit={submit} ref={formRef}>
          <Field bind="login:username" label="Username" value={l.username} onCommit={(username) => setLogin({ username })} autoFocus disabled={l.busy}
            input={{ autoComplete: 'username', autoCapitalize: 'none', spellCheck: false }} />
          <Field bind="login:password" label="Password" type="password" value={l.password} onCommit={(password) => setLogin({ password })} disabled={l.busy}
            input={{ autoComplete: 'current-password' }} />
          {l.error && <div className="flash flash-error" role="alert"><Icon name="alert" /><span>{l.error}</span></div>}
          <button className="btn btn-primary btn-block" type="submit" disabled={l.busy}>{l.busy ? <><Icon name="sync" />Signing in…</> : 'Sign in'}</button>
        </form>
        <div className="Box-footer LoginCard-foot"><Icon name="shield-lock" /><span>Accounts are created by your administrator.</span></div>
      </div>
    </div>
  );
}
