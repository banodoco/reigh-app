import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { SystemLogger } from "../_shared/systemLogger.ts";
import { authenticateRequest } from "../_shared/auth.ts";

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
 * Edge function: process-auto-topup
 * 
 * Processes automatic credit top-up using saved payment method
 * 
 * POST /functions/v1/process-auto-topup
 * Headers: Authorization: Bearer <service_role_key>
 * Body: { userId: string }
 * 
 * Returns:
 * - 200 OK with payment details
 * - 400 Bad Request if invalid parameters or user not eligible
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
  
  const { userId } = body;

  if (!userId || typeof userId !== 'string') {
    return jsonResponse({ error: "userId is required and must be a string" }, 400);
  }

  // ─── 2. Verify service role authentication ──────────────────────
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing required environment variables");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  // ─── 3. Create Supabase admin client ────────────────────────────
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const logger = new SystemLogger(supabaseAdmin, 'process-auto-topup');

  const auth = await authenticateRequest(req, supabaseAdmin, "[PROCESS-AUTO-TOPUP]");
  if (!auth.success) {
    return jsonResponse({ error: auth.error || "Authentication failed" }, auth.statusCode || 401);
  }
  if (!auth.isServiceRole) {
    return jsonResponse({ error: "Unauthorized - service role required" }, 403);
  }

  try {
    // ─── 4. Get user auto-top-up settings ───────────────────────────
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        credits,
        auto_topup_enabled,
        auto_topup_amount,
        auto_topup_threshold,
        auto_topup_last_triggered,
        stripe_customer_id,
        stripe_payment_method_id,
        email
      `)
      .eq('id', userId)
      .single();

    if (userError || !user) {
      logger.error('User not found', { user_id: userId, error: userError?.message });
      await logger.flush();
      return jsonResponse({ error: 'User not found' }, 400);
    }

    // ─── 5. Validate eligibility ────────────────────────────────────
    if (!user.auto_topup_enabled) {
      return jsonResponse({ error: 'Auto-top-up not enabled for user' }, 400);
    }

    if (!user.stripe_customer_id || !user.stripe_payment_method_id) {
      return jsonResponse({ error: 'Payment method not configured' }, 400);
    }

    if (!user.auto_topup_amount || !user.auto_topup_threshold) {
      return jsonResponse({ error: 'Auto-top-up amounts not configured' }, 400);
    }

    // Check if balance is still above threshold (may have changed since trigger)
    if (user.credits > user.auto_topup_threshold) {
      return jsonResponse({ 
        message: 'Balance above threshold, auto-top-up not needed',
        currentBalance: user.credits,
        threshold: user.auto_topup_threshold
      });
    }

    // ─── 5b. Atomic rate-limit claim ──────────────────────────────────
    // Prevents two concurrent triggers from both processing a payment.
    // UPDATE only succeeds if auto_topup_last_triggered is NULL or older than 1 hour.
    // Uses .or() so exactly one concurrent caller wins the row.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: claimRow, error: claimError } = await supabaseAdmin
      .from('users')
      .update({ auto_topup_last_triggered: new Date().toISOString() })
      .eq('id', userId)
      .or(`auto_topup_last_triggered.is.null,auto_topup_last_triggered.lt.${oneHourAgo}`)
      .select('id')
      .single();

    if (claimError || !claimRow) {
      logger.info('Auto-top-up skipped: already claimed by concurrent process or rate limited', {
        user_id: userId,
        lastTriggered: user.auto_topup_last_triggered,
        claimError: claimError?.message,
      });
      await logger.flush();
      return jsonResponse({
        error: 'Auto-top-up rate limited - too soon since last trigger or already being processed',
        lastTriggered: user.auto_topup_last_triggered
      }, 400);
    }

    // ─── 6. Initialize Stripe and create Payment Intent ─────────────
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      logger.error("Missing Stripe configuration");
      await logger.flush();
      return jsonResponse({ error: "Stripe not configured" }, 500);
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
    });

    // Create off-session payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: user.auto_topup_amount, // Already in cents
      currency: "usd",
      customer: user.stripe_customer_id,
      payment_method: user.stripe_payment_method_id,
      confirmation_method: "automatic",
      confirm: true,
      off_session: true, // This indicates it's an automatic payment
      metadata: {
        userId: user.id,
        autoTopup: "true",
        originalBalance: user.credits.toString(),
        topupAmount: user.auto_topup_amount.toString(),
      },
      description: `Auto-top-up: $${(user.auto_topup_amount / 100).toFixed(2)} credits for ${user.email}`,
    });

    // ─── 7. Handle payment result ───────────────────────────────────
    if (paymentIntent.status === 'succeeded') {
      // Insert successful auto-top-up into ledger
      const { error: ledgerError } = await supabaseAdmin
        .from('credits_ledger')
        .insert({
          user_id: userId,
          amount: user.auto_topup_amount,
          type: 'auto_topup',
          metadata: {
            stripe_payment_intent_id: paymentIntent.id,
            amount_paid: paymentIntent.amount_received,
            currency: paymentIntent.currency,
            dollar_amount: user.auto_topup_amount / 100,
            original_balance: user.credits,
            auto_topup_trigger: true,
          },
        });

      if (ledgerError) {
        logger.error('Error creating auto-top-up ledger entry', { error: ledgerError.message, user_id: userId });
        await logger.flush();
        // Payment succeeded but ledger failed - this is critical
        return jsonResponse({ error: 'Payment succeeded but failed to update credits' }, 500);
      }

      logger.info('Auto-top-up succeeded', {
        user_id: userId,
        paymentIntentId: paymentIntent.id,
        amount: user.auto_topup_amount,
        originalBalance: user.credits,
      });

      await logger.flush();
      return jsonResponse({
        success: true,
        paymentIntentId: paymentIntent.id,
        amount: user.auto_topup_amount,
        dollarAmount: user.auto_topup_amount / 100,
        originalBalance: user.credits,
        message: `Auto-topped up $${(user.auto_topup_amount / 100).toFixed(2)}`
      });

    } else {
      // Payment failed
      logger.error('Auto-top-up payment failed', {
        user_id: userId,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        lastPaymentError: paymentIntent.last_payment_error,
      });

      // Consider disabling auto-top-up on certain failure types
      if (paymentIntent.last_payment_error?.code === 'card_declined' ||
          paymentIntent.last_payment_error?.code === 'expired_card') {
        
        // Disable auto-top-up to prevent repeated failures
        await supabaseAdmin
          .from('users')
          .update({ auto_topup_enabled: false })
          .eq('id', userId);

        logger.info(`Auto-top-up disabled for user due to payment failure`, { user_id: userId });
      }

      await logger.flush();
      return jsonResponse({
        error: 'Auto-top-up payment failed',
        paymentIntentId: paymentIntent.id,
        failureCode: paymentIntent.last_payment_error?.code,
        failureMessage: paymentIntent.last_payment_error?.message,
      }, 400);
    }

  } catch (error) {
    logger.error('Error in process-auto-topup', { error: error.message });
    
    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return jsonResponse({
        error: 'Card error during auto-top-up',
        code: error.code,
        message: error.message,
      }, 400);
    }

    await logger.flush();
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
