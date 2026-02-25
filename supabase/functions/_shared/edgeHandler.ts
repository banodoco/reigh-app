import {
  authenticateRequest,
  type AuthOptions,
  type AuthResult,
} from './auth.ts';
import {
  initEdgeRuntime,
  operationFailureResponse,
  parseJsonBody,
  parseJsonBodyStrict,
  parseJsonFailureResponse,
  type EdgeRuntime,
  type InitEdgeRuntimeOptions,
} from './edgeRequest.ts';
import { jsonResponse } from './http.ts';

type BodyParseMode = 'none' | 'strict' | 'loose';
type ErrorResponseFormat = 'json' | 'text';

export interface EdgeBootstrapOptions {
  functionName: string;
  logPrefix: string;
  method?: string;
  parseBody?: BodyParseMode;
  corsPreflight?: boolean;
  errorResponseFormat?: ErrorResponseFormat;
  invalidJsonMessage?: string;
  invalidJsonShapeMessage?: string;
  auth?: {
    required?: boolean;
    requireServiceRole?: boolean;
    options?: AuthOptions;
  };
  runtimeOptions?: InitEdgeRuntimeOptions;
}

export interface EdgeRequestContext<TBody extends Record<string, unknown>> {
  req: Request;
  body: TBody;
  supabaseAdmin: EdgeRuntime['supabaseAdmin'];
  logger: EdgeRuntime['logger'];
  auth: AuthResult | null;
}

type EdgeBootstrapResult<TBody extends Record<string, unknown>> =
  | { ok: true; value: EdgeRequestContext<TBody> }
  | { ok: false; response: Response };

function buildErrorResponse(
  message: string,
  status: number,
  format: ErrorResponseFormat,
  extraHeaders?: Record<string, string>,
): Response {
  if (format === 'text') {
    return new Response(message, {
      status,
      headers: extraHeaders,
    });
  }

  const response = jsonResponse({ error: message }, status);
  if (!extraHeaders || Object.keys(extraHeaders).length === 0) {
    return response;
  }

  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

function parseMode(options: EdgeBootstrapOptions): BodyParseMode {
  return options.parseBody ?? 'none';
}

function methodFor(options: EdgeBootstrapOptions): string {
  return options.method ?? 'POST';
}

function authIsRequired(options: EdgeBootstrapOptions): boolean {
  return options.auth?.required ?? true;
}

function errorFormat(options: EdgeBootstrapOptions): ErrorResponseFormat {
  return options.errorResponseFormat ?? 'json';
}

/**
 * Shared bootstrap for edge handlers:
 * - OPTIONS short-circuit
 * - method guard
 * - runtime initialization
 * - optional JSON body parsing
 * - optional authentication + service-role policy
 */
export async function bootstrapEdgeHandler<TBody extends Record<string, unknown> = Record<string, unknown>>(
  req: Request,
  options: EdgeBootstrapOptions,
): Promise<EdgeBootstrapResult<TBody>> {
  const method = methodFor(options);
  const format = errorFormat(options);
  const corsPreflight = options.corsPreflight ?? true;

  if (corsPreflight && req.method === 'OPTIONS') {
    return {
      ok: false,
      response: jsonResponse({ ok: true }),
    };
  }

  const runtimeResult = initEdgeRuntime(
    options.functionName,
    options.logPrefix,
    options.runtimeOptions,
  );
  if (!runtimeResult.ok) {
    return {
      ok: false,
      response: operationFailureResponse(runtimeResult, 500),
    };
  }

  const { supabaseAdmin, logger } = runtimeResult.value;

  if (req.method !== method) {
    logger.warn('Method not allowed', { method: req.method });
    await logger.flush();
    return {
      ok: false,
      response: buildErrorResponse('Method not allowed', 405, format, { Allow: method }),
    };
  }

  let body: Record<string, unknown> = {};

  if (parseMode(options) === 'strict') {
    const parsedBody = await parseJsonBodyStrict(req, logger, {
      message: options.invalidJsonMessage,
      nonObjectMessage: options.invalidJsonShapeMessage,
    });
    if (!parsedBody.ok) {
      return {
        ok: false,
        response: format === 'text'
          ? buildErrorResponse(parsedBody.message, 400, 'text')
          : parseJsonFailureResponse(parsedBody),
      };
    }
    body = parsedBody.value;
  } else if (parseMode(options) === 'loose') {
    const parsedBody = await parseJsonBody(req, logger, {
      mode: 'loose',
      message: options.invalidJsonMessage,
      nonObjectMessage: options.invalidJsonShapeMessage,
    });
    if (!parsedBody.ok) {
      return {
        ok: false,
        response: format === 'text'
          ? buildErrorResponse(parsedBody.message, 400, 'text')
          : parseJsonFailureResponse(parsedBody),
      };
    }
    body = parsedBody.value;
  }

  let auth: AuthResult | null = null;
  if (authIsRequired(options)) {
    auth = await authenticateRequest(
      req,
      supabaseAdmin,
      options.logPrefix,
      options.auth?.options ?? {},
    );
    if (!auth.success) {
      return {
        ok: false,
        response: buildErrorResponse(
          auth.error || 'Authentication failed',
          auth.statusCode || 401,
          format,
        ),
      };
    }

    if (options.auth?.requireServiceRole && !auth.isServiceRole) {
      return {
        ok: false,
        response: buildErrorResponse('Unauthorized - service role required', 403, format),
      };
    }
  }

  return {
    ok: true,
    value: {
      req,
      body: body as TBody,
      supabaseAdmin,
      logger,
      auth,
    },
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * High-level request wrapper that standardizes edge endpoint choreography:
 * bootstrap -> handler -> unified unexpected-error response -> guaranteed flush.
 */
export async function withEdgeRequest<TBody extends Record<string, unknown> = Record<string, unknown>>(
  req: Request,
  options: EdgeBootstrapOptions,
  handler: (context: EdgeRequestContext<TBody>) => Promise<Response>,
): Promise<Response> {
  const bootstrap = await bootstrapEdgeHandler<TBody>(req, options);
  if (!bootstrap.ok) {
    return bootstrap.response;
  }

  const context = bootstrap.value;
  try {
    return await handler(context);
  } catch (error: unknown) {
    context.logger.critical('Unexpected error', {
      error: toErrorMessage(error),
    });
    return buildErrorResponse('Internal server error', 500, errorFormat(options));
  } finally {
    await context.logger.flush();
  }
}
