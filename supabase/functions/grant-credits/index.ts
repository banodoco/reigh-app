import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { authenticateRequest } from "../_shared/auth.ts";
import { SystemLogger } from "../_shared/systemLogger.ts";

/**
 * Edge function: grant-credits
 *
 * Grants credits to a user (admin only, or welcome bonus)
 *
 * POST /functions/v1/grant-credits
 * Headers: Authorization: Bearer <JWT>
 * Body: {
 *   userId: string,
 *   amount: number,
 *   description?: string,
 *   isWelcomeBonus?: boolean
 * }
 *
 * Returns:
 * - 200 OK with transaction details
 * - 400 Bad Request if invalid input or welcome bonus already given
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if not admin (for non-welcome bonus)
 * - 500 Internal Server Error
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  // ─── 1. Parse body ──────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const { userId, amount, description, isWelcomeBonus = false } = body;
  if (!userId || !amount || typeof amount !== 'number' || amount <= 0) {
    return new Response("userId and positive amount are required", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing required environment variables");
    return new Response("Server configuration error", {
      status: 500,
      headers: corsHeaders,
    });
  }

  // Admin client (service role) for unrestricted queries
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const logger = new SystemLogger(adminClient, 'grant-credits');

  // ─── 2. Authenticate request using shared auth module ───────────
  const auth = await authenticateRequest(req, adminClient, "[GRANT-CREDITS]", { allowJwtUserAuth: true });

  if (!auth.success) {
    return new Response(auth.error || "Authentication failed", {
      status: auth.statusCode || 401,
      headers: corsHeaders,
    });
  }

  const isServiceRole = auth.isServiceRole;
  const currentUserId = auth.userId;

  // For welcome bonus, allow authenticated users; for admin grants, require service role
  if (!isWelcomeBonus && !isServiceRole) {
    return new Response("Service role access required for admin grants", {
      status: 403,
      headers: corsHeaders,
    });
  }

  try {
    // ─── 3. Check and handle welcome bonus ──────────────────────────
    if (isWelcomeBonus) {
      // Ensure the user is requesting welcome bonus for themselves (unless service role)
      if (!isServiceRole && currentUserId !== userId) {
        return new Response("Users can only request welcome bonus for themselves", {
          status: 403,
          headers: corsHeaders,
        });
      }

      // Ensure the user row exists before attempting atomic claim
      const { error: checkError } = await adminClient
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();

      if (checkError && checkError.code === 'PGRST116') { // no rows found
        logger.info('No user row found, creating default user record', { user_id: userId });

        const { error: insertError } = await adminClient
          .from('users')
          .upsert({
            id: userId,
            name: '',
            email: '',
            credits: 0,
            given_credits: false,
          }, { onConflict: 'id' });

        if (insertError && insertError.code !== '23505') { // ignore duplicate key
          logger.error('Failed to create user row', { error: insertError.message, user_id: userId });
          return new Response(`Could not create user record: ${insertError.message}`, {
            status: 500,
            headers: corsHeaders,
          });
        }
      } else if (checkError) {
        logger.error('Error checking user', { error: checkError.message, user_id: userId });
        return new Response(`User not found: ${checkError.message}`, {
          status: 400,
          headers: corsHeaders,
        });
      }

      // Atomic check-and-set: only matches if given_credits is currently false.
      // If two requests race, only one will match and get a row back.
      const { data: claimedUser, error: claimError } = await adminClient
        .from('users')
        .update({ given_credits: true })
        .eq('id', userId)
        .eq('given_credits', false)
        .select('id')
        .single();

      if (claimError || !claimedUser) {
        logger.info('Welcome bonus already granted, skipping', { user_id: userId, claimError: claimError?.message });
        await logger.flush();
        return new Response("Welcome bonus already given to this user", {
          status: 400,
          headers: corsHeaders,
        });
      }

      // given_credits is now true — we own the grant. Insert credit into ledger.
      const { data: ledgerEntry, error: ledgerError } = await adminClient
        .from('credits_ledger')
        .insert({
          user_id: userId,
          amount: amount * 100, // Convert dollars to cents
          type: 'manual',
          metadata: {
            description: 'Welcome bonus',
            granted_by: isServiceRole ? 'service_role' : 'system',
            granted_at: new Date().toISOString(),
            is_welcome_bonus: true,
          },
        })
        .select()
        .single();

      if (ledgerError) {
        // Roll back the claim so the user can retry and receive their bonus
        await adminClient.from('users').update({ given_credits: false }).eq('id', userId);
        logger.error("Error granting welcome credits, rolled back claim", { error: ledgerError.message, user_id: userId });
        await logger.flush();
        return new Response(`Failed to grant welcome credits: ${ledgerError.message}`, {
          status: 500,
          headers: corsHeaders,
        });
      }

      logger.info('Welcome bonus granted', { amount, user_id: userId });
      await logger.flush();

      return new Response(JSON.stringify({
        success: true,
        transaction: ledgerEntry,
        message: `Welcome bonus of $${amount} granted successfully!`,
        isWelcomeBonus: true,
      }), {
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    // ─── 6. Handle regular admin credit grant ───────────────────────
    
    const { data: ledgerEntry, error: ledgerError } = await adminClient
      .from('credits_ledger')
      .insert({
        user_id: userId,
        amount: amount * 100, // Convert dollars to cents
        type: 'manual',
        metadata: {
          description: description || 'Admin credit grant',
          granted_by: 'service_role',
          granted_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (ledgerError) {
      logger.error("Error granting credits", { error: ledgerError.message, user_id: userId });
      await logger.flush();
      return new Response(`Failed to grant credits: ${ledgerError.message}`, {
        status: 500,
        headers: corsHeaders,
      });
    }

    logger.info('Credits granted', { amount, user_id: userId, granted_by: 'service_role' });
    await logger.flush();

    return new Response(JSON.stringify({
      success: true,
      transaction: ledgerEntry,
      message: `Successfully granted $${amount} credits to user ${userId}`,
    }), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });

  } catch (error) {
    logger.error("Unexpected error", { error: error.message });
    await logger.flush();
    return new Response(`Internal server error: ${error.message}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
}); 
