import { Icon } from '../../components/icons/Icon.tsx';
import { useData, useSession } from '../../app/store/stores.ts';
import { action } from '../../app/runtime/actions.ts';
import { photoPath } from '../../app/runtime/people.ts';
import { removePhoto, uploadPhoto } from './photos.ts';

const upload = action('uploadPhoto', uploadPhoto);
const remove = action('removePhoto', removePhoto);

export function PhotoControls({ kind, id, name }: { kind: string; id: string | null | undefined; name: string }) {
  const admin = useSession((s) => Boolean(s.profile?.is_admin));
  const has = useData((s) => Boolean(id && s.photoIndex?.has(photoPath(kind, id)!)));
  if (!admin || !id) return null;
  return (
    <>
      <label className="btn btn-sm btn-file" title={`${has ? 'Change' : 'Add'} a photo of ${name}`}><Icon name="upload" />{has ? 'Change photo' : 'Add photo'}
        <input type="file" accept="image/*" onChange={(ev) => upload(kind, id, name, ev.currentTarget)} />
      </label>
      {has ? <button className="btn btn-sm" onClick={() => remove(kind, id, name)}>Remove photo</button> : null}
    </>
  );
}
