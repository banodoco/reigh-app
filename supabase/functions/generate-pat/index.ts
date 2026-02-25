// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  checkRateLimit,
  isRateLimitExceededFailure,
  rateLimitFailureResponse,
} from "../_shared/rateLimit.ts";
import { jsonResponse } from "../_shared/http.ts";
import { bootstrapEdgeHandler } from "../_shared/edgeHandler.ts";

// Generate a cryptographically secure random 32-character token
function generateToken(): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomValues = new Uint8Array(32);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (v) => charset[v % charset.length]).join('');
}

const GENERATE_PAT_RATE_LIMIT = { maxRequests: 10, windowSeconds: 60 } as const;

serve(async (req) => {
  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "generate-pat",
    logPrefix: "[GENERATE-PAT]",
    parseBody: "strict",
    auth: {
      options: { allowJwtUserAuth: true },
    },
    runtimeOptions: {
      clientOptions: {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    },
  });
  if (!bootstrap.ok) {
    return bootstrap.response;
  }

  const { supabaseAdmin, logger, body, auth } = bootstrap.value;

  try {
    if (!auth?.userId) {
      logger.error('Authentication failed');
      await logger.flush();
      return jsonResponse({ error: 'Authentication failed' }, 401);
    }

    // Rate limit: max 10 PAT generations per minute per user
    const rateLimitResult = await checkRateLimit(
      supabaseAdmin,
      'generate-pat',
      auth.userId,
      GENERATE_PAT_RATE_LIMIT,
      '[GENERATE-PAT]'
    );
    if (!rateLimitResult.ok) {
      if (isRateLimitExceededFailure(rateLimitResult)) {
        return rateLimitFailureResponse(rateLimitResult, GENERATE_PAT_RATE_LIMIT);
      }

      logger.error('Rate limit check failed', {
        user_id: auth.userId,
        error_code: rateLimitResult.errorCode,
        message: rateLimitResult.message,
      });
      await logger.flush();
      return jsonResponse({ error: 'Rate limit service unavailable' }, 503);
    }

    if (rateLimitResult.policy === 'fail_open') {
      logger.warn('Rate limit check degraded; allowing request', {
        user_id: auth.userId,
        reason: rateLimitResult.value.degraded?.reason,
        message: rateLimitResult.value.degraded?.message,
      });
    }

    const label = typeof body.label === 'string' && body.label.trim().length > 0
      ? body.label
      : 'API Token';

    // Generate a cryptographically secure 32-character token
    const apiToken = generateToken();

    // Store token metadata
    const { error: insertError } = await supabaseAdmin
      .from('user_api_tokens')
      .insert({
        user_id: auth.userId,
        token: apiToken,
        label,
      });

    if (insertError) {
      logger.error('Failed to store API credential metadata', { error: insertError.message });
      await logger.flush();
      return jsonResponse({ error: 'Failed to store token metadata', details: insertError.message }, 500);
    }

    logger.info('Created PAT token', { user_id: auth.userId, label });
    await logger.flush();
    return jsonResponse({ 
      token: apiToken,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in generate-pat', { error: message });
    await logger.flush();
    return jsonResponse({ error: message }, 500);
  }
}); 
