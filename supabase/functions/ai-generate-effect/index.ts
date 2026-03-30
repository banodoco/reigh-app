// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "../_shared/rateLimit.ts";
import { bootstrapEdgeHandler, NO_SESSION_RUNTIME_OPTIONS } from "../_shared/edgeHandler.ts";
import { jsonResponse } from "../_shared/http.ts";
import { toErrorMessage } from "../_shared/errorMessage.ts";
import {
  buildGenerateEffectMessages,
  extractEffectCodeAndMeta,
  type EffectCategory,
} from "./templates.ts";

// ── Models ───────────────────────────────────────────────────────────
// Create → Kimi K2.5 via Fireworks, Edit → Qwen via OpenRouter
const FIREWORKS_MODEL = "accounts/fireworks/models/kimi-k2p5";
const FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions";
const FIREWORKS_TIMEOUT_MS = 60_000;
const EDIT_MODEL = "qwen/qwen3.5-27b";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TIMEOUT_MS = 100_000;

const EFFECT_CATEGORIES: EffectCategory[] = ["entrance", "exit", "continuous"];

function isEffectCategory(value: unknown): value is EffectCategory {
  return typeof value === "string" && EFFECT_CATEGORIES.includes(value as EffectCategory);
}

// ── Response types ───────────────────────────────────────────────────

interface LLMResponse {
  content: string;
  model: string;
}

// ── Fireworks generation (create — Kimi K2.5) ───────────────────────

async function callFireworks(
  messages: Array<{ role: string; content: string }>,
  logger: { info: (msg: string) => void },
): Promise<LLMResponse> {
  const apiKey = Deno.env.get("FIREWORKS_API_KEY");
  if (!apiKey) throw new Error("[ai-generate-effect] Missing FIREWORKS_API_KEY");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FIREWORKS_TIMEOUT_MS);

  try {
    const startedAt = Date.now();
    logger.info(`[AI-GENERATE-EFFECT] Fireworks request: model=${FIREWORKS_MODEL}`);
    const response = await fetch(FIREWORKS_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        model: FIREWORKS_MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 4096,
        top_p: 1,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Fireworks ${response.status}: ${text.slice(0, 500)}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content?: string; role: string } }>;
      model?: string;
      usage?: Record<string, unknown>;
    };

    const content = (data.choices?.[0]?.message?.content ?? "").trim();
    logger.info(`[AI-GENERATE-EFFECT] Fireworks response in ${Date.now() - startedAt}ms, model=${data.model ?? FIREWORKS_MODEL}, length=${content.length}, usage=${JSON.stringify(data.usage ?? {})}`);
    return { content, model: data.model || FIREWORKS_MODEL };
  } finally {
    clearTimeout(timeout);
  }
}

// ── OpenRouter generation (edits) ───────────────────────────────────

interface OpenRouterMessage {
  content?: string;
  reasoning_content?: string;
  reasoning?: string;
  role: string;
}

async function callOpenRouter(
  model: string,
  messages: Array<{ role: string; content: string }>,
  logger: { info: (msg: string) => void },
): Promise<LLMResponse> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("[ai-generate-effect] Missing OPENROUTER_API_KEY");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    logger.info(`[AI-GENERATE-EFFECT] OpenRouter request: model=${model}`);
    const startedAt = Date.now();
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://reigh.app",
        "X-Title": "Reigh Effect Generator",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: 65536,
        top_p: 1,
        provider: {
          order: ["atlas-cloud/fp8"],
          allow_fallbacks: true,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 500)}`);
    }

    const data = await response.json() as {
      choices: Array<{
        message: OpenRouterMessage;
        finish_reason?: string;
        error?: { message?: string; code?: string };
      }>;
      model?: string;
      usage?: Record<string, unknown>;
      error?: { message?: string; code?: string };
    };

    // Log full response structure for debugging
    const choice = data.choices?.[0];
    const msg = choice?.message;
    const finishReason = choice?.finish_reason ?? 'unknown';
    const content = (msg?.content || msg?.reasoning_content || msg?.reasoning || "").trim();
    const responseError = data.error?.message || choice?.error?.message || null;

    logger.info(`[AI-GENERATE-EFFECT] OpenRouter response in ${Date.now() - startedAt}ms, model=${data.model ?? model}, finish_reason=${finishReason}, content=${Boolean(msg?.content)}, reasoning_content=${Boolean(msg?.reasoning_content)}, content_length=${content.length}, usage=${JSON.stringify(data.usage ?? {})}`);

    if (responseError) {
      logger.info(`[AI-GENERATE-EFFECT] OpenRouter error in response: ${responseError}`);
    }

    if (!content && msg) {
      // Log the full message object to understand why content is empty
      logger.info(`[AI-GENERATE-EFFECT] empty content — full message keys: ${Object.keys(msg).join(', ')}, full message: ${JSON.stringify(msg).slice(0, 500)}`);
    }

    if (finishReason === 'length') {
      logger.info(`[AI-GENERATE-EFFECT] WARNING: output truncated (finish_reason=length) — max_tokens may need increase`);
    }

    return { content, model: data.model || model };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Main handler ─────────────────────────────────────────────────────

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
  const effectName = typeof body.name === "string" ? body.name.trim() : "";
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

  const isEditMode = Boolean(existingCode);

  try {
    const { systemMsg, userMsg } = buildGenerateEffectMessages({
      prompt,
      name: effectName || undefined,
      category,
      existingCode,
    });
    const messages = [
      { role: "system", content: systemMsg },
      { role: "user", content: userMsg },
    ];

    let llmResponse: LLMResponse;

    if (isEditMode) {
      logger.info(`[AI-GENERATE-EFFECT] edit → ${EDIT_MODEL} (OpenRouter)`);
      await logger.flush();
      llmResponse = await callOpenRouter(EDIT_MODEL, messages, logger);
    } else {
      logger.info(`[AI-GENERATE-EFFECT] create → ${FIREWORKS_MODEL} (Fireworks)`);
      await logger.flush();
      llmResponse = await callFireworks(messages, logger);
    }

    logger.info(`[AI-GENERATE-EFFECT] raw output length=${llmResponse.content.length}, first 200 chars: ${llmResponse.content.slice(0, 200)}`);

    let extracted;
    try {
      extracted = extractEffectCodeAndMeta(llmResponse.content);
    } catch (parseErr: unknown) {
      const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      logger.info(`[AI-GENERATE-EFFECT] extraction/validation failed: ${parseMsg}`);
      logger.info(`[AI-GENERATE-EFFECT] full output: ${llmResponse.content.slice(0, 1000)}`);
      await logger.flush();
      return jsonResponse({ error: parseMsg, rawOutput: llmResponse.content.slice(0, 500) }, 422);
    }
    const { code, name: generatedName, description, parameterSchema } = extracted;

    await logger.flush();
    return jsonResponse({
      code,
      name: generatedName,
      description,
      parameterSchema,
      model: llmResponse.model,
    });
  } catch (err: unknown) {
    const message = toErrorMessage(err);
    console.error("[ai-generate-effect] Error generating effect:", message);
    logger.info(`[AI-GENERATE-EFFECT] error: ${message}`);
    await logger.flush();
    return jsonResponse({ error: "Internal server error", details: message }, 500);
  }
});
