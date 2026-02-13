import { vi } from 'vitest';

/**
 * Creates a chainable mock for supabase query builder.
 * Supports: from().select().eq().single().order().limit().range().in().neq().is().maybeSingle()
 *
 * Usage:
 *   const mock = createSupabaseMock();
 *   vi.mocked(supabase.from).mockReturnValue(mock.from('any'));
 *   mock.setResponse({ data: [...], error: null });
 */
export function createSupabaseMock() {
  let response: { data: unknown; error: unknown } = { data: null, error: null };

  const terminalResponse = () => Promise.resolve(response);

  const chainable: Record<string, unknown> = {};
  const methods = [
    'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike',
    'is', 'in', 'contains', 'containedBy',
    'order', 'limit', 'range', 'filter', 'match', 'not', 'or',
    'textSearch',
  ];

  // Chain methods return chainable
  for (const method of methods) {
    chainable[method] = vi.fn().mockReturnValue(chainable);
  }

  // Terminal methods return the response
  chainable['single'] = vi.fn().mockImplementation(terminalResponse);
  chainable['maybeSingle'] = vi.fn().mockImplementation(terminalResponse);
  // .then() makes the chainable itself awaitable (for queries that don't end with single/maybeSingle)
  chainable['then'] = vi.fn().mockImplementation((resolve: (value: unknown) => void) => resolve(response));

  const from = vi.fn().mockReturnValue(chainable);
  const rpc = vi.fn().mockImplementation(terminalResponse);

  return {
    from,
    rpc,
    chain: chainable,
    setResponse(r: { data: unknown; error: unknown }) {
      response = r;
      // Also update terminal mocks
      (chainable['single'] as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve(r));
      (chainable['maybeSingle'] as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve(r));
      (chainable['then'] as ReturnType<typeof vi.fn>).mockImplementation(
        (resolve: (value: unknown) => void) => resolve(r),
      );
    },
    setError(message: string) {
      this.setResponse({ data: null, error: { message, code: 'PGRST000' } });
    },
  };
}

/** Shorthand: mock a successful supabase response */
export function mockSupabaseResponse(data: unknown) {
  return { data, error: null };
}

/** Shorthand: mock a supabase error */
export function mockSupabaseError(message: string) {
  return { data: null, error: { message, code: 'PGRST000' } };
}

/**
 * Creates a mock supabase auth object.
 */
export function createMockAuth(overrides: {
  userId?: string;
  email?: string;
} = {}) {
  const userId = overrides.userId ?? 'test-user-id';
  const email = overrides.email ?? 'test@example.com';
  const session = {
    user: { id: userId, email },
    access_token: 'test-token',
    refresh_token: 'test-refresh',
  };

  return {
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: session.user }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: { session }, error: null }),
  };
}

/**
 * Creates a mock supabase storage object.
 */
export function createMockStorage() {
  return {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'test/path' }, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/test.png' } }),
      download: vi.fn().mockResolvedValue({ data: new Blob(), error: null }),
      remove: vi.fn().mockResolvedValue({ data: [], error: null }),
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  };
}

/**
 * Full mock supabase client — combine with vi.mock to replace the real client.
 *
 * Usage in test files:
 *   vi.mock('@/integrations/supabase/client', () => ({
 *     supabase: createMockSupabaseClient(),
 *   }));
 */
export function createMockSupabaseClient() {
  const queryMock = createSupabaseMock();
  return {
    from: queryMock.from,
    rpc: queryMock.rpc,
    auth: createMockAuth(),
    storage: createMockStorage(),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    }),
    removeChannel: vi.fn(),
    // Expose for test manipulation
    _mock: queryMock,
  };
}
