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

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CREATE_MODEL = "moonshotai/kimi-k2.5";
const EDIT_MODEL = "qwen/qwen3.5-27b";
const TIMEOUT_MS = 120_000;
const EFFECT_CATEGORIES: EffectCategory[] = ["entrance", "exit", "continuous"];

function isEffectCategory(value: unknown): value is EffectCategory {
  return typeof value === "string" && EFFECT_CATEGORIES.includes(value as EffectCategory);
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content?: string;
      role: string;
    };
  }>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

async function callOpenRouter(
  model: string,
  messages: Array<{ role: string; content: string }>,
  logger: { info: (msg: string) => void },
): Promise<OpenRouterResponse> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new Error("[ai-generate-effect] Missing OPENROUTER_API_KEY");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    logger.info(`[AI-GENERATE-EFFECT] OpenRouter request: model=${model}`);
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
        max_tokens: 4096,
        top_p: 1,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 500)}`);
    }

    const data = await response.json() as OpenRouterResponse;
    logger.info(`[AI-GENERATE-EFFECT] OpenRouter response: model=${data.model ?? model} usage=${JSON.stringify(data.usage ?? {})}`);
    return data;
  } finally {
    clearTimeout(timeout);
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
  const model = isEditMode ? EDIT_MODEL : CREATE_MODEL;

  try {
    const { systemMsg, userMsg } = buildGenerateEffectMessages({
      prompt,
      name: effectName || undefined,
      category,
      existingCode,
    });

    logger.info(`[AI-GENERATE-EFFECT] starting call, model=${model}, category=${category}, editMode=${isEditMode}`);
    const startedAt = Date.now();
    const response = await callOpenRouter(model, [
      { role: "system", content: systemMsg },
      { role: "user", content: userMsg },
    ], logger);
    logger.info(`[AI-GENERATE-EFFECT] call completed in ${Date.now() - startedAt}ms`);

    const outputText = response.choices[0]?.message?.content?.trim() || "";
    logger.info(`[AI-GENERATE-EFFECT] raw output length=${outputText.length}, first 200 chars: ${outputText.slice(0, 200)}`);

    let extracted;
    try {
      extracted = extractEffectCodeAndMeta(outputText);
    } catch (parseErr: unknown) {
      const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      logger.info(`[AI-GENERATE-EFFECT] extraction/validation failed: ${parseMsg}`);
      logger.info(`[AI-GENERATE-EFFECT] full output: ${outputText.slice(0, 1000)}`);
      await logger.flush();
      return jsonResponse({ error: parseMsg, rawOutput: outputText.slice(0, 500) }, 422);
    }
    const { code, name: generatedName, description, parameterSchema } = extracted;

    await logger.flush();
    return jsonResponse({
      code,
      name: generatedName,
      description,
      parameterSchema,
      model: response.model || model,
    });
  } catch (err: unknown) {
    const message = toErrorMessage(err);
    console.error("[ai-generate-effect] Error generating effect:", message);
    logger.info(`[AI-GENERATE-EFFECT] error: ${message}`);
    await logger.flush();
    return jsonResponse({ error: "Internal server error", details: message }, 500);
  }
});
