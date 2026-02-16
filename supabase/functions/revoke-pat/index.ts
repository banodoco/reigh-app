// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { jsonResponse } from "../_shared/http.ts";
import { SystemLogger } from "../_shared/systemLogger.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // Create Supabase client with service role for admin operations
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
  const logger = new SystemLogger(supabaseAdmin, 'revoke-pat');

  try {
    const auth = await authenticateRequest(req, supabaseAdmin, "[REVOKE-PAT]", { allowJwtUserAuth: true });
    if (!auth.success || !auth.userId) {
      return jsonResponse({ error: auth.error || 'Authentication failed' }, auth.statusCode || 401);
    }

    // Get request body
    const { tokenId } = await req.json();

    if (!tokenId) {
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

    return jsonResponse({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in revoke-pat', { error: message });
    await logger.flush();
    return jsonResponse({ error: message }, 500);
  }
}); 
