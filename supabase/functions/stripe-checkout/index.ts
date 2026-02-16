import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "../_shared/rateLimit.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { SystemLogger } from "../_shared/systemLogger.ts";

// Helper for standard JSON responses with CORS headers
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

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
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
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
  
  const { amount, autoTopupEnabled, autoTopupAmount, autoTopupThreshold } = body;
  if (!amount || typeof amount !== 'number' || amount < 5 || amount > 100) {
    return jsonResponse({ error: "Amount must be a number between $5 and $100" }, 400);
  }

  // Validate auto-top-up parameters if provided
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
  const logger = new SystemLogger(supabaseAdmin, 'stripe-checkout');

  const auth = await authenticateRequest(req, supabaseAdmin, "[STRIPE-CHECKOUT]", { allowJwtUserAuth: true });
  if (!auth.success || !auth.userId) {
    return jsonResponse({ error: auth.error || "Authentication failed" }, auth.statusCode || 401);
  }

  // ─── 3. Rate limit check ──────────────────────────────────────────
  const rateLimitResult = await checkRateLimit(
    supabaseAdmin,
    'stripe-checkout',
    auth.userId,
    RATE_LIMITS.expensive,
    '[STRIPE-CHECKOUT]'
  );
  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult, RATE_LIMITS.expensive);
  }

  try {
    // ─── 5. Initialize Stripe and create checkout session ─────────────────────────
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const frontendUrl = Deno.env.get("FRONTEND_URL");
    
    if (!stripeSecretKey) {
      logger.error("Missing Stripe configuration");
      await logger.flush();
      return jsonResponse({ error: "Stripe not configured" }, 500);
    }

    if (!frontendUrl) {
      logger.error("FRONTEND_URL not set in environment");
      await logger.flush();
      return jsonResponse({ error: "Frontend URL not configured" }, 500);
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
    });

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
            unit_amount: amount * 100, // Convert dollars to cents
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
      sessionConfig.customer_creation = "if_required";
      sessionConfig.payment_intent_data = {
        setup_future_usage: "off_session"
      };
      sessionConfig.metadata.autoTopupAmount = autoTopupAmount.toString();
      sessionConfig.metadata.autoTopupThreshold = autoTopupThreshold.toString();
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
    logger.error('Error creating Stripe checkout session', { error: error.message });
    await logger.flush();
    return jsonResponse({ error: `Internal server error: ${error.message}` }, 500);
  }
}); 
