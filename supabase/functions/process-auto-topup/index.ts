import { toErrorMessage } from "../_shared/errorMessage.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { bootstrapEdgeHandler, NO_SESSION_RUNTIME_OPTIONS } from "../_shared/edgeHandler.ts";
import { jsonResponse } from "../_shared/http.ts";
import { validatePersistedAutoTopupConfig } from "../_shared/autoTopupDomain.ts";
import { ensureStripeClient } from "../_shared/autoTopupRequest.ts";
import { ensureServiceRoleAuth } from "../_shared/requestGuards.ts";

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
  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "process-auto-topup",
    logPrefix: "[PROCESS-AUTO-TOPUP]",
    parseBody: "strict",
    auth: {
      required: true,
      requireServiceRole: true,
    },
    ...NO_SESSION_RUNTIME_OPTIONS,
  });
  if (!bootstrap.ok) {
    return bootstrap.response;
  }

  const { supabaseAdmin, logger, body, auth } = bootstrap.value;
  const authResult = ensureServiceRoleAuth(auth, logger);
  if (!authResult.ok) {
    await logger.flush();
    return authResult.response;
  }

  const userId = typeof body.userId === "string" ? body.userId : null;

  if (!userId) {
    return jsonResponse({ error: "userId is required and must be a string" }, 400);
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

    const autoTopupConfigError = validatePersistedAutoTopupConfig(
      user.auto_topup_amount,
      user.auto_topup_threshold,
    );
    if (!autoTopupConfigError.ok) {
      return jsonResponse({ error: autoTopupConfigError.error.message }, 400);
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
    const stripeResult = await ensureStripeClient(logger);
    if (!stripeResult.ok) {
      return stripeResult.response;
    }
    const stripe = stripeResult.stripe;

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

  } catch (error: unknown) {
    const errorMessage = toErrorMessage(error);
    const stripeErrorType = (error as { type?: string } | null)?.type;
    logger.error('Error in process-auto-topup', { error: errorMessage });

    // Handle specific Stripe errors
    if (stripeErrorType === 'StripeCardError') {
      return jsonResponse({
        error: 'Card error during auto-top-up',
        code: (error as { code?: string } | null)?.code,
        message: errorMessage,
      }, 400);
    }

    await logger.flush();
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
