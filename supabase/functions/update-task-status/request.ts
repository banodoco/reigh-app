import type { SystemLogger } from '../_shared/systemLogger.ts';

import { isTaskStatus } from './transitions.ts';
import { VALID_TASK_STATUSES, type UpdateTaskStatusRequest } from './types.ts';

type ParseResult =
  | { ok: true; data: UpdateTaskStatusRequest }
  | { ok: false; response: Response };

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function parseAndValidateRequest(
  req: Request,
  logger: SystemLogger,
): Promise<ParseResult> {
  let requestBody: Record<string, unknown> = {};

  try {
    const bodyText = await req.text();
    if (bodyText) {
      const parsed = JSON.parse(bodyText);
      if (parsed && typeof parsed === 'object') {
        requestBody = parsed as Record<string, unknown>;
      }
    }
  } catch {
    logger.error('Invalid JSON body');
    await logger.flush();
    return { ok: false, response: new Response('Invalid JSON body', { status: 400 }) };
  }

  const taskId = requestBody.task_id;
  const status = requestBody.status;

  if (!taskId || !status || typeof taskId !== 'string') {
    logger.error('Missing required fields', { has_task_id: !!taskId, has_status: !!status });
    await logger.flush();
    return {
      ok: false,
      response: new Response('Missing required fields: task_id and status', { status: 400 }),
    };
  }

  if (!isTaskStatus(status)) {
    logger.error('Invalid status value', { status, valid_statuses: VALID_TASK_STATUSES });
    await logger.flush();
    return {
      ok: false,
      response: new Response(
        `Invalid status. Must be one of: ${VALID_TASK_STATUSES.join(', ')}`,
        { status: 400 },
      ),
    };
  }

  const attempts = requestBody.attempts;
  if (attempts !== undefined && typeof attempts !== 'number') {
    logger.error('Invalid attempts value', { attempts });
    await logger.flush();
    return {
      ok: false,
      response: jsonResponse({ success: false, message: 'attempts must be a number' }, 400),
    };
  }

  const outputLocation = requestBody.output_location;
  const errorDetails = requestBody.error_details;
  const clearWorker = requestBody.clear_worker;
  const resetGenerationStartedAt = requestBody.reset_generation_started_at;

  if (outputLocation !== undefined && typeof outputLocation !== 'string') {
    logger.error('Invalid output_location value', { output_location: outputLocation });
    await logger.flush();
    return {
      ok: false,
      response: jsonResponse({ success: false, message: 'output_location must be a string' }, 400),
    };
  }

  if (errorDetails !== undefined && typeof errorDetails !== 'string') {
    logger.error('Invalid error_details value', { error_details: errorDetails });
    await logger.flush();
    return {
      ok: false,
      response: jsonResponse({ success: false, message: 'error_details must be a string' }, 400),
    };
  }

  if (clearWorker !== undefined && typeof clearWorker !== 'boolean') {
    logger.error('Invalid clear_worker value', { clear_worker: clearWorker });
    await logger.flush();
    return {
      ok: false,
      response: jsonResponse({ success: false, message: 'clear_worker must be a boolean' }, 400),
    };
  }

  if (resetGenerationStartedAt !== undefined && typeof resetGenerationStartedAt !== 'boolean') {
    logger.error('Invalid reset_generation_started_at value', { reset_generation_started_at: resetGenerationStartedAt });
    await logger.flush();
    return {
      ok: false,
      response: jsonResponse({ success: false, message: 'reset_generation_started_at must be a boolean' }, 400),
    };
  }

  return {
    ok: true,
    data: {
      task_id: taskId,
      status,
      output_location: outputLocation as string | undefined,
      attempts: attempts as number | undefined,
      error_details: errorDetails as string | undefined,
      clear_worker: clearWorker as boolean | undefined,
      reset_generation_started_at: resetGenerationStartedAt as boolean | undefined,
    },
  };
}
