import { describe, expect, it, vi } from 'vitest';
import { initializeSupabaseRuntime } from './initializeSupabaseRuntime';

const {
  initAuthStateManagerMock,
  initializeReconnectSchedulerMock,
  maybeAutoLoginMock,
  initializeToolSettingsAuthCacheMock,
} = vi.hoisted(() => ({
  initAuthStateManagerMock: vi.fn(),
  initializeReconnectSchedulerMock: vi.fn(),
  maybeAutoLoginMock: vi.fn(),
  initializeToolSettingsAuthCacheMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/auth/AuthStateManager', () => ({
  initAuthStateManager: initAuthStateManagerMock,
}));

vi.mock('@/integrations/supabase/support/reconnect/ReconnectScheduler', () => ({
  initializeReconnectScheduler: initializeReconnectSchedulerMock,
}));

vi.mock('@/integrations/supabase/support/dev/autoLogin', () => ({
  maybeAutoLogin: maybeAutoLoginMock,
}));

vi.mock('@/shared/settings', () => ({
  initializeToolSettingsAuthCache: initializeToolSettingsAuthCacheMock,
}));

describe('initializeSupabaseRuntime', () => {
  it('wires runtime subsystems in order', () => {
    const client = { id: 'client' } as never;
    const reconnectScheduler = { id: 'reconnect-scheduler' };
    const authStateManager = { subscribe: vi.fn() };

    initializeReconnectSchedulerMock.mockReturnValue(reconnectScheduler);
    initAuthStateManagerMock.mockReturnValue(authStateManager);

    initializeSupabaseRuntime(client);

    expect(initializeReconnectSchedulerMock).toHaveBeenCalledTimes(1);
    expect(initAuthStateManagerMock).toHaveBeenCalledWith(client, reconnectScheduler);
    expect(initializeToolSettingsAuthCacheMock).toHaveBeenCalledWith(client, authStateManager);
    expect(maybeAutoLoginMock).toHaveBeenCalledWith(client);
  });
});
