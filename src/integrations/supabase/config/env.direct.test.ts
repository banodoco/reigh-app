import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
});

import * as envModule from './env';

describe('env module direct import', () => {
  it('exposes required supabase constants', () => {
    expect(envModule.SUPABASE_URL).toBeDefined();
    expect(envModule.SUPABASE_PUBLISHABLE_KEY).toBeDefined();
  });
});
