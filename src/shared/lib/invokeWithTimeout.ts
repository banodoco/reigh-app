import { isAbortError } from '@/shared/lib/errorHandling/errorUtils';
import { readAccessTokenFromStorage } from '@/shared/lib/supabaseSession';
import { getSupabaseUrl, getSupabasePublishableKey } from '@/integrations/supabase/config/env';

type InvokeOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
};

/**
 * Calls a Supabase edge function with a client-side timeout and abort propagation.
 * Reads the access token directly from localStorage to avoid navigator.locks contention.
 * Ensures long-running invocations do not stall the UI indefinitely.
 */
export async function invokeWithTimeout<T = unknown>(functionName: string, options: InvokeOptions = {}): Promise<T> {
  const { body, headers, timeoutMs = 20000, signal } = options;

  const controller = new AbortController();
  let didTimeout = false;
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
    didTimeout = true;
    try { controller.abort(); } catch { /* intentionally ignored */ }
  }, timeoutMs);

  try {
    const accessToken = readAccessTokenFromStorage();
    const supabaseUrl = getSupabaseUrl();
    const anonKey = getSupabasePublishableKey();
    const url = `${supabaseUrl}/functions/v1/${functionName}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken ?? anonKey}`,
        apikey: anonKey,
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
      if (didTimeout) {
        throw new Error(`Function ${functionName} timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
    throw err;
  } finally {
    clearTimeout(tid);
    signals.forEach(s => s.removeEventListener('abort', onAbort));
  }
}
