import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../_shared/http.ts";
import { bootstrapEdgeHandler, NO_SESSION_RUNTIME_OPTIONS } from "../_shared/edgeHandler.ts";
import { dollarsToCents, validateAutoTopupConfig } from "../_shared/autoTopupDomain.ts";

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
  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "setup-auto-topup",
    logPrefix: "[SETUP-AUTO-TOPUP]",
    parseBody: "strict",
    auth: {
      required: true,
      options: { allowJwtUserAuth: true },
    },
    ...NO_SESSION_RUNTIME_OPTIONS,
  });
  if (!bootstrap.ok) {
    return bootstrap.response;
  }

  const { supabaseAdmin, logger, body, auth } = bootstrap.value;
  
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

  const autoTopupValidationError = validateAutoTopupConfig({
    autoTopupEnabled,
    autoTopupAmount,
    autoTopupThreshold,
  });
  if (autoTopupValidationError) {
    return jsonResponse({ error: autoTopupValidationError }, 400);
  }

  // ─── 2. Authenticate request ────────────────────────────────────
  if (!auth?.userId) {
    return jsonResponse({ error: "Authentication failed" }, 401);
  }

  try {
    // ─── 3. Update user auto-top-up preferences ─────────────────────
    const updateData: Record<string, unknown> = {
      auto_topup_enabled: autoTopupEnabled,
    };

    if (autoTopupEnabled) {
      const normalizedAutoTopupAmount = autoTopupAmount as number;
      const normalizedAutoTopupThreshold = autoTopupThreshold as number;
      updateData.auto_topup_amount = dollarsToCents(normalizedAutoTopupAmount);
      updateData.auto_topup_threshold = dollarsToCents(normalizedAutoTopupThreshold);
      
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

  } catch (error: unknown) {
    logger.error('Error in setup-auto-topup', {
      error: error instanceof Error ? error.message : String(error),
    });
    await logger.flush();
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
