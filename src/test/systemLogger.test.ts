import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SystemLogger } from '../../supabase/functions/_shared/systemLogger';

describe('SystemLogger', () => {
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    consoleLogSpy.mockClear();
    consoleWarnSpy.mockClear();
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('buffers logs and flushes them successfully', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { inserted: 2, errors: 0 },
      error: null,
    });
    const logger = new SystemLogger({ rpc }, 'test-fn', 'task-1');

    logger.info('one');
    logger.warn('two', { shot_id: 'shot-1' });
    expect(logger.getBufferSize()).toBe(2);

    const result = await logger.flush();
    expect(rpc).toHaveBeenCalledWith('func_insert_logs_batch', {
      logs: expect.any(Array),
    });
    expect(result).toEqual({ inserted: 2, errors: 0 });
    expect(logger.getBufferSize()).toBe(0);
  });

  it('returns error counts when rpc flush fails and keeps buffer', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'db failed' },
    });
    const logger = new SystemLogger({ rpc }, 'test-fn');

    logger.error('boom');
    expect(logger.getBufferSize()).toBe(1);

    const result = await logger.flush();
    expect(result).toEqual({ inserted: 0, errors: 1 });
    expect(logger.getBufferSize()).toBe(1);
  });
});
