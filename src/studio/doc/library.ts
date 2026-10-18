import type { LayerMeta, Paper } from './document';

/**
 * The gallery, kept in IndexedDB so paintings survive reloads and crashes:
 * each painting's details, each layer as a PNG, and a few older versions.
 */
export interface PaintingMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  paper: Paper;
  layers: LayerMeta[];
  active: number;
  created: number;
  updated: number;
  thumb?: Blob;
}

export interface Version {
  key: string;
  painting: string;
  time: number;
  meta: PaintingMeta;
  layers: Record<string, Blob>;
}

const DB = 'drift-studio';
const MAX_VERSIONS = 5;

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('paintings', { keyPath: 'id' });
      db.createObjectStore('pixels');
      const versions = db.createObjectStore('versions', { keyPath: 'key' });
      versions.createIndex('painting', 'painting');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listPaintings(): Promise<PaintingMeta[]> {
  const db = await open();
  const all = await result(db.transaction('paintings').objectStore('paintings').getAll() as IDBRequest<PaintingMeta[]>);
  return all.sort((a, b) => b.updated - a.updated);
}

export async function getPainting(id: string): Promise<{ meta: PaintingMeta; layers: Map<string, Blob> } | null> {
  const db = await open();
  const tx = db.transaction(['paintings', 'pixels']);
  const meta = (await result(tx.objectStore('paintings').get(id))) as PaintingMeta | undefined;
  if (!meta) return null;
  const layers = new Map<string, Blob>();
  for (const layer of meta.layers) {
    const blob = (await result(tx.objectStore('pixels').get(`${id}/${layer.id}`))) as Blob | undefined;
    if (blob) layers.set(layer.id, blob);
  }
  return { meta, layers };
}

/** Saves the painting's details and the layers that changed; forgets layers that were deleted. */
export async function savePainting(meta: PaintingMeta, changed: Map<string, Blob>, previous: string[] = []): Promise<void> {
  const db = await open();
  const tx = db.transaction(['paintings', 'pixels'], 'readwrite');
  tx.objectStore('paintings').put(meta);
  const pixels = tx.objectStore('pixels');
  for (const [layerId, blob] of changed) pixels.put(blob, `${meta.id}/${layerId}`);
  const keep = new Set(meta.layers.map((l) => l.id));
  for (const old of previous) if (!keep.has(old)) pixels.delete(`${meta.id}/${old}`);
  await done(tx);
}

export async function renamePainting(id: string, name: string): Promise<void> {
  const db = await open();
  const tx = db.transaction('paintings', 'readwrite');
  const store = tx.objectStore('paintings');
  const meta = (await result(store.get(id))) as PaintingMeta | undefined;
  if (meta) store.put({ ...meta, name });
  await done(tx);
}

export async function deletePainting(id: string): Promise<void> {
  const db = await open();
  const versions = await listVersions(id);
  const tx = db.transaction(['paintings', 'pixels', 'versions'], 'readwrite');
  const meta = (await result(tx.objectStore('paintings').get(id))) as PaintingMeta | undefined;
  tx.objectStore('paintings').delete(id);
  for (const layer of meta?.layers ?? []) tx.objectStore('pixels').delete(`${id}/${layer.id}`);
  for (const v of versions) tx.objectStore('versions').delete(v.key);
  await done(tx);
}

export async function duplicatePainting(id: string, newId: string, name: string): Promise<void> {
  const source = await getPainting(id);
  if (!source) return;
  const now = Date.now();
  await savePainting({ ...source.meta, id: newId, name, created: now, updated: now }, source.layers);
}

export async function listVersions(id: string): Promise<Version[]> {
  const db = await open();
  const all = (await result(db.transaction('versions').objectStore('versions').index('painting').getAll(id))) as Version[];
  return all.sort((a, b) => b.time - a.time);
}

/** Keeps a snapshot of the whole painting; only the newest few are kept. */
export async function saveVersion(meta: PaintingMeta, layers: Map<string, Blob>): Promise<void> {
  const db = await open();
  const old = await listVersions(meta.id);
  const time = Date.now();
  const tx = db.transaction('versions', 'readwrite');
  const store = tx.objectStore('versions');
  store.put({ key: `${meta.id}/${time}`, painting: meta.id, time, meta: { ...meta, thumb: undefined }, layers: Object.fromEntries(layers) } satisfies Version);
  for (const v of old.slice(MAX_VERSIONS - 1)) store.delete(v.key);
  await done(tx);
}

/** Puts an older version back as the current painting (the current state is saved as a version first). */
export async function restoreVersion(version: Version, current: { meta: PaintingMeta; layers: Map<string, Blob> } | null): Promise<void> {
  if (current) await saveVersion(current.meta, current.layers);
  const meta = { ...version.meta, updated: Date.now() };
  await savePainting(meta, new Map(Object.entries(version.layers)), current?.meta.layers.map((l) => l.id) ?? []);
}

export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality));
}
