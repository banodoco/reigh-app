import { getBridgeTaskClient, mapBridgeTaskStatus } from '@/integrations/astrid/bridgeTaskReads';
import { BridgeTransportFailure } from '@/integrations/astrid/transport';
import { normalizeAndPresentAndRethrow } from '@/shared/lib/errorHandling/runtimeError';
import { NetworkError } from '@/shared/lib/errorHandling/errors';
import { generateUUID } from './ids';
import { parseTaskCreationResponse } from './parseTaskCreationResponse';
import type { BaseTaskParams, TaskCreationResult } from './types';

const MAX_ATTEMPTS = 2;
interface CreateTaskOptions {
  signal?: AbortSignal;
  /** Reserved for producer-side options until their HC-04 migration lands. */
  [key: string]: unknown;
}

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


/**
 * Creates a task through the canonical HC-04 Runtime admission route
 * (`POST /projects/:slug/tasks`, Idempotency-Key header).
 * Retries once on transport failure since admission is receipted: replaying
 * the same key either dedups or 409s, never double-admits.
 */
export async function createTask(
  taskParams: BaseTaskParams,
  options?: CreateTaskOptions,
): Promise<TaskCreationResult> {
  void options;
  const startTime = Date.now();
  const requestId = `${startTime}-${Math.random().toString(36).slice(2, 8)}`;
  const requestContext = {
    requestId,
    taskType: taskParams.spec.family,
    projectId: taskParams.project,
  };

  // Idempotency key stays the same across retries so the bridge
  // deduplicates if the first attempt actually landed.
  const idempotency_key = generateUUID();

  const client = getBridgeTaskClient(taskParams.project);

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await client.tasks.admit(taskParams, idempotency_key);

      return parseTaskCreationResponse(
        {
          task_id: response.task.id,
          status: mapBridgeTaskStatus(response.task.status),
        },
        requestContext,
      );
    } catch (err: unknown) {
      lastError = err;
      const durationMs = Date.now() - startTime;
      const isTimeout = err instanceof BridgeTransportFailure;

      if (isTimeout && attempt < MAX_ATTEMPTS) {
        console.error('[createTask] attempt %d/%d failed after %dms, retrying', attempt, MAX_ATTEMPTS, durationMs, {
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
