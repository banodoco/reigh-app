import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  verifyTaskOwnership: vi.fn(),
  getTaskUserId: vi.fn(),
}));

vi.mock('./auth.ts', () => ({
  verifyTaskOwnership: authMocks.verifyTaskOwnership,
  getTaskUserId: authMocks.getTaskUserId,
}));

import { authorizeTaskActor, resolveTaskStorageActor } from './taskActorPolicy.ts';

function baseInput() {
  return {
    supabaseAdmin: {} as never,
    taskId: 'task-1',
    logPrefix: '[TEST]',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authorizeTaskActor', () => {
  it('short-circuits service-role callers without ownership checks', async () => {
    const result = await authorizeTaskActor({
      ...baseInput(),
      auth: { isServiceRole: true, userId: null, success: true },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        isServiceRole: true,
        callerId: null,
        taskOwnerVerified: false,
      },
    });
    expect(authMocks.verifyTaskOwnership).not.toHaveBeenCalled();
  });

  it('rejects non-service callers with no user id', async () => {
    const result = await authorizeTaskActor({
      ...baseInput(),
      auth: { isServiceRole: false, userId: null, success: false },
    });

    expect(result).toEqual({
      ok: false,
      error: 'Authentication failed',
      statusCode: 401,
    });
  });

  it('propagates ownership verification failures', async () => {
    authMocks.verifyTaskOwnership.mockResolvedValue({
      success: false,
      error: 'Forbidden',
      statusCode: 403,
    });

    const result = await authorizeTaskActor({
      ...baseInput(),
      auth: { isServiceRole: false, userId: 'user-1', success: true },
    });

    expect(result).toEqual({
      ok: false,
      error: 'Forbidden',
      statusCode: 403,
    });
  });
});

describe('resolveTaskStorageActor', () => {
  it('uses caller id directly for non-service-role actors', async () => {
    authMocks.verifyTaskOwnership.mockResolvedValue({
      success: true,
      projectId: 'project-1',
    });

    const result = await resolveTaskStorageActor({
      ...baseInput(),
      auth: { isServiceRole: false, userId: 'user-1', success: true },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        isServiceRole: false,
        callerId: 'user-1',
        taskOwnerVerified: true,
        taskUserId: 'user-1',
      },
    });
    expect(authMocks.getTaskUserId).not.toHaveBeenCalled();
  });

  it('resolves task user id for service-role actors', async () => {
    authMocks.getTaskUserId.mockResolvedValue({ userId: 'owner-7' });

    const result = await resolveTaskStorageActor({
      ...baseInput(),
      auth: { isServiceRole: true, userId: null, success: true },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        isServiceRole: true,
        callerId: null,
        taskOwnerVerified: false,
        taskUserId: 'owner-7',
      },
    });
  });

  it('returns failure when service-role task user resolution fails', async () => {
    authMocks.getTaskUserId.mockResolvedValue({
      userId: null,
      error: 'Task not found',
      statusCode: 404,
    });

    const result = await resolveTaskStorageActor({
      ...baseInput(),
      auth: { isServiceRole: true, userId: null, success: true },
    });

    expect(result).toEqual({
      ok: false,
      error: 'Task not found',
      statusCode: 404,
    });
  });
});
