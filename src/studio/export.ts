import { canvasBlob } from './doc/library';

export type ImageFormat = 'png' | 'jpeg';

/** A safe file name from a painting's name. */
export function fileName(name: string, ext: string): string {
  const base = name.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'painting';
  return `${base}.${ext}`;
}

export async function encode(canvas: HTMLCanvasElement, format: ImageFormat, quality = 0.92): Promise<Blob> {
  return canvasBlob(canvas, format === 'png' ? 'image/png' : 'image/jpeg', format === 'jpeg' ? quality : undefined);
}

/**
 * Hands a file to the phone's share sheet (Photos, Drive, messages…). Where
 * sharing files isn't supported, it downloads instead.
 */
export async function shareOrSave(blob: Blob, name: string): Promise<'shared' | 'saved' | 'cancelled'> {
  const file = new File([blob], name, { type: blob.type });
  const data: ShareData = { files: [file], title: name };
  if (navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  download(blob, name);
  return 'saved';
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
