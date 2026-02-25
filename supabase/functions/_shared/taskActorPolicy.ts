import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import type { AuthResult } from './auth.ts';
import { getTaskUserId, verifyTaskOwnership } from './auth.ts';

interface TaskActorBaseInput {
  supabaseAdmin: SupabaseClient;
  taskId: string;
  auth: AuthResult;
  logPrefix: string;
}

type TaskActorPolicyFailure = {
  ok: false;
  error: string;
  statusCode: number;
};

type TaskActorPolicySuccess<T> = {
  ok: true;
  value: T;
};

type TaskActorPolicyResult<T> = TaskActorPolicySuccess<T> | TaskActorPolicyFailure;

export interface AuthorizedTaskActor {
  isServiceRole: boolean;
  callerId: string | null;
  taskOwnerVerified: boolean;
}

export async function authorizeTaskActor(
  input: TaskActorBaseInput,
): Promise<TaskActorPolicyResult<AuthorizedTaskActor>> {
  const { supabaseAdmin, taskId, auth, logPrefix } = input;
  if (auth.isServiceRole) {
    return {
      ok: true,
      value: {
        isServiceRole: true,
        callerId: null,
        taskOwnerVerified: false,
      },
    };
  }

  if (!auth.userId) {
    return {
      ok: false,
      error: 'Authentication failed',
      statusCode: 401,
    };
  }

  const ownershipResult = await verifyTaskOwnership(
    supabaseAdmin,
    taskId,
    auth.userId,
    logPrefix,
  );
  if (!ownershipResult.success) {
    return {
      ok: false,
      error: ownershipResult.error || 'Forbidden',
      statusCode: ownershipResult.statusCode || 403,
    };
  }

  return {
    ok: true,
    value: {
      isServiceRole: false,
      callerId: auth.userId,
      taskOwnerVerified: true,
    },
  };
}

export interface ResolvedTaskStorageActor extends AuthorizedTaskActor {
  taskUserId: string;
}

export async function resolveTaskStorageActor(
  input: TaskActorBaseInput,
): Promise<TaskActorPolicyResult<ResolvedTaskStorageActor>> {
  const authorized = await authorizeTaskActor(input);
  if (!authorized.ok) {
    return authorized;
  }

  if (!authorized.value.isServiceRole) {
    return {
      ok: true,
      value: {
        ...authorized.value,
        taskUserId: authorized.value.callerId!,
      },
    };
  }

  const taskUserResult = await getTaskUserId(
    input.supabaseAdmin,
    input.taskId,
    input.logPrefix,
  );
  if (taskUserResult.error || !taskUserResult.userId) {
    return {
      ok: false,
      error: taskUserResult.error || 'Task user resolution failed',
      statusCode: taskUserResult.statusCode || 404,
    };
  }

  return {
    ok: true,
    value: {
      ...authorized.value,
      taskUserId: taskUserResult.userId,
    },
  };
}
