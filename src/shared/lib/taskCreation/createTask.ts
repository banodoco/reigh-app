import { getSupabasePublishableKey, getSupabaseUrl } from '@/integrations/supabase/config/env';
import { isAbortError } from '@/shared/lib/errorHandling/errorUtils';
import { normalizeAndPresentAndRethrow } from '@/shared/lib/errorHandling/runtimeError';
import { AuthError, NetworkError, ServerError } from '@/shared/lib/errorHandling/errors';
import { readAccessTokenFromStorage } from '@/shared/lib/supabaseSession';
import { generateUUID } from './ids';
import { parseTaskCreationResponse } from './parseTaskCreationResponse';
import type { BaseTaskParams, TaskCreationResult } from './types';

const ATTEMPT_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 2;

function getNetworkDiagnostics(): Record<string, unknown> {
  const diag: Record<string, unknown> = {
    online: navigator.onLine,
  };
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection;
  if (conn) {
    diag.effectiveType = conn.effectiveType;
    diag.downlink = conn.downlink;
    diag.rtt = conn.rtt;
  }
  return diag;
}

async function attemptCreateTask(
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Creates a task using the unified create-task edge function.
 * Retries once on timeout since the server typically responds in <2s.
 */
export async function createTask(taskParams: BaseTaskParams): Promise<TaskCreationResult> {
  const accessToken = readAccessTokenFromStorage();

  if (!accessToken) {
    throw new AuthError('Please log in to create tasks', { needsLogin: true });
  }

  const startTime = Date.now();
  const requestId = `${startTime}-${Math.random().toString(36).slice(2, 8)}`;
  const taskIdentifier = taskParams.family;
  const requestContext = {
    requestId,
    taskType: taskIdentifier,
    projectId: taskParams.project_id,
  };

  // Idempotency key stays the same across retries so the server
  // deduplicates if the first attempt actually landed.
  const idempotency_key = generateUUID();
  const url = `${getSupabaseUrl()}/functions/v1/create-task`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    apikey: getSupabasePublishableKey(),
  };
  const body = JSON.stringify({
    family: taskParams.family,
    project_id: taskParams.project_id,
    input: taskParams.input,
    idempotency_key,
  });

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await attemptCreateTask(url, headers, body, ATTEMPT_TIMEOUT_MS);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new ServerError(errorText || 'Failed to create task', {
          context: requestContext,
        });
      }

      const data = await response.json() as unknown;
      return parseTaskCreationResponse(data, requestContext);
    } catch (err: unknown) {
      lastError = err;
      const durationMs = Date.now() - startTime;
      const isTimeout = isAbortError(err);

      if (isTimeout && attempt < MAX_ATTEMPTS) {
        console.error('[createTask] attempt %d/%d timed out after %dms, retrying', attempt, MAX_ATTEMPTS, durationMs, {
          ...requestContext,
          network: getNetworkDiagnostics(),
        });
        continue;
      }

      const context = {
        ...requestContext,
        attempt,
        durationMs,
        network: getNetworkDiagnostics(),
        errorType: err instanceof Error ? err.name : typeof err,
        errorMessage: err instanceof Error ? err.message : String(err),
      };

      console.error('[createTask] FAILED after %d attempt(s), %dms', attempt, durationMs, context);

      if (isTimeout) {
        throw new NetworkError('Task creation timed out. Please try again.', {
          isTimeout: true,
          context,
          cause: err instanceof Error ? err : undefined,
        });
      }

      normalizeAndPresentAndRethrow(err, {
        context: 'TaskCreation',
        showToast: false,
        logData: context,
      });
    }
  }

  // Unreachable, but TypeScript needs it
  throw lastError;
}
