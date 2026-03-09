import { toErrorMessage } from "../_shared/errorMessage.ts";
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { NO_SESSION_RUNTIME_OPTIONS, withEdgeRequest } from "../_shared/edgeHandler.ts"
import { verifyProjectOwnership } from "../_shared/auth.ts"
import { checkRateLimit, isRateLimitExceededFailure, rateLimitFailureResponse } from "../_shared/rateLimit.ts"
import { jsonResponse } from "../_shared/http.ts"
import { ensureUserAuth } from "../_shared/requestGuards.ts"

serve(async (req) => {
  return withEdgeRequest(req, {
    functionName: 'delete-project',
    logPrefix: '[DELETE-PROJECT]',
    method: 'POST',
    parseBody: 'strict',
    auth: {
      required: true,
      options: { allowJwtUserAuth: true },
    },
    ...NO_SESSION_RUNTIME_OPTIONS,
  }, async ({ supabaseAdmin, logger, auth, body }) => {
    const userGuard = ensureUserAuth(auth, logger);
    if (!userGuard.ok) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const userId = userGuard.userId;

    const projectId = typeof body.projectId === 'string' ? body.projectId : '';
    if (!projectId) {
      return jsonResponse({ error: 'Missing projectId' }, 400);
    }

    try {
    const ownership = await verifyProjectOwnership(
      supabaseAdmin,
      projectId,
      userId,
      '[DELETE-PROJECT]',
    );
    if (!ownership.success) {
      logger.warn('Project ownership verification failed', {
        projectId,
        user_id: userId,
        reason: ownership.error,
      });
      return jsonResponse(
        { error: ownership.error || 'Forbidden: You do not own this project' },
        ownership.statusCode || 403,
      );
    }

    // Rate limit: 10 requests per minute for this destructive operation
    const deleteProjectLimit = { maxRequests: 10, windowSeconds: 60 }
    const rateLimitResult = await checkRateLimit({
      supabaseAdmin,
      functionName: 'delete-project',
      identifier: userId,
      config: deleteProjectLimit,
      logPrefix: '[DELETE-PROJECT]',
    })
    if (!rateLimitResult.ok) {
      if (isRateLimitExceededFailure(rateLimitResult)) {
        logger.warn("Rate limit exceeded", { user_id: userId })
        return rateLimitFailureResponse(rateLimitResult, deleteProjectLimit)
      }

      logger.error("Rate limit check failed", {
        user_id: userId,
        error_code: rateLimitResult.errorCode,
        message: rateLimitResult.message,
      })
      return jsonResponse({ error: 'Rate limit service unavailable' }, 503)
    }

    if (rateLimitResult.policy === 'fail_open') {
      logger.warn("Rate limit check degraded; allowing request", {
        user_id: userId,
        reason: rateLimitResult.value.degraded?.reason,
        message: rateLimitResult.value.degraded?.message,
      })
    }

    logger.info('Starting deletion', { projectId, user_id: userId })

    // Call the PostgreSQL function with extended timeout (5 minutes)
    // This handles large projects that would otherwise timeout due to CASCADE deletes
    const { error: deleteError } = await supabaseAdmin.rpc(
      'delete_project_with_extended_timeout',
      { p_project_id: projectId, p_user_id: userId }
    )

    if (deleteError) {
      logger.error('Error deleting project', { projectId, error: deleteError.message })
      return jsonResponse({ error: `Failed to delete project: ${deleteError.message}` }, 500)
    }

    logger.info('Successfully deleted project', { projectId })
    return jsonResponse({ success: true }, 200)
  } catch (err: unknown) {
    const message = toErrorMessage(err)
    logger.error('Unexpected error', { error: message })
    return jsonResponse({ error: message || 'Unexpected error' }, 500)
  }})
})
