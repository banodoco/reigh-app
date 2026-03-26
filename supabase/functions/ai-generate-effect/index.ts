// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Groq from "npm:groq-sdk@0.26.0";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "../_shared/rateLimit.ts";
import { bootstrapEdgeHandler, NO_SESSION_RUNTIME_OPTIONS } from "../_shared/edgeHandler.ts";
import { jsonResponse } from "../_shared/http.ts";
import { toErrorMessage } from "../_shared/errorMessage.ts";
import {
  buildGenerateEffectMessages,
  extractEffectCode,
  type EffectCategory,
} from "./templates.ts";

const GROQ_MODEL = "moonshotai/kimi-k2-instruct-0905";
const GROQ_FALLBACK_MODEL = "llama-3.3-70b-versatile";
const GROQ_TIMEOUT_MS = 30_000;
const EFFECT_CATEGORIES: EffectCategory[] = ["entrance", "exit", "continuous"];

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (groqClient) {
    return groqClient;
  }

  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    throw new Error("[ai-generate-effect] Missing Groq provider configuration");
  }

  groqClient = new Groq({ apiKey, timeout: GROQ_TIMEOUT_MS });
  return groqClient;
}

interface GroqChatParams {
  model: string;
  messages: { role: string; content: string }[];
  temperature: number;
  max_tokens: number;
  top_p?: number;
}

function isEffectCategory(value: unknown): value is EffectCategory {
  return typeof value === "string" && EFFECT_CATEGORIES.includes(value as EffectCategory);
}

async function groqWithFallback(
  groq: Groq,
  params: GroqChatParams,
  logger: { info: (msg: string) => void },
) {
  try {
    return await groq.chat.completions.create(params as Parameters<typeof groq.chat.completions.create>[0]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isModelError = msg.includes("model") || msg.includes("timeout") || msg.includes("abort") || msg.includes("could not process");

    if (isModelError && params.model !== GROQ_FALLBACK_MODEL) {
      logger.info(`[AI-GENERATE-EFFECT] Primary model failed (${msg}), falling back to ${GROQ_FALLBACK_MODEL}`);
      return await groq.chat.completions.create({
        ...params,
        model: GROQ_FALLBACK_MODEL,
      } as Parameters<typeof groq.chat.completions.create>[0]);
    }

    throw err;
  }
}

serve(async (req) => {
  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "ai-generate-effect",
    logPrefix: "[AI-GENERATE-EFFECT]",
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

  const { supabaseAdmin, logger, auth, body } = bootstrap.value;
  if (!auth?.userId) {
    return jsonResponse({ error: "Authentication failed" }, 401);
  }

  const rateLimitDenied = await enforceRateLimit({
    supabaseAdmin,
    functionName: "ai-generate-effect",
    userId: auth.userId,
    config: RATE_LIMITS.expensive,
    logger,
    logPrefix: "[AI-GENERATE-EFFECT]",
    responses: {
      serviceUnavailable: () => jsonResponse({ error: "Rate limit service unavailable" }, 503),
    },
  });
  if (rateLimitDenied) {
    return rateLimitDenied;
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const category = body.category;
  const existingCode = typeof body.existingCode === "string" && body.existingCode.trim()
    ? body.existingCode
    : undefined;

  if (!prompt) {
    return jsonResponse({ error: "prompt is required" }, 400);
  }

  if (!isEffectCategory(category)) {
    return jsonResponse({ error: `category must be one of: ${EFFECT_CATEGORIES.join(", ")}` }, 400);
  }

  try {
    const groq = getGroqClient();
    const { systemMsg, userMsg } = buildGenerateEffectMessages({
      prompt,
      category,
      existingCode,
    });

    logger.info(`[AI-GENERATE-EFFECT] starting Groq call, model=${GROQ_MODEL}, category=${category}, editMode=${Boolean(existingCode)}`);
    const startedAt = Date.now();
    const response = await groqWithFallback(groq, {
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: userMsg },
      ],
      temperature: 0.4,
      max_tokens: 4096,
      top_p: 1,
    }, logger);
    logger.info(`[AI-GENERATE-EFFECT] Groq call completed in ${Date.now() - startedAt}ms, model=${response.model}`);

    const outputText = response.choices[0]?.message?.content?.trim() || "";
    const code = extractEffectCode(outputText);

    return jsonResponse({
      code,
      model: response.model || GROQ_MODEL,
    });
  } catch (err: unknown) {
    const message = toErrorMessage(err);
    console.error("[ai-generate-effect] Error generating effect:", message);
    return jsonResponse({ error: "Internal server error", details: message }, 500);
  }
});
