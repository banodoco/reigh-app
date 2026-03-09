import { describe, expect, it, vi } from 'vitest';

import {
  authenticationFailedResponse,
  ensureOwnedStoragePath,
  ensureServiceRoleAuth,
  ensureTaskActor,
  ensureUserAuth,
  normalizeTaskId,
} from './requestGuards.ts';

function createLogger() {
  return {
    error: vi.fn(),
  };
}

describe('_shared/requestGuards', () => {
  it('returns the standard 401 auth failure response', async () => {
    const logger = createLogger();

    const response = authenticationFailedResponse(logger);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication failed' });
    expect(logger.error).toHaveBeenCalledWith('Authentication failed');
  });

  it('accepts task actors when either a user id or service role is present', () => {
    const logger = createLogger();

    expect(ensureTaskActor({ userId: 'user-1', isServiceRole: false }, logger)).toEqual({ ok: true });
    expect(ensureTaskActor({ userId: null, isServiceRole: true }, logger)).toEqual({ ok: true });
  });

  it('rejects missing task actor auth', async () => {
    const logger = createLogger();

    const result = ensureTaskActor({ userId: null, isServiceRole: false }, logger);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected failure result');
    }
    expect(result.response.status).toBe(401);
    await expect(result.response.json()).resolves.toEqual({ error: 'Authentication failed' });
  });

  it('returns the authenticated user id when present', () => {
    const logger = createLogger();

    expect(ensureUserAuth({ userId: 'user-1', isServiceRole: false }, logger)).toEqual({
      ok: true,
      userId: 'user-1',
    });
  });

  it('rejects user auth when the user id is missing', async () => {
    const logger = createLogger();

    const result = ensureUserAuth({ userId: null, isServiceRole: true }, logger);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected failure result');
    }
    expect(result.response.status).toBe(401);
  });

  it('accepts service-role auth only for service-role callers', async () => {
    const logger = createLogger();

    expect(ensureServiceRoleAuth({ userId: null, isServiceRole: true }, logger)).toEqual({ ok: true });

    const result = ensureServiceRoleAuth({ userId: 'user-1', isServiceRole: false }, logger);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected failure result');
    }
    expect(result.response.status).toBe(401);
  });

  it('normalizes task ids from strings and numbers only', () => {
    expect(normalizeTaskId('task-1')).toBe('task-1');
    expect(normalizeTaskId(42)).toBe('42');
    expect(normalizeTaskId({ id: 'task-1' })).toBe('');
    expect(normalizeTaskId(null)).toBe('');
  });

  it('normalizes leading and trailing slashes for owned storage paths', () => {
    const logger = createLogger();

    const result = ensureOwnedStoragePath('/user-1/uploads/file.bin/', 'user-1', logger);

    expect(result).toEqual({
      ok: true,
      storagePath: 'user-1/uploads/file.bin',
    });
  });

  it('rejects malformed owned storage paths', async () => {
    const logger = createLogger();

    const result = ensureOwnedStoragePath('user-1/../other/file.bin', 'user-1', logger);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected failure result');
    }
    expect(result.response.status).toBe(400);
    await expect(result.response.json()).resolves.toEqual({ error: 'Invalid storage path' });
  });

  it('rejects storage paths owned by a different user', async () => {
    const logger = createLogger();

    const result = ensureOwnedStoragePath('user-2/uploads/file.bin', 'user-1', logger);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected failure result');
    }
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toEqual({
      error: 'Forbidden: storage path does not belong to authenticated user',
    });
  });
});
