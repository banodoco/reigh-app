import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  checkRateLimit,
  isRateLimitExceededFailure,
  rateLimitFailureResponse,
  RATE_LIMITS,
} from "../_shared/rateLimit.ts";
import { bootstrapEdgeHandler } from "../_shared/edgeHandler.ts";
import { jsonResponse } from "../_shared/http.ts";
import {
  createStripeClient,
  dollarsToCents,
  getAutoTopupConfigFailure,
  requireFrontendUrl,
  validateAutoTopupConfig,
  validateCreditPurchaseAmount,
} from "../_shared/autoTopupDomain.ts";

/**
 * Edge function: stripe-checkout
 * 
 * Creates a Stripe checkout session for credit purchases
 * 
 * POST /functions/v1/stripe-checkout
 * Headers: Authorization: Bearer <JWT>
 * Body: { 
 *   amount: number, // Dollar amount
 *   autoTopupEnabled?: boolean,
 *   autoTopupAmount?: number, // Dollar amount for auto-top-up
 *   autoTopupThreshold?: number // Dollar amount threshold
 * }
 * 
 * Returns:
 * - 200 OK with checkout URL
 * - 400 Bad Request if invalid amount
 * - 401 Unauthorized if no valid token
 * - 500 Internal Server Error
 */
serve(async (req) => {
  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "stripe-checkout",
    logPrefix: "[STRIPE-CHECKOUT]",
    parseBody: "strict",
    auth: {
      required: true,
      options: { allowJwtUserAuth: true },
    },
  });
  if (!bootstrap.ok) {
    return bootstrap.response;
  }

  const {
    supabaseAdmin,
    logger,
    body,
    auth,
  } = bootstrap.value;
  const amount = body.amount;
  const autoTopupEnabled = body.autoTopupEnabled === true;
  const autoTopupAmount = body.autoTopupAmount;
  const autoTopupThreshold = body.autoTopupThreshold;

  const amountValidationError = validateCreditPurchaseAmount(amount);
  if (amountValidationError) {
    return jsonResponse({ error: amountValidationError }, 400);
  }

  const autoTopupValidationError = validateAutoTopupConfig({
    autoTopupEnabled,
    autoTopupAmount,
    autoTopupThreshold,
  });
  if (autoTopupValidationError) {
    return jsonResponse({ error: autoTopupValidationError }, 400);
  }

  if (!auth?.userId) {
    return jsonResponse({ error: "Authentication failed" }, 401);
  }

  // ─── 3. Rate limit check ──────────────────────────────────────────
  const rateLimitResult = await checkRateLimit(
    supabaseAdmin,
    'stripe-checkout',
    auth.userId,
    RATE_LIMITS.expensive,
    '[STRIPE-CHECKOUT]'
  );
  if (!rateLimitResult.ok) {
    if (isRateLimitExceededFailure(rateLimitResult)) {
      return rateLimitFailureResponse(rateLimitResult, RATE_LIMITS.expensive);
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

  try {
    // ─── 5. Initialize Stripe and create checkout session ─────────────────────────
    const frontendUrl = requireFrontendUrl();
    const stripe = createStripeClient();

    // Look up user email for Stripe checkout pre-fill
    const { data: userData } = await supabaseAdmin.from('users').select('email').eq('id', auth.userId).single();

    // Prepare session configuration
    const sessionConfig: unknown = {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Reigh Credits",
              description: autoTopupEnabled
                ? `${amount} credits + auto-top-up enabled`
                : `${amount} credits for AI generation tasks`
            },
            unit_amount: dollarsToCents(amount), // Convert dollars to cents
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: auth.userId,
        amount: amount.toString(),
        autoTopupEnabled: autoTopupEnabled ? 'true' : 'false'
      },
      success_url: `${frontendUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/payments/cancel`,
      customer_email: userData?.email || undefined,
    };

    // If auto-top-up enabled, configure payment method saving
    if (autoTopupEnabled) {
      const normalizedAutoTopupAmount = autoTopupAmount as number;
      const normalizedAutoTopupThreshold = autoTopupThreshold as number;
      sessionConfig.customer_creation = "if_required";
      sessionConfig.payment_intent_data = {
        setup_future_usage: "off_session"
      };
      sessionConfig.metadata.autoTopupAmount = normalizedAutoTopupAmount.toString();
      sessionConfig.metadata.autoTopupThreshold = normalizedAutoTopupThreshold.toString();
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    logger.info('Stripe checkout session created', { user_id: auth.userId, amount, sessionId: session.id });

    await logger.flush();
    return jsonResponse({
      checkoutUrl: session.url,
      sessionId: session.id,
      amount,
      userId: auth.userId
    });

  } catch (error) {
    const configFailure = getAutoTopupConfigFailure(error);
    if (configFailure) {
      logger.error(configFailure.logMessage);
      await logger.flush();
      return jsonResponse({ error: configFailure.userMessage }, 500);
    }

    logger.error('Error creating Stripe checkout session', {
      error: error instanceof Error ? error.message : String(error),
    });
    await logger.flush();
    return jsonResponse({
      error: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
    }, 500);
  }
}); 
