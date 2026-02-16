import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { authenticateRequest } from "../_shared/auth.ts";
import { SystemLogger } from "../_shared/systemLogger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Edge function: setup-auto-topup
 * 
 * Creates/updates auto-top-up preferences and saves payment method
 * 
 * POST /functions/v1/setup-auto-topup
 * Headers: Authorization: Bearer <JWT>
 * Body: { 
 *   autoTopupEnabled: boolean,
 *   autoTopupAmount: number, // in dollars
 *   autoTopupThreshold: number, // in dollars
 *   stripeCustomerId?: string,
 *   stripePaymentMethodId?: string
 * }
 * 
 * Returns:
 * - 200 OK with success message
 * - 400 Bad Request if invalid parameters
 * - 401 Unauthorized if no valid token
 * - 500 Internal Server Error
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ─── 1. Parse body ──────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  
  const { 
    autoTopupEnabled, 
    autoTopupAmount, 
    autoTopupThreshold,
    stripeCustomerId,
    stripePaymentMethodId 
  } = body;

  // Validate required fields
  if (typeof autoTopupEnabled !== 'boolean') {
    return jsonResponse({ error: "autoTopupEnabled must be a boolean" }, 400);
  }

  if (autoTopupEnabled) {
    if (!autoTopupAmount || typeof autoTopupAmount !== 'number' || autoTopupAmount < 5 || autoTopupAmount > 100) {
      return jsonResponse({ error: "autoTopupAmount must be a number between $5 and $100" }, 400);
    }
    if (!autoTopupThreshold || typeof autoTopupThreshold !== 'number' || autoTopupThreshold < 1) {
      return jsonResponse({ error: "autoTopupThreshold must be a positive number" }, 400);
    }
    if (autoTopupThreshold >= autoTopupAmount) {
      return jsonResponse({ error: "autoTopupThreshold must be less than autoTopupAmount" }, 400);
    }
  }

  // ─── 2. Authenticate request ────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    console.error("Missing required environment variables");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const logger = new SystemLogger(supabaseAdmin, 'setup-auto-topup');

  const auth = await authenticateRequest(req, supabaseAdmin, "[SETUP-AUTO-TOPUP]", { allowJwtUserAuth: true });
  if (!auth.success || !auth.userId) {
    return jsonResponse({ error: auth.error || "Authentication failed" }, auth.statusCode || 401);
  }

  try {
    // ─── 3. Update user auto-top-up preferences ─────────────────────
    const updateData: unknown = {
      auto_topup_enabled: autoTopupEnabled,
    };

    if (autoTopupEnabled) {
      updateData.auto_topup_amount = Math.round(autoTopupAmount * 100); // Convert to cents
      updateData.auto_topup_threshold = Math.round(autoTopupThreshold * 100); // Convert to cents
      
      // If Stripe data provided, save it
      if (stripeCustomerId) {
        updateData.stripe_customer_id = stripeCustomerId;
      }
      if (stripePaymentMethodId) {
        updateData.stripe_payment_method_id = stripePaymentMethodId;
      }
    } else {
      // When disabling, clear the amounts but keep Stripe data for potential re-enable
      updateData.auto_topup_amount = null;
      updateData.auto_topup_threshold = null;
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update(updateData)
      .eq('id', auth.userId);

    if (updateError) {
      logger.error('Error updating user auto-top-up preferences', { error: updateError.message, user_id: auth.userId });
      await logger.flush();
      return jsonResponse({ error: 'Failed to update preferences' }, 500);
    }

    logger.info('Auto-top-up preferences updated', {
      user_id: auth.userId,
      enabled: autoTopupEnabled,
      amount: autoTopupEnabled ? autoTopupAmount : null,
      threshold: autoTopupEnabled ? autoTopupThreshold : null,
    });

    await logger.flush();
    return jsonResponse({
      success: true,
      message: autoTopupEnabled
        ? `Auto-top-up enabled: $${autoTopupAmount} when balance drops below $${autoTopupThreshold}`
        : 'Auto-top-up disabled'
    });

  } catch (error) {
    logger.error('Error in setup-auto-topup', { error: error.message });
    await logger.flush();
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
