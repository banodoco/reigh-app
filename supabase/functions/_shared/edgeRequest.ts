import { createClient } from './supabaseClient.ts';
import { SystemLogger } from './systemLogger.ts';
import {
  type OperationFailure,
  operationFailure,
  operationSuccess,
  type OperationResult,
} from './edgeOperation.ts';

declare const Deno: { env: { get: (key: string) => string | undefined } };

export interface EdgeRuntime {
  supabaseAdmin: ReturnType<typeof createClient>;
  logger: SystemLogger;
}

export interface InitEdgeRuntimeOptions {
  clientOptions?: NonNullable<Parameters<typeof createClient>[2]>;
}

export function initEdgeRuntime(
  functionName: string,
  missingEnvLogPrefix: string,
  options?: InitEdgeRuntimeOptions,
): OperationResult<EdgeRuntime> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');

  if (!serviceKey || !supabaseUrl) {
    return operationFailure(new Error('Server configuration error'), {
      policy: 'fail_closed',
      errorCode: 'server_configuration_error',
      message: 'Server configuration error',
      recoverable: false,
      cause: { missingEnvLogPrefix },
    });
  }

  const supabaseAdmin = options?.clientOptions
    ? createClient(supabaseUrl, serviceKey, options.clientOptions)
    : createClient(supabaseUrl, serviceKey);
  const logger = new SystemLogger(supabaseAdmin, functionName);

  return operationSuccess({ supabaseAdmin, logger }, { policy: 'best_effort' });
}

export async function ensureRequestMethod(
  req: Request,
  method: string,
  logger?: SystemLogger,
): Promise<OperationResult<void>> {
  if (req.method === method) {
    return operationSuccess(undefined, { policy: 'best_effort' });
  }

  logger?.warn('Method not allowed', { method: req.method });
  if (logger) {
    await logger.flush();
  }
  return operationFailure(new Error('Method not allowed'), {
    policy: 'fail_closed',
    errorCode: 'method_not_allowed',
    message: 'Method not allowed',
    recoverable: false,
    cause: { method: req.method, allow: method },
  });
}

export function requestMethodFailureResponse(
  failure: OperationFailure,
  method: string,
): Response {
  return parseJsonFailureResponse(failure, 405, { Allow: method });
}

export function operationFailureResponse(
  failure: OperationFailure,
  status = 500,
  extraHeaders?: Record<string, string>,
): Response {
  return edgeErrorResponse(
    {
      errorCode: failure.errorCode,
      message: failure.message,
      recoverable: failure.recoverable,
    },
    status,
    extraHeaders,
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function coerceLooseObject(value: unknown): Record<string, unknown> {
  return isJsonObject(value) ? value : {};
}

export function readEdgeErrorCode(payload: Record<string, unknown> | null): string | null {
  if (!payload) {
    return null;
  }
  if (typeof payload.errorCode === 'string' && payload.errorCode.trim().length > 0) {
    return payload.errorCode;
  }
  if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
    return payload.error;
  }
  return null;
}

interface EdgeErrorEnvelopeInput {
  errorCode: string;
  message: string;
  recoverable: boolean;
  retryAfter?: number;
}

export function edgeErrorResponse(
  input: EdgeErrorEnvelopeInput,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error: input.errorCode,
      errorCode: input.errorCode,
      message: input.message,
      recoverable: input.recoverable,
      ...(input.retryAfter !== undefined ? { retryAfter: input.retryAfter } : {}),
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...(extraHeaders ?? {}),
      },
    },
  );
}

interface ParseJsonBodyOptions {
  mode?: 'strict' | 'loose';
  message?: string;
  nonObjectMessage?: string;
}

export async function parseJsonBody(
  req: Request,
  logger?: SystemLogger,
  options?: ParseJsonBodyOptions,
): Promise<OperationResult<Record<string, unknown>>> {
  const mode = options?.mode ?? 'strict';
  const message = options?.message ?? 'Invalid JSON body';
  const nonObjectMessage = options?.nonObjectMessage ?? 'JSON body must be an object';

  try {
    const bodyText = await req.text();
    if (!bodyText) {
      return operationSuccess({}, { policy: 'best_effort' });
    }

    const parsed = JSON.parse(bodyText);
    if (isJsonObject(parsed)) {
      return operationSuccess(parsed, { policy: 'best_effort' });
    }

    if (mode === 'loose') {
      logger?.debug('Non-object JSON body provided, using empty object defaults');
      return operationSuccess(coerceLooseObject(parsed), { policy: 'fail_open' });
    }

    logger?.error(nonObjectMessage);
    if (logger) {
      await logger.flush();
    }
    return operationFailure(new Error(nonObjectMessage), {
      policy: 'fail_closed',
      errorCode: 'invalid_json_body_shape',
      message: nonObjectMessage,
      recoverable: false,
      cause: parsed,
    });
  } catch (error) {
    if (mode === 'loose') {
      logger?.debug('No valid JSON body provided, using defaults');
      return operationSuccess({}, { policy: 'fail_open' });
    }
    logger?.error(message);
    if (logger) {
      await logger.flush();
    }
    return operationFailure(error, {
      policy: 'fail_closed',
      errorCode: 'invalid_json_body',
      message,
      recoverable: false,
      cause: error,
    });
  }
}

export async function parseJsonBodyStrict(
  req: Request,
  logger?: SystemLogger,
  options?: ParseJsonBodyOptions,
): Promise<OperationResult<Record<string, unknown>>> {
  return parseJsonBody(req, logger, {
    mode: 'strict',
    message: options?.message,
    nonObjectMessage: options?.nonObjectMessage,
  });
}

export function parseJsonFailureResponse(
  failure: OperationFailure,
  status = 400,
  extraHeaders?: Record<string, string>,
): Response {
  return edgeErrorResponse(
    {
      errorCode: failure.errorCode,
      message: failure.message,
      recoverable: failure.recoverable,
    },
    status,
    extraHeaders,
  );
}
