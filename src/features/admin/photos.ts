import * as api from '../../services/api/api.ts';
import { askConfirm, showAlert } from '../../components/dialog/dialog.ts';
import { useData } from '../../app/store/stores.ts';
import { photoKey, photoPath } from '../../app/runtime/people.ts';
import { showToast } from '../../app/runtime/feedback.ts';

export const PHOTO_SIZE = 256;

export async function squarePhoto(file: File, size = PHOTO_SIZE): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file (JPEG, PNG or similar).');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This browser can’t read that image. Try a JPEG or PNG (iPhone HEIC photos may need converting).');
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t process that image.'))), 'image/jpeg', 0.85));
}

export async function uploadPhoto(kind: string, id: string, name: string, input: HTMLInputElement) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const blob = await squarePhoto(file);
    const path = photoPath(kind, id)!;
    await api.uploadPhoto(path, blob);
    const index = new Map(useData.getState().photoIndex || []);
    index.set(path, new Date().toISOString());
    useData.setState({ photoIndex: index });
    const urls = new Map(useData.getState().photoUrls);
    urls.set(photoKey(path), URL.createObjectURL(blob));
    useData.setState({ photoUrls: urls });
    showToast(`Photo saved for ${name}.`);
  } catch (err) {
    void showAlert((err as Error).message);
  }
}

export async function removePhoto(kind: string, id: string, name: string) {
  if (!(await askConfirm('Their initials will show instead.', { title: `Remove ${name}’s photo?`, confirmLabel: 'Remove photo', danger: true }))) return;
  try {
    const path = photoPath(kind, id)!;
    await api.deletePhoto(path);
    const index = new Map(useData.getState().photoIndex || []);
    index.delete(path);
    useData.setState({ photoIndex: index });
    showToast(`Photo removed for ${name}.`);
  } catch (err) {
    void showAlert((err as Error).message);
  }
}
