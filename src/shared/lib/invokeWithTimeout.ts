import { isAbortError } from '@/shared/lib/errorUtils';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/integrations/supabase/config/env';

type InvokeOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
};

// Read access token directly from localStorage — synchronous, no navigator.locks.
// supabase.functions.invoke normally calls getSession() which acquires a shared
// navigator.lock — blocked when a token refresh holds the exclusive lock for 600ms-16s.
// Same pattern as createSupabaseClient.ts for data requests.
function readAccessTokenFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
    const raw = localStorage.getItem(`sb-${projectRef}-auth-token`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { access_token?: string };
    return parsed?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Calls a Supabase edge function with a client-side timeout and abort propagation.
 * Reads the access token directly from localStorage to avoid navigator.locks contention.
 * Ensures long-running invocations do not stall the UI indefinitely.
 */
export async function invokeWithTimeout<T = unknown>(functionName: string, options: InvokeOptions = {}): Promise<T> {
  const { body, headers, timeoutMs = 20000, signal } = options;

  const controller = new AbortController();
  const signals: AbortSignal[] = [];
  if (signal) signals.push(signal);
  signals.push(controller.signal);

  // Compose signals: abort if any provided signal aborts
  const composed = new AbortController();
  const onAbort = () => composed.abort();
  signals.forEach(s => {
    if (s.aborted) composed.abort();
    else s.addEventListener('abort', onAbort, { once: true });
  });

  const tid = setTimeout(() => {
    try { controller.abort(); } catch { /* intentionally ignored */ }
  }, timeoutMs);

  try {
    const accessToken = readAccessTokenFromStorage();
    const url = `${SUPABASE_URL}/functions/v1/${functionName}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken ?? SUPABASE_PUBLISHABLE_KEY}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        ...(headers ?? {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: composed.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || `Function ${functionName} failed with status ${response.status}`);
    }

    const data = await response.json() as T;
    return data;
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw new Error(`Function ${functionName} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(tid);
  }
}
