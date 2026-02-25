import Stripe from "https://esm.sh/stripe@14.21.0";

export const AUTO_TOPUP_MIN_AMOUNT_USD = 5;
export const AUTO_TOPUP_MAX_AMOUNT_USD = 100;
export const AUTO_TOPUP_MIN_THRESHOLD_USD = 1;
const STRIPE_API_VERSION = "2024-06-20";

interface AutoTopupConfigFailure {
  envKey: "STRIPE_SECRET_KEY_MISSING" | "FRONTEND_URL_MISSING";
  userMessage: string;
  logMessage: string;
}

const AUTO_TOPUP_CONFIG_FAILURES: Record<AutoTopupConfigFailure["envKey"], AutoTopupConfigFailure> = {
  STRIPE_SECRET_KEY_MISSING: {
    envKey: "STRIPE_SECRET_KEY_MISSING",
    userMessage: "Stripe not configured",
    logMessage: "Missing Stripe configuration",
  },
  FRONTEND_URL_MISSING: {
    envKey: "FRONTEND_URL_MISSING",
    userMessage: "Frontend URL not configured",
    logMessage: "FRONTEND_URL not set in environment",
  },
};

export interface AutoTopupValidationInput {
  autoTopupEnabled: boolean;
  autoTopupAmount?: unknown;
  autoTopupThreshold?: unknown;
}

export function validateCreditPurchaseAmount(amount: unknown): string | null {
  if (
    typeof amount !== 'number'
    || Number.isNaN(amount)
    || amount < AUTO_TOPUP_MIN_AMOUNT_USD
    || amount > AUTO_TOPUP_MAX_AMOUNT_USD
  ) {
    return `Amount must be a number between $${AUTO_TOPUP_MIN_AMOUNT_USD} and $${AUTO_TOPUP_MAX_AMOUNT_USD}`;
  }
  return null;
}

export function validateAutoTopupConfig(input: AutoTopupValidationInput): string | null {
  const { autoTopupEnabled, autoTopupAmount, autoTopupThreshold } = input;
  if (!autoTopupEnabled) {
    return null;
  }

  if (
    typeof autoTopupAmount !== 'number'
    || Number.isNaN(autoTopupAmount)
    || autoTopupAmount < AUTO_TOPUP_MIN_AMOUNT_USD
    || autoTopupAmount > AUTO_TOPUP_MAX_AMOUNT_USD
  ) {
    return `autoTopupAmount must be a number between $${AUTO_TOPUP_MIN_AMOUNT_USD} and $${AUTO_TOPUP_MAX_AMOUNT_USD}`;
  }

  if (
    typeof autoTopupThreshold !== 'number'
    || Number.isNaN(autoTopupThreshold)
    || autoTopupThreshold < AUTO_TOPUP_MIN_THRESHOLD_USD
  ) {
    return 'autoTopupThreshold must be a positive number';
  }

  if (autoTopupThreshold >= autoTopupAmount) {
    return 'autoTopupThreshold must be less than autoTopupAmount';
  }

  return null;
}

export function dollarsToCents(amountUsd: number): number {
  return Math.round(amountUsd * 100);
}

export function validatePersistedAutoTopupConfig(
  autoTopupAmountCents: unknown,
  autoTopupThresholdCents: unknown,
): string | null {
  if (
    typeof autoTopupAmountCents !== "number"
    || Number.isNaN(autoTopupAmountCents)
    || autoTopupAmountCents <= 0
  ) {
    return "Auto-top-up amount is not configured correctly";
  }

  if (
    typeof autoTopupThresholdCents !== "number"
    || Number.isNaN(autoTopupThresholdCents)
    || autoTopupThresholdCents <= 0
  ) {
    return "Auto-top-up threshold is not configured correctly";
  }

  if (autoTopupThresholdCents >= autoTopupAmountCents) {
    return "Auto-top-up threshold must be less than auto-top-up amount";
  }

  return null;
}

export function requireStripeSecretKey(): string {
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY_MISSING');
  }
  return stripeSecretKey;
}

export function requireFrontendUrl(): string {
  const frontendUrl = Deno.env.get('FRONTEND_URL');
  if (!frontendUrl) {
    throw new Error('FRONTEND_URL_MISSING');
  }
  return frontendUrl;
}

export function createStripeClient(): Stripe {
  return new Stripe(requireStripeSecretKey(), {
    apiVersion: STRIPE_API_VERSION,
  });
}

export function getAutoTopupConfigFailure(error: unknown): AutoTopupConfigFailure | null {
  if (!(error instanceof Error)) {
    return null;
  }
  if (error.message === "STRIPE_SECRET_KEY_MISSING") {
    return AUTO_TOPUP_CONFIG_FAILURES.STRIPE_SECRET_KEY_MISSING;
  }
  if (error.message === "FRONTEND_URL_MISSING") {
    return AUTO_TOPUP_CONFIG_FAILURES.FRONTEND_URL_MISSING;
  }
  return null;
}
