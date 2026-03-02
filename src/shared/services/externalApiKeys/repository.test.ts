import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  supabaseClient: {} as Record<string, unknown>,
}));

function createQueryBuilder() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = mocks.select.mockImplementation(() => chain);
  chain.eq = mocks.eq.mockImplementation(() => chain);
  chain.maybeSingle = mocks.maybeSingle;
  chain.single = mocks.single;
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => mocks.supabaseClient,
}));

import {
  deleteExternalApiKey,
  fetchExternalApiKey,
  saveExternalApiKey,
} from './repository';

describe('externalApiKeys repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = createQueryBuilder();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.single.mockResolvedValue({ data: { id: 'key-1' }, error: null });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue(query);
    mocks.supabaseClient = {
      auth: { getUser: mocks.getUser },
      from: mocks.from,
      rpc: mocks.rpc,
    };
  });

  it('throws when fetching key without an authenticated user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    await expect(fetchExternalApiKey('openai')).rejects.toThrow('Not authenticated');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('fetches an external api key by service for the current user', async () => {
    const record = {
      id: 'key-2',
      service: 'openai',
      metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    mocks.maybeSingle.mockResolvedValue({ data: record, error: null });

    const result = await fetchExternalApiKey('openai');

    expect(mocks.from).toHaveBeenCalledWith('external_api_keys');
    expect(mocks.select).toHaveBeenCalledWith('id, service, metadata, created_at, updated_at');
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mocks.eq).toHaveBeenCalledWith('service', 'openai');
    expect(result).toEqual(record);
  });

  it('saves a key through rpc then fetches the persisted record', async () => {
    const savedRecord = {
      id: 'key-3',
      service: 'openai',
      metadata: { name: 'primary' },
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    };
    mocks.single.mockResolvedValue({ data: savedRecord, error: null });

    const result = await saveExternalApiKey('openai', 'secret-key', { name: 'primary' });

    expect(mocks.rpc).toHaveBeenCalledWith('save_external_api_key', {
      p_service: 'openai',
      p_key_value: 'secret-key',
      p_metadata: { name: 'primary' },
    });
    expect(result).toEqual(savedRecord);
  });

  it('deletes a key through rpc', async () => {
    await deleteExternalApiKey('openai');

    expect(mocks.rpc).toHaveBeenCalledWith('delete_external_api_key', {
      p_service: 'openai',
    });
  });
});
