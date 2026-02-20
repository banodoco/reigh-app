import { describe, expect, it, vi } from 'vitest';
import { initializeSupabaseRuntime } from './initializeSupabaseRuntime';

const {
  initAuthStateManagerMock,
  getReconnectSchedulerMock,
  installRealtimeInstrumentationMock,
  maybeAutoLoginMock,
} = vi.hoisted(() => ({
  initAuthStateManagerMock: vi.fn(),
  getReconnectSchedulerMock: vi.fn(),
  installRealtimeInstrumentationMock: vi.fn(),
  maybeAutoLoginMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/auth/AuthStateManager', () => ({
  initAuthStateManager: initAuthStateManagerMock,
}));

vi.mock('@/integrations/supabase/reconnect/ReconnectScheduler', () => ({
  getReconnectScheduler: getReconnectSchedulerMock,
}));

vi.mock('@/integrations/supabase/instrumentation/realtime', () => ({
  installRealtimeInstrumentation: installRealtimeInstrumentationMock,
}));

vi.mock('@/integrations/supabase/dev/autoLogin', () => ({
  maybeAutoLogin: maybeAutoLoginMock,
}));

describe('initializeSupabaseRuntime', () => {
  it('wires runtime subsystems in order', () => {
    const client = { id: 'client' } as never;

    initializeSupabaseRuntime(client);

    expect(getReconnectSchedulerMock).toHaveBeenCalledTimes(1);
    expect(initAuthStateManagerMock).toHaveBeenCalledWith(client);
    expect(installRealtimeInstrumentationMock).toHaveBeenCalledWith(client);
    expect(maybeAutoLoginMock).toHaveBeenCalledWith(client);
  });
});
