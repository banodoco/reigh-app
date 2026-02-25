import { describe, it, expect } from 'vitest';

describe('supabase client runtime contracts', () => {
  it('exports canonical client accessor and keeps debug helpers outside the client facade', async () => {
    const clientExports = await import('@/integrations/supabase/client') as Record<string, unknown>;
    const debugModule = await import('@/integrations/supabase/debug/initializeSupabaseDebugGlobals');
    const debugExports = debugModule as Record<string, unknown>;

    expect(typeof clientExports.getSupabaseClient).toBe('function');
    expect(clientExports.initializeSupabaseDebugGlobals).toBeUndefined();
    expect(clientExports.supabase).toBeUndefined();
    expect(clientExports.getLegacySupabaseClient).toBeUndefined();
    expect(typeof debugExports.initializeSupabaseDebugGlobals).toBe('function');
  });

  it('does not expose deprecated legacy proxy module from canonical client path', async () => {
    expect(
      (await import('@/integrations/supabase/client') as Record<string, unknown>).legacySupabaseProxy,
    ).toBeUndefined();
  });
});
