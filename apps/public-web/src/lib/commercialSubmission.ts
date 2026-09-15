// Only a digest is persisted here; the interview remains in its own draft store.
const STORAGE = 'lmwares.commercial-submission-content.v1';
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([key, v]) => key !== 'completedAt' && v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export async function prepareCommercialSubmissionKey(payload: unknown, ownerId: string, fallbackKey: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical({ ownerId, payload })));
  const digest = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  let saved: { key?: string; digest?: string } = {};
  try { saved = JSON.parse(storage.getItem(STORAGE) ?? '{}'); } catch { /* invalid local draft */ }
  const key = saved?.digest === digest && typeof saved?.key === 'string' && /^[0-9a-f-]{36}$/i.test(saved.key)
    ? saved.key : saved?.digest ? crypto.randomUUID() : fallbackKey;
  // If storage is unavailable, fail before sending rather than lose retry identity.
  storage.setItem(STORAGE, JSON.stringify({ key, digest }));
  return key;
}

export function replaceCommercialSubmissionKey(key: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): void {
  let saved;
  try { saved = JSON.parse(storage.getItem(STORAGE) ?? '{}'); } catch { return; }
  if (saved?.digest) storage.setItem(STORAGE, JSON.stringify({ digest: saved.digest, key }));
}
