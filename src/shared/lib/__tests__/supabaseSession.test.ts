import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSupabaseUrlMock } = vi.hoisted(() => ({
  getSupabaseUrlMock: vi.fn(() => 'https://testproject.supabase.co'),
}));

vi.mock('@/integrations/supabase/config/env', () => ({
  getSupabaseUrl: getSupabaseUrlMock,
}));

import {
  hasStoredSessionToken,
  readAccessTokenFromStorage,
  readUserIdFromStorage,
} from '../supabaseSession';

function setSessionPayload(payload: unknown) {
  localStorage.setItem('sb-testproject-auth-token', JSON.stringify(payload));
}

describe('supabaseSession', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    getSupabaseUrlMock.mockReturnValue('https://testproject.supabase.co');
  });

  it('reads access token from the Supabase storage key', () => {
    setSessionPayload({ access_token: 'access-123', user: { id: 'user-123' } });

    expect(readAccessTokenFromStorage()).toBe('access-123');
    expect(hasStoredSessionToken()).toBe(true);
  });

  it('reads user id from the Supabase storage key', () => {
    setSessionPayload({ access_token: 'access-123', user: { id: 'user-456' } });

    expect(readUserIdFromStorage()).toBe('user-456');
  });

  it('returns null when the key naming does not match sb-<ref>-auth-token', () => {
    localStorage.setItem('sb-wrongproject-auth-token', JSON.stringify({ access_token: 'wrong' }));

    expect(readAccessTokenFromStorage()).toBeNull();
    expect(readUserIdFromStorage()).toBeNull();
    expect(hasStoredSessionToken()).toBe(false);
  });

  it('returns null for malformed JSON payloads', () => {
    localStorage.setItem('sb-testproject-auth-token', '{not-json');

    expect(readAccessTokenFromStorage()).toBeNull();
    expect(readUserIdFromStorage()).toBeNull();
  });

  it('returns null when URL parsing fails', () => {
    getSupabaseUrlMock.mockReturnValue('not-a-valid-url');
    setSessionPayload({ access_token: 'access-123', user: { id: 'user-123' } });

    expect(readAccessTokenFromStorage()).toBeNull();
    expect(readUserIdFromStorage()).toBeNull();
  });

  it('returns null in non-browser environments', () => {
    vi.stubGlobal('window', undefined);

    expect(readAccessTokenFromStorage()).toBeNull();
    expect(readUserIdFromStorage()).toBeNull();
    expect(hasStoredSessionToken()).toBe(false);
  });

  it('returns null when expected fields are missing', () => {
    setSessionPayload({ user: {}, access_token: 123 });

    expect(readAccessTokenFromStorage()).toBeNull();
    expect(readUserIdFromStorage()).toBeNull();
    expect(hasStoredSessionToken()).toBe(false);
  });
});
