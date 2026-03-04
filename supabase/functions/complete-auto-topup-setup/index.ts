import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../_shared/http.ts";
import { bootstrapEdgeHandler, NO_SESSION_RUNTIME_OPTIONS } from "../_shared/edgeHandler.ts";
import { createStripeClient, handleAutoTopupConfigError } from "../_shared/autoTopupDomain.ts";

/**
 * Edge function: complete-auto-topup-setup
 * 
 * Completes auto-top-up setup by extracting payment method from checkout session
 * Called after successful checkout with auto-top-up enabled
 * 
 * POST /functions/v1/complete-auto-topup-setup
 * Headers: Authorization: Bearer <service_role_key>
 * Body: { sessionId: string, userId: string }
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
  if (!auth?.isServiceRole) {
    logger.error("Authentication failed");
    await logger.flush();
    return jsonResponse({ error: "Authentication failed" }, 401);
  }
  
  const { sessionId, userId } = body;

  if (!sessionId || !userId) {
    return jsonResponse({ error: "sessionId and userId are required" }, 400);
  }

  try {
    // ─── 4. Initialize Stripe ───────────────────────────────────────
    const stripe = createStripeClient();

    // ─── 5. Retrieve checkout session and payment intent ────────────
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'setup_intent']
    });

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

    // ─── 6. Update user with complete Stripe information ─────────────
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        stripe_customer_id: paymentIntent.customer as string,
        stripe_payment_method_id: paymentIntent.payment_method.id,
      })
      .eq('id', userId);

    if (updateError) {
      logger.error('Error updating user with payment method', { error: updateError.message, user_id: userId });
      await logger.flush();
      return jsonResponse({ error: 'Failed to save payment method' }, 500);
    }

    logger.info('Auto-top-up setup completed', {
      user_id: userId,
      sessionId,
      customerId: paymentIntent.customer,
      paymentMethodId: paymentIntent.payment_method.id,
      paymentMethodType: paymentIntent.payment_method.type,
    });

    await logger.flush();
    return jsonResponse({
      success: true,
      customerId: paymentIntent.customer,
      paymentMethodId: paymentIntent.payment_method.id,
      paymentMethodType: paymentIntent.payment_method.type,
      message: 'Auto-top-up setup completed successfully'
    });

  } catch (error: unknown) {
    const configResponse = await handleAutoTopupConfigError(error, logger);
    if (configResponse) return configResponse;
    const errorMessage = error instanceof Error ? error.message : String(error);
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
