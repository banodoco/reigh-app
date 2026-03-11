import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SystemLogger } from './systemLogger.ts';

function createSupabaseStub() {
  return {
    rpc: vi.fn().mockResolvedValue({
      data: { inserted: 2, errors: 0 },
      error: null,
    }),
  };
}

describe('SystemLogger', () => {
  const originalDeno = globalThis.Deno;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('Deno', {
      env: {
        get: vi.fn(() => undefined),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalDeno) {
      vi.stubGlobal('Deno', originalDeno);
    }
  });

  it('buffers info logs without console chatter by default and does not log flush success', async () => {
    const supabaseAdmin = createSupabaseStub();
    const logger = new SystemLogger(supabaseAdmin as never, 'edge-test');

    logger.info('Processing request', { task_id: 'task-1', user_id: 'user-1', nested: { keep: true } });

    expect(console.log).not.toHaveBeenCalled();
    expect(logger.getBufferSize()).toBe(1);

    await logger.flush();

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('func_insert_logs_batch', {
      logs: [
        expect.objectContaining({
          message: 'Processing request',
          task_id: 'task-1',
          metadata: {
            user_id: 'user-1',
            nested: { keep: true },
          },
        }),
      ],
    });
    expect(console.log).not.toHaveBeenCalled();
  });

  it('writes warnings and errors with selected console context only', () => {
    const logger = new SystemLogger(createSupabaseStub() as never, 'edge-test');

    logger.warn('Task access denied', {
      task_id: 'task-1',
      status_code: 403,
      error: 'Forbidden',
      nested: { raw: true },
    });
    logger.error('Unexpected error', {
      task_id: 'task-2',
      user_id: 'user-2',
      error: 'boom',
      ignored: { huge: true },
    });

    expect(console.warn).toHaveBeenCalledWith('[EDGE-TEST] WARN Task access denied', {
      task_id: 'task-1',
      error: 'Forbidden',
      status_code: 403,
    });
    expect(console.error).toHaveBeenCalledWith('[EDGE-TEST] ERROR Unexpected error', {
      task_id: 'task-2',
      user_id: 'user-2',
      error: 'boom',
    });
  });

  it('enables info/debug console logging only when EDGE_LOG_DEBUG=true', () => {
    vi.stubGlobal('Deno', {
      env: {
        get: vi.fn((key: string) => (key === 'EDGE_LOG_DEBUG' ? 'true' : undefined)),
      },
    });

    const logger = new SystemLogger(createSupabaseStub() as never, 'edge-test');

    logger.debug('Debugging', { task_id: 'task-1', ignored: 'nope' });
    logger.info('Still visible', { user_id: 'user-1', nested: { keep: true } });

    expect(console.log).toHaveBeenNthCalledWith(1, '[EDGE-TEST] Debugging', {
      task_id: 'task-1',
    });
    expect(console.log).toHaveBeenNthCalledWith(2, '[EDGE-TEST] Still visible', {
      user_id: 'user-1',
    });
  });
});
