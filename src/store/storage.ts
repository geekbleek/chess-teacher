/**
 * The only place that touches persistent storage.
 *
 * Everything lives on the device — there is no account and no server. Kept behind
 * one module so a future native wrapper can swap the backend without touching
 * anything else, and so a browser that refuses storage (private mode, blocked site
 * data) degrades to an in-memory session instead of crashing.
 */
const memory = new Map<string, string>();

function backing(): Storage | null {
  try {
    const probe = '__probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = backing()?.getItem(key) ?? memory.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T): void {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    backing()?.setItem(key, raw);
  } catch {
    // Out of quota or storage blocked; the in-memory copy keeps this session working.
  }
}
