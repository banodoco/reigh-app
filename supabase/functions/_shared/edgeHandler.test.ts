import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  initEdgeRuntime: vi.fn(),
  parseJsonBody: vi.fn(),
  parseJsonBodyStrict: vi.fn(),
  parseJsonFailureResponse: vi.fn(),
  operationFailureResponse: vi.fn(),
  edgeErrorResponse: vi.fn(),
}));

vi.mock('./auth.ts', () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

vi.mock('./edgeRequest.ts', () => ({
  initEdgeRuntime: mocks.initEdgeRuntime,
  parseJsonBody: mocks.parseJsonBody,
  parseJsonBodyStrict: mocks.parseJsonBodyStrict,
  parseJsonFailureResponse: mocks.parseJsonFailureResponse,
  operationFailureResponse: mocks.operationFailureResponse,
  edgeErrorResponse: mocks.edgeErrorResponse,
}));

import { bootstrapEdgeHandler, withEdgeRequest } from './edgeHandler.ts';

function jsonResponse(payload: Record<string, unknown>, status: number, headers?: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
  });
}

function installRuntime() {
  const logger = {
    warn: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
  mocks.initEdgeRuntime.mockReturnValue({
    ok: true,
    value: {
      supabaseAdmin: {},
      logger,
    },
  });
  return logger;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.edgeErrorResponse.mockImplementation((input: {
    errorCode: string;
    message: string;
    recoverable: boolean;
  }, status: number, headers?: Record<string, string>) =>
    jsonResponse(
      {
        error: input.errorCode,
        errorCode: input.errorCode,
        message: input.message,
        recoverable: input.recoverable,
      },
      status,
      headers,
    ),
  );
  mocks.parseJsonFailureResponse.mockImplementation((failure: { errorCode: string; message: string }, status = 400) =>
    jsonResponse({ error: failure.errorCode, message: failure.message }, status),
  );
  mocks.operationFailureResponse.mockImplementation((failure: { errorCode: string; message: string }, status = 500) =>
    jsonResponse({ error: failure.errorCode, message: failure.message }, status),
  );
  mocks.parseJsonBody.mockResolvedValue({ ok: true, value: {} });
  mocks.parseJsonBodyStrict.mockResolvedValue({ ok: true, value: {} });
  mocks.authenticateRequest.mockResolvedValue({ success: true, isServiceRole: true, userId: null });
});

describe('bootstrapEdgeHandler', () => {
  it('returns method_not_allowed envelope and Allow header for wrong method', async () => {
    const logger = installRuntime();

    const result = await bootstrapEdgeHandler(
      new Request('http://localhost/test', { method: 'GET' }),
      {
        functionName: 'demo',
        logPrefix: '[DEMO]',
        auth: { required: false },
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected bootstrap to fail on method mismatch');
    }

    expect(result.response.status).toBe(405);
    expect(result.response.headers.get('Allow')).toBe('POST');
    const payload = await result.response.json();
    expect(payload.errorCode).toBe('method_not_allowed');
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.flush).toHaveBeenCalled();
  });

  it('maps auth failures to authentication_failed envelope', async () => {
    installRuntime();
    mocks.authenticateRequest.mockResolvedValue({
      success: false,
      isServiceRole: false,
      userId: null,
      error: 'Invalid token',
      statusCode: 401,
    });

    const result = await bootstrapEdgeHandler(
      new Request('http://localhost/test', { method: 'POST' }),
      {
        functionName: 'demo',
        logPrefix: '[DEMO]',
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected bootstrap to fail on auth error');
    }

    expect(result.response.status).toBe(401);
    const payload = await result.response.json();
    expect(payload.errorCode).toBe('authentication_failed');
    expect(payload.message).toBe('Invalid token');
  });
});

describe('withEdgeRequest', () => {
  it('converts unexpected handler errors to internal_server_error and flushes logs', async () => {
    const logger = installRuntime();

    const response = await withEdgeRequest(
      new Request('http://localhost/test', { method: 'POST' }),
      {
        functionName: 'demo',
        logPrefix: '[DEMO]',
        auth: { required: false },
      },
      async () => {
        throw new Error('boom');
      },
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.errorCode).toBe('internal_server_error');
    expect(logger.critical).toHaveBeenCalledWith(
      'Unexpected error',
      expect.objectContaining({ error: 'boom' }),
    );
    expect(logger.flush).toHaveBeenCalled();
  });
});
