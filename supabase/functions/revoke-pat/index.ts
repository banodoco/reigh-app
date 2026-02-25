// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../_shared/http.ts";
import { bootstrapEdgeHandler } from "../_shared/edgeHandler.ts";

serve(async (req) => {
  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "revoke-pat",
    logPrefix: "[REVOKE-PAT]",
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
  const { supabaseAdmin, logger, auth, body } = bootstrap.value;

  try {
    if (!auth?.userId) {
      logger.error('Authentication failed');
      await logger.flush();
      return jsonResponse({ error: 'Authentication failed' }, 401);
    }

    const tokenId = typeof body.tokenId === 'string' ? body.tokenId : null;

    if (!tokenId) {
      logger.error('Missing tokenId');
      await logger.flush();
      return jsonResponse({ error: 'tokenId is required' }, 400);
    }

    // Delete the token (RLS will ensure user can only delete their own)
    const { error: deleteError } = await supabaseAdmin
      .from('user_api_tokens')
      .delete()
      .eq('id', tokenId)
      .eq('user_id', auth.userId); // Extra safety check

    if (deleteError) {
      logger.error('Failed to revoke API credential', { error: deleteError.message });
      await logger.flush();
      return jsonResponse({ error: 'Failed to revoke token' }, 500);
    }

    logger.info('Revoked PAT token', { user_id: auth.userId, token_id: tokenId });
    await logger.flush();
    return jsonResponse({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in revoke-pat', { error: message });
    await logger.flush();
    return jsonResponse({ error: message }, 500);
  }
}); 
