import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('supabase env config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('loads required env vars and computes dev environment', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_APP_ENV', 'dev');

    const mod = await import('./env');

    expect(mod.SUPABASE_URL).toBe('https://example.supabase.co');
    expect(mod.SUPABASE_PUBLISHABLE_KEY).toBe('anon-key');
    expect(mod.__IS_DEV_ENV__).toBe(true);
    expect(mod.__REALTIME_DOWN_FIX_ENABLED__).toBe(true);
  });

  it('throws when required supabase vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    await expect(import('./env')).rejects.toThrow(
      'Missing required Supabase environment variables'
    );
  });
});
