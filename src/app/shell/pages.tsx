import { Icon } from '../../components/icons/Icon.tsx';
import { useTitle } from '../../components/ui/basics.tsx';

export function MissingPage() {
  useTitle('Not found');
  return (
    <div className="Box"><div className="blankslate">
      <span className="blankslate-icon"><Icon name="alert" size={24} /></span>
      <h2 className="blankslate-heading">That page wasn’t found</h2>
      <a className="btn blankslate-action" href="#/">Back to the homepage</a>
    </div></div>
  );
}

export function NotConfiguredPage() {
  useTitle('Setup needed');
  return (
    <div className="LoginWrap"><div className="Box LoginCard"><div className="blankslate">
      <span className="blankslate-icon"><Icon name="alert" size={24} /></span>
      <h1 className="blankslate-heading">This site isn’t connected yet</h1>
      <p>Add your Supabase project settings to <code>src/services/api/config.ts</code>. See SETUP.md.</p>
    </div></div></div>
  );
}

export function LoadingBlank({ text }: { text: string }) {
  return (
    <div className="Box"><div className="blankslate">
      <span className="blankslate-icon"><Icon name="sync" size={24} /></span>
      <p>{text}</p>
    </div></div>
  );
}
