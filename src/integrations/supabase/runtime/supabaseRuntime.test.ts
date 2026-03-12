import { beforeEach, describe, expect, it, vi } from 'vitest';

interface RuntimeModuleHandles {
  createSupabaseClient: ReturnType<typeof vi.fn>;
  initializeSupabaseRuntime: ReturnType<typeof vi.fn>;
  module: typeof import('./supabaseRuntime');
}

async function loadRuntimeModule(options?: {
  createImpl?: () => unknown;
  initializeImpl?: (client: unknown) => void;
}): Promise<RuntimeModuleHandles> {
  vi.resetModules();
  const createSupabaseClient = vi.fn(options?.createImpl ?? (() => ({ id: 'client' })));
  const initializeSupabaseRuntime = vi.fn(options?.initializeImpl ?? (() => {}));

  vi.doMock('@/integrations/supabase/bootstrap/createSupabaseClient', () => ({
    createSupabaseClient,
  }));
  vi.doMock('@/integrations/supabase/bootstrap/initializeSupabaseRuntime', () => ({
    initializeSupabaseRuntime,
  }));

  const module = await import('./supabaseRuntime');
  return { createSupabaseClient, initializeSupabaseRuntime, module };
}

describe('supabaseRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes unknown errors into Error instances', async () => {
    const { module } = await loadRuntimeModule();
    const existing = new Error('existing');

    expect(module.normalizeSupabaseError(existing)).toBe(existing);
    expect(module.normalizeSupabaseError('boom')).toEqual(new Error('boom'));
  });

  it('initializes once, caches the runtime client, and returns success result', async () => {
    const mockClient = { id: 'supabase-client' };
    const { module, createSupabaseClient, initializeSupabaseRuntime } = await loadRuntimeModule({
      createImpl: () => mockClient,
    });

    const first = module.initializeSupabaseClientRuntime();
    const second = module.initializeSupabaseClientRuntime();
    const accessResult = module.getSupabaseRuntimeClientResult();

    expect(first).toBe(mockClient);
    expect(second).toBe(mockClient);
    expect(createSupabaseClient).toHaveBeenCalledTimes(1);
    expect(initializeSupabaseRuntime).toHaveBeenCalledTimes(1);
    expect(initializeSupabaseRuntime).toHaveBeenCalledWith(mockClient);
    expect(accessResult).toEqual({ ok: true, client: mockClient });
  });

  it('stores initialization failures and exposes them via access result', async () => {
    const thrown = new Error('bootstrap failed');
    const { module, createSupabaseClient, initializeSupabaseRuntime } = await loadRuntimeModule({
      createImpl: () => {
        throw thrown;
      },
    });

    expect(() => module.initializeSupabaseClientRuntime()).toThrow(thrown);
    expect(createSupabaseClient).toHaveBeenCalledTimes(1);
    expect(initializeSupabaseRuntime).not.toHaveBeenCalled();

    const result = module.getSupabaseRuntimeClientResult();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(thrown);
    }
  });

  it('returns a not-initialized error before runtime bootstrap', async () => {
    const { module } = await loadRuntimeModule();

    const result = module.getSupabaseRuntimeClientResult();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Supabase runtime is not initialized');
    }
  });

  it('lazily initializes the runtime when the safe accessor is used before bootstrap', async () => {
    const mockClient = { id: 'lazy-client' };
    const { module, createSupabaseClient, initializeSupabaseRuntime } = await loadRuntimeModule({
      createImpl: () => mockClient,
    });

    const result = module.getOrInitializeSupabaseRuntimeClientResult();

    expect(result).toEqual({ ok: true, client: mockClient });
    expect(createSupabaseClient).toHaveBeenCalledTimes(1);
    expect(initializeSupabaseRuntime).toHaveBeenCalledTimes(1);
    expect(module.getSupabaseRuntimeClientResult()).toEqual({ ok: true, client: mockClient });
  });

  it('surfaces lazy initialization failures through the safe accessor', async () => {
    const thrown = new Error('lazy bootstrap failed');
    const { module, createSupabaseClient } = await loadRuntimeModule({
      createImpl: () => {
        throw thrown;
      },
    });

    const result = module.getOrInitializeSupabaseRuntimeClientResult();

    expect(createSupabaseClient).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(thrown);
    }
  });
});
