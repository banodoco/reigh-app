import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSupabaseClient: vi.fn(),
  initializeSupabaseRuntime: vi.fn(),
}));

vi.mock('@/integrations/supabase/bootstrap/createSupabaseClient', () => ({
  createSupabaseClient: mocks.createSupabaseClient,
}));

vi.mock('@/integrations/supabase/bootstrap/initializeSupabaseRuntime', () => ({
  initializeSupabaseRuntime: mocks.initializeSupabaseRuntime,
}));

describe('supabaseRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('initializes once, caches the runtime client, and exposes it via getters', async () => {
    const client = { id: 'supabase-client' };
    mocks.createSupabaseClient.mockReturnValue(client);

    const runtime = await import('./supabaseRuntime');

    const first = runtime.initializeSupabaseClientRuntime();
    const second = runtime.initializeSupabaseClientRuntime();
    const result = runtime.getSupabaseRuntimeClientResult();

    expect(first).toBe(client);
    expect(second).toBe(client);
    expect(mocks.createSupabaseClient).toHaveBeenCalledTimes(1);
    expect(mocks.initializeSupabaseRuntime).toHaveBeenCalledWith(client);
    expect(result).toEqual({ ok: true, client });
    expect(runtime.getSupabaseRuntimeClient()).toBe(client);
  });

  it('stores initialization failures and surfaces them from result/getter', async () => {
    const failure = new Error('bootstrap failed');
    mocks.createSupabaseClient.mockImplementation(() => {
      throw failure;
    });

    const runtime = await import('./supabaseRuntime');

    expect(() => runtime.initializeSupabaseClientRuntime()).toThrow('bootstrap failed');
    expect(runtime.getSupabaseRuntimeClientResult()).toEqual({ ok: false, error: failure });
    expect(() => runtime.getSupabaseRuntimeClient()).toThrow('bootstrap failed');
  });

  it('returns a clear not-initialized error before bootstrap', async () => {
    mocks.createSupabaseClient.mockReturnValue({ id: 'unused-client' });
    const runtime = await import('./supabaseRuntime');

    const result = runtime.getSupabaseRuntimeClientResult();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Supabase runtime is not initialized');
    }
  });
});
