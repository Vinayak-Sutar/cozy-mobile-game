/**
 * "Get latest version" support for the development cycle. Each build writes a
 * version.json next to index.html; we compare it with the build we're running
 * and, if it's newer, reload from a cache-busting URL so the browser (and
 * GitHub Pages' CDN) can't hand back the old index.html.
 */

export const BUILD = __BUILD__;

export type UpdateStatus = 'newer' | 'latest' | 'unknown';

/** Short label for the build that's running, e.g. "285696e · 17 Oct 10:42". */
export function buildLabel(): string {
  const date = new Date(BUILD.time);
  const when = Number.isNaN(date.getTime())
    ? ''
    : ` · ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
  return `${BUILD.sha}${when}`;
}

let latestId: string | null = null;

/** Asks the server which build is current, bypassing every cache. */
export async function checkForUpdate(): Promise<UpdateStatus> {
  try {
    const response = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return 'unknown';
    const latest = (await response.json()) as { id?: string };
    if (!latest.id) return 'unknown';
    latestId = latest.id;
    return latest.id === BUILD.id ? 'latest' : 'newer';
  } catch {
    return 'unknown';
  }
}

/** Reloads the app from a URL the browser has never seen, so every file is fetched fresh. */
export async function reloadToLatest(): Promise<void> {
  // Clear any service-worker caches (none today, but a future offline/PWA build may add one).
  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(registrations.map((r) => r.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Nothing to clear.
  }
  const url = new URL(location.href);
  url.searchParams.set('v', latestId ?? Date.now().toString(36));
  location.replace(url.toString());
}
