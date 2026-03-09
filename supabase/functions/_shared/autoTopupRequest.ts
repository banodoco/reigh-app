import { createStripeClient } from "./autoTopupDomain.ts";
import { jsonResponse } from "./http.ts";

interface AutoTopupLogger {
  error: (message: string, context?: Record<string, unknown>) => void;
  flush: () => Promise<void>;
}

export async function ensureStripeClient(logger: AutoTopupLogger): Promise<
  | { ok: true; stripe: ReturnType<typeof createStripeClient> extends { ok: true; value: infer T } ? T : never }
  | { ok: false; response: Response }
> {
  const stripeResult = createStripeClient();
  if (!stripeResult.ok) {
    logger.error(stripeResult.error.logMessage);
    await logger.flush();
    return { ok: false, response: jsonResponse({ error: stripeResult.error.message }, 500) };
  }

  return { ok: true, stripe: stripeResult.value };
}
