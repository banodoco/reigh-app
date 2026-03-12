/* eslint-disable */
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { bootstrapEdgeHandler, NO_SESSION_RUNTIME_OPTIONS } from "../_shared/edgeHandler.ts";
import { ensureStripeClient } from "../_shared/autoTopupRequest.ts";

/** Stripe event shape (minimal — covers what this webhook uses) */
interface StripeEvent {
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

/** Checkout session metadata we attach at checkout creation */
interface CheckoutSessionMetadata {
  userId?: string;
  amount?: string;
  autoTopupEnabled?: string;
  autoTopupAmount?: string;
  autoTopupThreshold?: string;
}

/** Payment intent metadata for auto-top-up flows */
interface PaymentIntentMetadata {
  autoTopup?: string;
  userId?: string;
  originalBalance?: string;
  topupAmount?: string;
}

interface StripeLogger {
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
  flush: () => Promise<void>;
}

interface SupabaseAdminLike {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => { eq: (column: string, value: string) => Promise<{ error: { message: string } | null }> };
  };
}

async function applyVerifiedAutoTopupSetup({
  supabaseAdmin,
  logger,
  session,
  userId,
  autoTopupAmount,
  autoTopupThreshold,
}: {
  supabaseAdmin: SupabaseAdminLike;
  logger: StripeLogger;
  session: Record<string, unknown>;
  userId: string;
  autoTopupAmount: string;
  autoTopupThreshold: string;
}): Promise<void> {
  const stripeResult = await ensureStripeClient(logger);
  if (!stripeResult.ok) {
    return;
  }

  const stripe = stripeResult.stripe;
  const checkoutSessionId = typeof session.id === "string" ? session.id : "";
  const checkoutSession = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
    expand: ["payment_intent.payment_method"],
  });

  if (!checkoutSession.payment_intent || typeof checkoutSession.payment_intent === "string") {
    logger.error("Checkout session missing expanded payment intent", {
      sessionId: checkoutSessionId,
      userId,
    });
    return;
  }

  const paymentIntent = checkoutSession.payment_intent;
  const paymentMethod = paymentIntent.payment_method;
  const customerId =
    typeof paymentIntent.customer === "string"
      ? paymentIntent.customer
      : typeof checkoutSession.customer === "string"
        ? checkoutSession.customer
        : "";

  if (!paymentMethod || typeof paymentMethod === "string" || !customerId) {
    logger.error("Verified auto-topup setup missing Stripe payment identifiers", {
      sessionId: checkoutSessionId,
      userId,
      hasPaymentMethod: Boolean(paymentMethod),
      hasCustomerId: Boolean(customerId),
    });
    return;
  }

  const { error: autoTopupError } = await supabaseAdmin
    .from('users')
    .update({
      auto_topup_enabled: true,
      auto_topup_setup_completed: true,
      auto_topup_amount: Math.round(parseFloat(autoTopupAmount) * 100),
      auto_topup_threshold: Math.round(parseFloat(autoTopupThreshold) * 100),
      stripe_customer_id: customerId,
      stripe_payment_method_id: paymentMethod.id,
    })
    .eq('id', userId);

  if (autoTopupError) {
    logger.error('Error setting up auto-top-up', { error: autoTopupError.message, user_id: userId });
    return;
  }

  logger.info('Auto-top-up enabled for user', {
    user_id: userId,
    autoTopupAmount: parseFloat(autoTopupAmount),
    autoTopupThreshold: parseFloat(autoTopupThreshold),
    customerId,
    paymentMethodId: paymentMethod.id,
  });
}

// Helper for standard JSON responses with CORS headers
function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
    },
  });
}

// Verify Stripe webhook signature
async function verifyStripeSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const elements = signature.split(',');
  const timestamp = elements.find(element => element.startsWith('t='))?.split('=')[1];
  const signatures = elements.filter(element => element.startsWith('v1='));

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const payloadForSigning = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature_bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadForSigning));
  const signature_hex = Array.from(new Uint8Array(signature_bytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return signatures.some(sig => sig.split('=')[1] === signature_hex);
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "stripe-webhook",
    logPrefix: "[stripe-webhook]",
    method: "POST",
    parseBody: "none",
    corsPreflight: false,
    auth: {
      required: false,
    },
    ...NO_SESSION_RUNTIME_OPTIONS,
  });
  if (!bootstrap.ok) {
    return bootstrap.response;
  }

  const { supabaseAdmin, logger } = bootstrap.value;
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const hasServiceRoleAuth = !!serviceRoleKey && !!bearerToken && bearerToken === serviceRoleKey;
  const hasStripeSignatureAuth = Boolean(req.headers.get('stripe-signature'));

  // Accept either service-role authorization (internal calls) or Stripe signature auth.
  if (!hasServiceRoleAuth && !hasStripeSignatureAuth) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return jsonResponse({ error: 'Missing stripe-signature header' }, 400);
    }

    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      logger.error('Missing webhook configuration');
      await logger.flush();
      return jsonResponse({ error: 'Webhook secret not configured' }, 500);
    }

    // Verify the webhook signature
    const isValid = await verifyStripeSignature(body, signature, webhookSecret);
    if (!isValid) {
      logger.error('Invalid webhook signature');
      await logger.flush();
      return jsonResponse({ error: 'Invalid signature' }, 401);
    }

    const event = JSON.parse(body) as StripeEvent;
    logger.info('Received Stripe event', { eventType: event.type });

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;

        // Extract metadata from the session
        const { userId, amount, autoTopupEnabled, autoTopupAmount, autoTopupThreshold } =
          (session.metadata ?? {}) as CheckoutSessionMetadata;

        if (!userId || !amount) {
          logger.error('Missing required metadata in checkout session', { metadata: session.metadata as Record<string, unknown> });
          return jsonResponse({ error: 'Missing required metadata' }, 400);
        }

        // Validate amount matches what was paid
        const dollarAmount = parseFloat(amount);
        const expectedCents = dollarAmount * 100;

        if (session.amount_total !== expectedCents) {
          logger.error('Amount mismatch', { expectedCents, actualCents: session.amount_total as number });
          return jsonResponse({ error: 'Amount mismatch' }, 400);
        }

        // Handle auto-top-up setup if enabled
        if (autoTopupEnabled === 'true' && autoTopupAmount && autoTopupThreshold) {
          try {
            await applyVerifiedAutoTopupSetup({
              supabaseAdmin,
              logger,
              session,
              userId,
              autoTopupAmount,
              autoTopupThreshold,
            });
          } catch (error: unknown) {
            logger.error('Error processing auto-top-up setup', { error: error instanceof Error ? error.message : String(error) });
          }
        }

        // Fast-path idempotency check: skip processing if already recorded.
        // This is an optimization — the unique partial index on
        // (metadata->>'stripe_session_id') WHERE type = 'stripe' is the
        // actual atomicity guarantee (see migration 20260130220000).
        try {
          const { data: existingEntry, error: checkError } = await supabaseAdmin
            .from('credits_ledger')
            .select('id')
            .eq('type', 'stripe')
            .eq('metadata->>stripe_session_id', session.id)
            .limit(1)
            .maybeSingle();

          if (checkError) {
            logger.warn('Idempotency check query failed, proceeding with insert', { error: checkError.message });
          } else if (existingEntry) {
            logger.info('Webhook already processed (idempotency check)', { sessionId: session.id as string });
            return jsonResponse({ received: true, duplicate: true });
          }
        } catch (checkErr: unknown) {
          logger.warn('Idempotency check exception, proceeding with insert', { error: String(checkErr) });
        }

        // Insert budget purchase into ledger.
        // The unique partial index guarantees no double-crediting even if two
        // webhooks race past the fast-path check above.
        const { data: ledgerEntry, error: ledgerError } = await supabaseAdmin
          .from('credits_ledger')
          .insert({
            user_id: userId,
            amount: session.amount_total, // Amount in cents
            type: 'stripe',
            metadata: {
              stripe_session_id: session.id,
              amount_paid: session.amount_total,
              currency: session.currency,
              dollar_amount: dollarAmount,
              auto_topup_enabled: autoTopupEnabled === 'true',
            },
          })
          .select()
          .single();

        if (ledgerError) {
          // Unique constraint violation = duplicate webhook (race with fast-path check).
          // This is expected and safe — return success since the credit was already applied.
          if (ledgerError.code === '23505') {
            logger.info('Webhook duplicate detected via unique constraint', { sessionId: session.id as string });
            return jsonResponse({ received: true, duplicate: true });
          }
          logger.error('Error creating budget ledger entry', { error: ledgerError.message });
          return jsonResponse({ error: 'Failed to create budget ledger entry' }, 500);
        }

        logger.info('Successfully processed budget purchase', {
          user_id: userId,
          amountCents: session.amount_total as number,
          dollarAmount,
          sessionId: session.id as string,
          autoTopupEnabled: autoTopupEnabled === 'true',
        });

        break;

      case 'payment_intent.succeeded':
        // Handle successful auto-top-up payments
        const paymentIntent = event.data.object;
        const metadata = (paymentIntent.metadata ?? {}) as PaymentIntentMetadata;

        if (metadata.autoTopup === 'true') {
          const { userId, originalBalance, topupAmount } = metadata;

          if (userId && topupAmount) {
            // Fast-path idempotency check: skip processing if already recorded.
            // The unique partial index on (metadata->>'stripe_payment_intent_id')
            // WHERE type = 'auto_topup' is the actual atomicity guarantee
            // (see migration 20260130220000).
            let skipInsert = false;
            try {
              const { data: existingAutoTopup, error: checkError } = await supabaseAdmin
                .from('credits_ledger')
                .select('id')
                .eq('type', 'auto_topup')
                .eq('metadata->>stripe_payment_intent_id', paymentIntent.id)
                .limit(1)
                .maybeSingle();

              if (checkError) {
                logger.warn('Auto-topup idempotency check failed, proceeding with insert', { error: checkError.message });
              } else if (existingAutoTopup) {
                logger.info('Auto-topup webhook already processed (idempotency check)', { paymentIntentId: paymentIntent.id as string });
                skipInsert = true;
              }
            } catch (checkErr: unknown) {
              logger.warn('Auto-topup idempotency check exception, proceeding with insert', { error: String(checkErr) });
            }

            if (skipInsert) {
              break;
            }

            // Insert auto-top-up credit into ledger.
            // The unique partial index guarantees no double-crediting even if two
            // webhooks race past the fast-path check above.
            const { error: autoTopupLedgerError } = await supabaseAdmin
              .from('credits_ledger')
              .insert({
                user_id: userId,
                amount: parseInt(topupAmount), // Already in cents
                type: 'auto_topup',
                metadata: {
                  stripe_payment_intent_id: paymentIntent.id,
                  amount_paid: paymentIntent.amount_received,
                  currency: paymentIntent.currency,
                  dollar_amount: parseInt(topupAmount) / 100,
                  original_balance: parseInt(originalBalance || '0'),
                  auto_topup_trigger: true,
                },
              });

            if (autoTopupLedgerError) {
              // Unique constraint violation = duplicate webhook (race with fast-path check).
              // This is expected and safe — return success since the credit was already applied.
              if (autoTopupLedgerError.code === '23505') {
                logger.info('Auto-topup duplicate detected via unique constraint', { paymentIntentId: paymentIntent.id as string });
                break;
              }
              logger.error('Error creating auto-top-up ledger entry', { error: autoTopupLedgerError.message });
            } else {
              logger.info('Auto-top-up payment processed', {
                user_id: userId,
                paymentIntentId: paymentIntent.id as string,
                topupAmount: parseInt(topupAmount),
                dollarAmount: parseInt(topupAmount) / 100,
              });
            }
          }
        }
        break;

      case 'payment_intent.payment_failed':
        // Handle failed auto-top-up payments
        const failedPaymentIntent = event.data.object;
        const failedMetadata = (failedPaymentIntent.metadata ?? {}) as PaymentIntentMetadata;

        if (failedMetadata.autoTopup === 'true') {
          const { userId } = failedMetadata;

          if (userId) {
            const lastPaymentError = failedPaymentIntent.last_payment_error as Record<string, unknown> | undefined;
            logger.error('Auto-top-up payment failed', {
              user_id: userId,
              paymentIntentId: failedPaymentIntent.id as string,
              errorCode: lastPaymentError?.code as string,
              errorMessage: lastPaymentError?.message as string,
            });

            // On certain failure types, disable auto-top-up to prevent repeated failures
            const errorCode = lastPaymentError?.code as string | undefined;
            if (errorCode === 'card_declined' || errorCode === 'expired_card') {
              const { error: disableError } = await supabaseAdmin
                .from('users')
                .update({ auto_topup_enabled: false })
                .eq('id', userId);

              if (disableError) {
                logger.error('Error disabling auto-top-up after payment failure', { error: disableError.message, user_id: userId });
              } else {
                logger.info('Auto-top-up disabled for user due to payment failure', { user_id: userId, errorCode });
              }
            }
          }
        }
        break;

      case 'invoice.payment_succeeded':
        // Handle recurring subscription payments if needed in the future
        logger.info('Invoice payment succeeded (not implemented yet)');
        break;

      case 'invoice.payment_failed':
        // Handle failed payments if needed
        logger.info('Invoice payment failed (not implemented yet)');
        break;

      default:
        logger.info('Unhandled event type', { eventType: event.type });
        break;
    }

    await logger.flush();
    return jsonResponse({ received: true });

  } catch (error: unknown) {
    logger.error('Error processing Stripe webhook', { error: error instanceof Error ? error.message : String(error) });
    await logger.flush();
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
