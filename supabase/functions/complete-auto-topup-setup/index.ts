import { toErrorMessage } from "../_shared/errorMessage.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../_shared/http.ts";
import { bootstrapEdgeHandler, NO_SESSION_RUNTIME_OPTIONS } from "../_shared/edgeHandler.ts";
import { ensureStripeClient } from "../_shared/autoTopupRequest.ts";
import { ensureServiceRoleAuth } from "../_shared/requestGuards.ts";

interface CheckoutSessionMetadata {
  userId?: string;
  autoTopupEnabled?: string;
  autoTopupAmount?: string;
  autoTopupThreshold?: string;
}

/**
 * Edge function: complete-auto-topup-setup
 *
 * Completes auto-top-up setup by extracting payment method from checkout session
 * Called after successful checkout with auto-top-up enabled
 *
 * POST /functions/v1/complete-auto-topup-setup
 * Headers: Authorization: Bearer <service_role_key>
 * Body: { sessionId: string, expectedUserId?: string }
 *
 * Returns:
 * - 200 OK with payment method details
 * - 400 Bad Request if invalid parameters
 * - 500 Internal Server Error
 */
serve(async (req) => {
  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "complete-auto-topup-setup",
    logPrefix: "[COMPLETE-AUTO-TOPUP-SETUP]",
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
  
  const { sessionId, expectedUserId } = body;

  if (!sessionId) {
    return jsonResponse({ error: "sessionId is required" }, 400);
  }

  try {
    // ─── 4. Initialize Stripe ───────────────────────────────────────
    const stripeResult = await ensureStripeClient(logger);
    if (!stripeResult.ok) {
      return stripeResult.response;
    }
    const stripe = stripeResult.stripe;

    // ─── 5. Retrieve checkout session and payment intent ────────────
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'setup_intent']
    });
    const metadata = (session.metadata ?? {}) as CheckoutSessionMetadata;
    const userId = typeof metadata.userId === "string" ? metadata.userId : "";

    if (!userId) {
      return jsonResponse({ error: "Checkout session is missing user metadata" }, 400);
    }

    if (expectedUserId && expectedUserId !== userId) {
      logger.error("Checkout session user mismatch", {
        sessionId,
        expectedUserId,
        metadataUserId: userId,
      });
      await logger.flush();
      return jsonResponse({ error: "Checkout session does not belong to the expected user" }, 403);
    }

    if (!session.payment_intent) {
      return jsonResponse({ error: "No payment intent found in session" }, 400);
    }

    // Get the payment intent with payment method details
    const paymentIntent = await stripe.paymentIntents.retrieve(
      session.payment_intent as string,
      { expand: ['payment_method'] }
    );

    if (!paymentIntent.customer) {
      return jsonResponse({ error: "No customer associated with payment intent" }, 400);
    }

    if (!paymentIntent.payment_method) {
      return jsonResponse({ error: "No payment method found" }, 400);
    }

    const normalizedCustomerId =
      typeof paymentIntent.customer === "string"
        ? paymentIntent.customer
        : typeof session.customer === "string"
          ? session.customer
          : "";
    const autoTopupEnabled = metadata.autoTopupEnabled === "true";
    const autoTopupAmount =
      typeof metadata.autoTopupAmount === "string"
        ? Number.parseFloat(metadata.autoTopupAmount)
        : Number.NaN;
    const autoTopupThreshold =
      typeof metadata.autoTopupThreshold === "string"
        ? Number.parseFloat(metadata.autoTopupThreshold)
        : Number.NaN;

    if (!normalizedCustomerId) {
      return jsonResponse({ error: "No customer associated with checkout session" }, 400);
    }

    // ─── 6. Update user with complete Stripe information ─────────────
    const updateData: Record<string, unknown> = {
      stripe_customer_id: normalizedCustomerId,
      stripe_payment_method_id: paymentIntent.payment_method.id,
      auto_topup_setup_completed: true,
    };

    if (
      autoTopupEnabled
      && Number.isFinite(autoTopupAmount)
      && Number.isFinite(autoTopupThreshold)
    ) {
      updateData.auto_topup_enabled = true;
      updateData.auto_topup_amount = Math.round(autoTopupAmount * 100);
      updateData.auto_topup_threshold = Math.round(autoTopupThreshold * 100);
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update(updateData)
      .eq('id', userId);

    if (updateError) {
      logger.error('Error updating user with payment method', { error: updateError.message, user_id: userId });
      await logger.flush();
      return jsonResponse({ error: 'Failed to save payment method' }, 500);
    }

    logger.info('Auto-top-up setup completed', {
      user_id: userId,
      sessionId,
      customerId: normalizedCustomerId,
      paymentMethodId: paymentIntent.payment_method.id,
      paymentMethodType: paymentIntent.payment_method.type,
    });

    await logger.flush();
    return jsonResponse({
      success: true,
      userId,
      customerId: normalizedCustomerId,
      paymentMethodId: paymentIntent.payment_method.id,
      paymentMethodType: paymentIntent.payment_method.type,
      message: 'Auto-top-up setup completed successfully'
    });

  } catch (error: unknown) {
    const errorMessage = toErrorMessage(error);
    logger.error('Error in complete-auto-topup-setup', { error: errorMessage });
    
    // Handle specific Stripe errors
    const stripeErrorType = (error as { type?: string } | null)?.type;
    if (stripeErrorType === 'StripeInvalidRequestError') {
      return jsonResponse({
        error: 'Invalid Stripe request',
        message: errorMessage,
      }, 400);
    }

    await logger.flush();
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
