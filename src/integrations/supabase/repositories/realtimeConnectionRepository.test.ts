import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRealtimeChannel,
  fetchRealtimeSession,
  setRealtimeAuthToken,
} from './realtimeConnectionRepository';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: (...args: unknown[]) => mocks.getSupabaseClient(...args),
}));

describe('realtimeConnectionRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates session lookup to supabase auth.getSession', async () => {
    const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } });
    mocks.getSupabaseClient.mockReturnValue({
      auth: { getSession },
      realtime: { setAuth: vi.fn() },
      channel: vi.fn(),
    });

    const result = await fetchRealtimeSession();

    expect(getSession).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: { session: { access_token: 'token' } } });
  });

  it('forwards auth token and channel topic to realtime client', () => {
    const setAuth = vi.fn();
    const channel = vi.fn().mockReturnValue({ topic: 'updates' });
    mocks.getSupabaseClient.mockReturnValue({
      auth: { getSession: vi.fn() },
      realtime: { setAuth },
      channel,
    });

    setRealtimeAuthToken('abc123');
    const created = createRealtimeChannel('room:1');

    expect(setAuth).toHaveBeenCalledWith('abc123');
    expect(channel).toHaveBeenCalledWith('room:1');
    expect(created).toEqual({ topic: 'updates' });
  });
});
