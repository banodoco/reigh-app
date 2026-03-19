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
  buildEditPromptMessages,
  buildEnhanceSegmentUserPrompt,
  buildGeneratePromptsMessages,
  ENHANCE_SEGMENT_SYSTEM_PROMPT,
} from "./templates.ts";

const GROQ_MODEL = "moonshotai/kimi-k2-instruct-0905";
const GROQ_FALLBACK_MODEL = "llama-3.3-70b-versatile";
const GROQ_TIMEOUT_MS = 30_000;

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (groqClient) {
    return groqClient;
  }
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    throw new Error("[ai-prompt] Missing Groq provider configuration");
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
      logger.info(`[AI-PROMPT] Primary model failed (${msg}), falling back to ${GROQ_FALLBACK_MODEL}`);
      return await groq.chat.completions.create({
        ...params,
        model: GROQ_FALLBACK_MODEL,
      } as Parameters<typeof groq.chat.completions.create>[0]);
    }
    throw err;
  }
}

function getOpenAIApiKey(): string {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("[ai-prompt] Missing OpenAI provider configuration");
  }
  return apiKey;
}

serve(async (req) => {
  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "ai-prompt",
    logPrefix: "[AI-PROMPT]",
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

  // Rate limit by user ID (this is an expensive AI endpoint)
  const rateLimitDenied = await enforceRateLimit({
    supabaseAdmin,
    functionName: 'ai-prompt',
    userId: auth.userId,
    config: RATE_LIMITS.expensive,
    logger,
    logPrefix: '[AI-PROMPT]',
    responses: {
      serviceUnavailable: () => jsonResponse({ error: 'Rate limit service unavailable' }, 503),
    },
  });
  if (rateLimitDenied) {
    return rateLimitDenied;
  }

  const task = body.task as string | undefined;
  if (!task) return jsonResponse({ error: "task is required" }, 400);

  try {
    switch (task) {
      case "generate_prompts": {
        const groq = getGroqClient();
        const overallPromptText = String(body.overallPromptText ?? "");
        const rulesToRememberText = String(body.rulesToRememberText ?? "");
        const numberToGenerate = Number(body.numberToGenerate ?? 3);
        const existingPrompts = Array.isArray(body.existingPrompts) ? body.existingPrompts as unknown[] : [];
        const temperature = Number(body.temperature ?? 0.8);

        const { systemMsg, userMsg } = buildGeneratePromptsMessages({
          overallPromptText,
          rulesToRememberText,
          numberToGenerate,
          existingPrompts,
        });

        logger.info(`[AI-PROMPT] generate_prompts: starting Groq call, model=${GROQ_MODEL}, numberToGenerate=${numberToGenerate}`);
        const groqStart = Date.now();
        const resp = await groqWithFallback(groq, {
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
          temperature: temperature,
          max_tokens: 4096,
          top_p: 1,
        }, logger);
        logger.info(`[AI-PROMPT] generate_prompts: Groq call completed in ${Date.now() - groqStart}ms, model=${resp.model}`);
        const outputText = resp.choices[0]?.message?.content?.trim() || "";
        const prompts = outputText.split("\n").map((s) => s.trim()).filter(Boolean);
        
        // Validate we got the expected number of prompts
        if (prompts.length !== numberToGenerate) {
          // If we got too many, take the first N
          if (prompts.length > numberToGenerate) {
            prompts.splice(numberToGenerate);
          }
          // If we got too few, we'll just return what we have rather than failing
        }
        
        return jsonResponse({ prompts, usage: resp.usage });
      }
      case "edit_prompt": {
        const groq = getGroqClient();
        const originalPromptText = String(body.originalPromptText ?? "");
        const editInstructions = String(body.editInstructions ?? "");
        if (!originalPromptText || !editInstructions) return jsonResponse({ error: "originalPromptText and editInstructions required" }, 400);
        const { systemMsg, userMsg } = buildEditPromptMessages({
          originalPromptText,
          editInstructions,
        });
        const resp = await groqWithFallback(groq, {
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
          temperature: 0.7,
          max_tokens: 2048,
          top_p: 1,
        }, logger);
        const newText = resp.choices[0]?.message?.content?.trim() || originalPromptText;
        return jsonResponse({ success: true, newText, usage: resp.usage });
      }
      case "generate_summary": {
        const groq = getGroqClient();
        const promptText = String(body.promptText ?? "");
        if (!promptText) return jsonResponse({ error: "promptText required" }, 400);
        logger.info(`[AI-PROMPT] generate_summary: starting Groq call`);
        const summaryStart = Date.now();
        const resp = await groqWithFallback(groq, {
          model: GROQ_MODEL,
          messages: [{ role: "user", content: `Create a brief summary of this image prompt in 10 words or less. Output only the summary text with no additional formatting or quotation marks:

"${promptText}"

Summary:` }],
          temperature: 1.0,
          max_tokens: 50,
          top_p: 1,
        }, logger);
        logger.info(`[AI-PROMPT] generate_summary: Groq call completed in ${Date.now() - summaryStart}ms`);
        const summary = resp.choices[0]?.message?.content?.trim() || null;
        return jsonResponse({ summary, usage: resp.usage });
      }
      case "enhance_segment_prompt": {
        // Enhance a single segment prompt using OpenAI GPT-5 Mini
        // Uses motion-focused prompt template for video transitions
        const prompt = String(body.prompt ?? "");
        const _temperature = Number(body.temperature ?? 0.7);

        if (!prompt.trim()) {
          return jsonResponse({ error: "prompt is required" }, 400);
        }

        const openaiApiKey = getOpenAIApiKey();

        const systemMsg = ENHANCE_SEGMENT_SYSTEM_PROMPT;
        const userMsg = buildEnhanceSegmentUserPrompt(prompt);

        try {
          const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openaiApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-5-mini",
              messages: [
                { role: "system", content: systemMsg },
                { role: "user", content: userMsg },
              ],
              max_completion_tokens: 16000,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[ai-prompt] OpenAI API error:`, response.status, errorText);
            return jsonResponse({ error: "OpenAI API error", details: errorText }, response.status);
          }

          const data = await response.json();

          const enhancedPrompt = data.choices?.[0]?.message?.content?.trim() || prompt;

          return jsonResponse({
            enhanced_prompt: enhancedPrompt,
            usage: data.usage,
          });
        } catch (fetchError: unknown) {
          const message = toErrorMessage(fetchError);
          console.error(`[ai-prompt] OpenAI fetch error:`, message);
          return jsonResponse({ error: "Failed to call OpenAI API", details: message }, 500);
        }
      }
      default:
        return jsonResponse({ error: `Unknown task: ${task}` }, 400);
    }
  } catch (err: unknown) {
    const message = toErrorMessage(err);
    console.error(`[ai-prompt] Error handling task ${task}:`, message);
    return jsonResponse({ error: "Internal server error", details: message }, 500);
  }
}); 
