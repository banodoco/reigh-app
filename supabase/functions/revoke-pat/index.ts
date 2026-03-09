// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../_shared/http.ts";
import { bootstrapEdgeHandler, NO_SESSION_RUNTIME_OPTIONS } from "../_shared/edgeHandler.ts";
import { ensureUserAuth, JWT_AUTH_REQUIRED } from "../_shared/requestGuards.ts";

serve(async (req) => {
  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "revoke-pat",
    logPrefix: "[REVOKE-PAT]",
    parseBody: "strict",
    auth: JWT_AUTH_REQUIRED,
    ...NO_SESSION_RUNTIME_OPTIONS,
  });
  if (!bootstrap.ok) {
    return bootstrap.response;
  }
  const { supabaseAdmin, logger, auth, body } = bootstrap.value;
  const authResult = ensureUserAuth(auth, logger);
  if (!authResult.ok) {
    await logger.flush();
    return authResult.response;
  }
  const userId = authResult.userId;

  try {
    const tokenId = typeof body.tokenId === 'string' ? body.tokenId : null;

    if (!tokenId) {
      logger.error('Missing credential identifier');
      await logger.flush();
      return jsonResponse({ error: 'tokenId is required' }, 400);
    }

    // Delete the token (RLS will ensure user can only delete their own)
    const { error: deleteError } = await supabaseAdmin
      .from('user_api_tokens')
      .delete()
      .eq('id', tokenId)
      .eq('user_id', userId); // Extra safety check

    if (deleteError) {
      logger.error('Failed to revoke API credential', { error: deleteError.message });
      await logger.flush();
      return jsonResponse({ error: 'Failed to revoke token' }, 500);
    }

    logger.info('Revoked API credential', { user_id: userId });
    await logger.flush();
    return jsonResponse({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in revoke-pat', { error: message });
    await logger.flush();
    return jsonResponse({ error: message }, 500);
  }
}); 
