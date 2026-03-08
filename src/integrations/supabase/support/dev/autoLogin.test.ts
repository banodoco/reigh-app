import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maybeAutoLogin } from './autoLogin';

const { isDevEnvState, handleErrorMock } = vi.hoisted(() => ({
  isDevEnvState: { value: false },
  handleErrorMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/config/env', () => ({
  get __IS_DEV_ENV__() {
    return isDevEnvState.value;
  },
  getSupabaseUrl: () => 'https://testproject.supabase.co',
}));

vi.mock('@/shared/lib/errorHandling/runtimeErrorReporting', () => ({
  normalizeAndLogError: handleErrorMock,
}));

describe('maybeAutoLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it('does nothing outside dev environment', () => {
    isDevEnvState.value = false;
    const signInWithPassword = vi.fn();
    maybeAutoLogin({ auth: { signInWithPassword } } as never);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('logs in with configured dev credentials when no session is stored', () => {
    isDevEnvState.value = true;
    vi.stubEnv('VITE_DEV_USER_EMAIL', 'dev@example.com');
    vi.stubEnv('VITE_DEV_USER_PASSWORD', 'password123');
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });

    maybeAutoLogin({ auth: { signInWithPassword } } as never);

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'dev@example.com',
      password: 'password123',
    });
  });

  it('skips sign-in when a session is already stored in localStorage', () => {
    isDevEnvState.value = true;
    vi.stubEnv('VITE_DEV_USER_EMAIL', 'dev@example.com');
    vi.stubEnv('VITE_DEV_USER_PASSWORD', 'password123');
    localStorage.setItem('sb-testproject-auth-token', JSON.stringify({ access_token: 'existing-token' }));
    const signInWithPassword = vi.fn();

    maybeAutoLogin({ auth: { signInWithPassword } } as never);

    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('skips sign-in even when the stored token is expired (auto-refresh handles it)', () => {
    isDevEnvState.value = true;
    vi.stubEnv('VITE_DEV_USER_EMAIL', 'dev@example.com');
    vi.stubEnv('VITE_DEV_USER_PASSWORD', 'password123');
    const pastExpiry = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem('sb-testproject-auth-token', JSON.stringify({ access_token: 'stale-token', expires_at: pastExpiry }));
    const signInWithPassword = vi.fn();

    maybeAutoLogin({ auth: { signInWithPassword } } as never);

    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('reports login errors through normalizeAndLogError', async () => {
    isDevEnvState.value = true;
    vi.stubEnv('VITE_DEV_USER_EMAIL', 'dev@example.com');
    vi.stubEnv('VITE_DEV_USER_PASSWORD', 'password123');
    const authError = { message: 'bad credentials' };
    const signInWithPassword = vi.fn().mockResolvedValue({ error: authError });

    maybeAutoLogin({ auth: { signInWithPassword } } as never);
    await Promise.resolve();

    expect(handleErrorMock).toHaveBeenCalledWith(
      authError,
      expect.objectContaining({
        context: 'SupabaseAutoLogin',
      })
    );
  });
});
