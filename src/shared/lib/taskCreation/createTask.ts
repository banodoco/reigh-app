import { getSupabasePublishableKey, getSupabaseUrl } from '@/integrations/supabase/config/env';
import { isAbortError } from '@/shared/lib/errorHandling/errorUtils';
import { normalizeAndPresentAndRethrow } from '@/shared/lib/errorHandling/runtimeError';
import { AuthError, NetworkError, ServerError } from '@/shared/lib/errorHandling/errors';
import { readAccessTokenFromStorage } from '@/shared/lib/supabaseSession';
import { generateUUID } from './ids';
import { parseTaskCreationResponse } from './parseTaskCreationResponse';
import type { BaseTaskParams, TaskCreationResult } from './types';

/**
 * Creates a task using the unified create-task edge function.
 */
export async function createTask(taskParams: BaseTaskParams): Promise<TaskCreationResult> {
  // Read access token from localStorage — avoids navigator.locks contention.
  // getSession() acquires a shared navigator.lock blocked during token refresh.
  const accessToken = readAccessTokenFromStorage();

  if (!accessToken) {
    throw new AuthError('Please log in to create tasks', { needsLogin: true });
  }

  const startTime = Date.now();
  const requestId = `${startTime}-${Math.random().toString(36).slice(2, 8)}`;
  const requestContext = {
    requestId,
    taskType: taskParams.task_type,
    projectId: taskParams.project_id,
  };
  const timeoutMs = 20000; // 20s safety timeout to avoid indefinite UI stall
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    // Generate an idempotency key to prevent duplicate task creation from
    // network retries or double-clicks. The server will return the existing
    // task if this key was already used.
    const idempotency_key = generateUUID();

    const response = await fetch(`${getSupabaseUrl()}/functions/v1/create-task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: getSupabasePublishableKey(),
      },
      body: JSON.stringify({
        params: taskParams.params,
        task_type: taskParams.task_type,
        project_id: taskParams.project_id,
        dependant_on: null,
        idempotency_key,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new ServerError(errorText || 'Failed to create task', {
        context: requestContext,
      });
    }

    const data = await response.json() as unknown;
    return parseTaskCreationResponse(data, requestContext);
  } catch (err: unknown) {
    const context = {
      requestId,
      taskType: taskParams.task_type,
      projectId: taskParams.project_id,
      durationMs: Date.now() - startTime,
    };

    if (import.meta.env.DEV) {
      console.error('[createTask] invoke FAILED', context, err);
    }

    // Normalize abort errors for better UX
    if (isAbortError(err)) {
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
  } finally {
    clearTimeout(timeout);
  }
}
