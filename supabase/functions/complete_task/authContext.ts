import { CompletionError } from './errors.ts';

export interface CompletionAuthContext {
  isServiceRole: boolean;
  taskOwnerVerified: boolean;
  actorId?: string | null;
}

export function assertCompletionAuthContext(
  authContext: CompletionAuthContext,
  context: string,
): void {
  if (authContext.isServiceRole || authContext.taskOwnerVerified) {
    return;
  }

  throw new CompletionError({
    code: 'completion_auth_invariant_failed',
    context,
    recoverable: false,
    message: `[CompleteTaskAuth] Missing validated completion auth context for ${context}`,
    metadata: {
      isServiceRole: authContext.isServiceRole,
      taskOwnerVerified: authContext.taskOwnerVerified,
      actorId: authContext.actorId ?? null,
    },
  });
}
