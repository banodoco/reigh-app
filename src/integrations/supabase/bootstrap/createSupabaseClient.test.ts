import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseClient } from './createSupabaseClient';

const { createClientMock, handleErrorMock, fetchWithTimeoutMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  handleErrorMock: vi.fn(),
  fetchWithTimeoutMock: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

vi.mock('@/shared/lib/errorHandling/handleError', () => ({
  handleError: handleErrorMock,
}));

vi.mock('@/integrations/supabase/config/env', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'anon-key',
}));

vi.mock('./fetchWithTimeout', () => ({
  fetchWithTimeout: fetchWithTimeoutMock,
}));

describe('createSupabaseClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates supabase client with realtime and fetch timeout config', () => {
    const fakeClient = { tag: 'client', rest: {}, auth: { onAuthStateChange: vi.fn() } };
    createClientMock.mockReturnValue(fakeClient);

    const client = createSupabaseClient();

    expect(client).toBe(fakeClient);
    expect(createClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.objectContaining({
        global: expect.objectContaining({
          fetch: fetchWithTimeoutMock,
        }),
        realtime: expect.objectContaining({
          heartbeatIntervalMs: 30000,
        }),
      })
    );
  });

  it('reports and rethrows creation errors', () => {
    const error = new Error('creation failed');
    createClientMock.mockImplementation(() => {
      throw error;
    });

    expect(() => createSupabaseClient()).toThrow(error);
    expect(handleErrorMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        context: 'SupabaseClient',
        showToast: false,
      })
    );
  });
});
