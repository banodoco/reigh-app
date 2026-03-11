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

    expect(mod.getSupabaseUrl()).toBe('https://example.supabase.co');
    expect(mod.getSupabasePublishableKey()).toBe('anon-key');
    expect(mod.isDevEnv()).toBe(true);
    expect(mod.isRealtimeDownFixEnabled()).toBe(true);
  });

  it('throws when required supabase URL is missing on first access', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

    const mod = await import('./env');

    // Module loads without throwing — the throw happens on first getter call
    expect(() => mod.getSupabaseUrl()).toThrow(
      'Missing required Supabase environment variable: VITE_SUPABASE_URL'
    );
  });

  it('throws when required supabase anon key is missing on first access', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    const mod = await import('./env');

    expect(() => mod.getSupabasePublishableKey()).toThrow(
      'Missing required Supabase environment variable: VITE_SUPABASE_ANON_KEY'
    );
  });

  it('caches the value after first access', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

    const mod = await import('./env');

    const first = mod.getSupabaseUrl();
    const second = mod.getSupabaseUrl();
    expect(first).toBe(second);
    expect(first).toBe('https://example.supabase.co');
  });

  it('reads debug flags lazily on each call instead of snapshotting at import time', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_APP_ENV', 'production');
    vi.stubEnv('VITE_DEBUG_CORRUPTION_TRACE', 'false');

    const mod = await import('./env');

    expect(mod.isCorruptionTraceEnabled()).toBe(false);

    vi.stubEnv('VITE_DEBUG_CORRUPTION_TRACE', 'true');
    expect(mod.isCorruptionTraceEnabled()).toBe(true);
  });
});
