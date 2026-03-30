import Groq from "npm:groq-sdk@0.26.0";
import type { EdgeRuntime } from "../../_shared/edgeRequest.ts";
import { toErrorMessage } from "../../_shared/errorMessage.ts";
import {
  ANTHROPIC_API_VERSION,
  ANTHROPIC_MODEL,
  ANTHROPIC_TIMEOUT_MS,
  ANTHROPIC_URL,
  FIREWORKS_MODEL,
  FIREWORKS_TIMEOUT_MS,
  FIREWORKS_URL,
  GROQ_TIMEOUT_MS,
  GROQ_TRIAGE_MODEL,
} from "../config.ts";
import type { Difficulty, OpenRouterParams, OpenRouterResponse } from "../types.ts";

type LlmLogger = Pick<EdgeRuntime["logger"], "error" | "info">;

// ── Groq client (triage) ────────────────────────────────────────────

let groqClient: Groq | null = null;
function getGroqClient(): Groq {
  if (groqClient) return groqClient;
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("[ai-timeline-agent] Missing GROQ_API_KEY");
  groqClient = new Groq({ apiKey, timeout: GROQ_TIMEOUT_MS });
  return groqClient;
}

export async function triageDifficulty(
  userMessage: string,
  logger: LlmLogger,
): Promise<Difficulty> {
  const groq = getGroqClient();

  const systemMsg = `You classify timeline editing requests by difficulty.
Reply with EXACTLY one word: "easy", "okay", or "hard".

easy = simple single-clip operations: move, trim, delete, set a property, view, basic text edits
okay = multi-step edits, duplicating with offsets, adding several elements, moderate complexity
hard = complex creative direction, generating content, intricate multi-track choreography, troubleshooting broken timelines, anything requiring deep reasoning

If unsure, say "okay".`;

  try {
    const startedAt = Date.now();
    const response = await groq.chat.completions.create({
      model: GROQ_TRIAGE_MODEL,
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: userMessage },
      ],
      temperature: 0,
      max_tokens: 10,
    } as Parameters<typeof groq.chat.completions.create>[0]);

    const result = (response.choices[0]?.message?.content ?? "").trim().toLowerCase();
    const difficulty: Difficulty = result.includes("hard")
      ? "hard"
      : result.includes("easy")
        ? "easy"
        : "okay";
    logger.info(`[agent] triage: "${result}" → ${difficulty} (${Date.now() - startedAt}ms)`);
    return difficulty;
  } catch (err: unknown) {
    logger.info(`[agent] triage failed, defaulting to okay: ${toErrorMessage(err)}`);
    return "okay";
  }
}

// ── Fireworks (easy / okay) ─────────────────────────────────────────

async function callFireworks(
  params: OpenRouterParams,
  logger: LlmLogger,
): Promise<OpenRouterResponse> {
  const apiKey = Deno.env.get("FIREWORKS_API_KEY");
  if (!apiKey) throw new Error("[ai-timeline-agent] Missing FIREWORKS_API_KEY");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FIREWORKS_TIMEOUT_MS);

  try {
    console.log(
      `[agent] Fireworks request: model=${params.model} messages=${params.messages.length} tools=${params.tools?.length ?? 0}`,
    );
    const response = await fetch(FIREWORKS_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(`[agent] Fireworks error ${response.status}: ${text.slice(0, 500)}`);
      throw new Error(`Fireworks ${response.status}: ${text}`);
    }

    const data = (await response.json()) as OpenRouterResponse;
    const msg = data.choices?.[0]?.message;
    console.log(
      `[agent] Fireworks response: tool_calls=${msg?.tool_calls?.length ?? 0} content_length=${msg?.content?.length ?? 0} usage=${JSON.stringify(data.usage ?? {})}`,
    );
    logger.info("Fireworks response received", { model: params.model, usage: data.usage });
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Anthropic (hard) ────────────────────────────────────────────────

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } | { type: "tool_result"; tool_use_id: string; content: string }>;
}

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicResponse {
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string;
}

/** Convert OpenAI-style messages to Anthropic format, extracting the system prompt. */
function toAnthropicMessages(
  messages: unknown[],
): { system: string; messages: AnthropicMessage[] } {
  let system = "";
  const out: AnthropicMessage[] = [];

  for (const msg of messages) {
    const m = msg as Record<string, unknown>;
    if (m.role === "system") {
      system += (system ? "\n\n" : "") + String(m.content ?? "");
      continue;
    }

    if (m.role === "tool") {
      // Anthropic expects tool results as user messages with tool_result content blocks
      out.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: String(m.tool_call_id ?? ""),
          content: String(m.content ?? ""),
        }],
      });
      continue;
    }

    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      // Assistant message with tool calls → Anthropic tool_use content blocks
      const content: AnthropicMessage["content"] = [];
      if (typeof m.content === "string" && m.content) {
        content.push({ type: "text", text: m.content });
      }
      for (const tc of m.tool_calls as Array<Record<string, unknown>>) {
        const fn = tc.function as Record<string, unknown> | undefined;
        if (!fn) continue;
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(String(fn.arguments ?? "{}"));
        } catch { /* empty */ }
        content.push({
          type: "tool_use",
          id: String(tc.id ?? crypto.randomUUID()),
          name: String(fn.name ?? ""),
          input,
        });
      }
      out.push({ role: "assistant", content });
      continue;
    }

    out.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? ""),
    });
  }

  return { system, messages: out };
}

/** Convert OpenAI-style tools to Anthropic tool format. */
function toAnthropicTools(tools?: unknown[]): AnthropicTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => {
    const tool = t as Record<string, unknown>;
    const fn = tool.function as Record<string, unknown> | undefined;
    return {
      name: String(fn?.name ?? tool.name ?? ""),
      description: fn?.description != null ? String(fn.description) : undefined,
      input_schema: (fn?.parameters ?? {}) as Record<string, unknown>,
    };
  });
}

/** Convert Anthropic response back to OpenAI-compatible format. */
function fromAnthropicResponse(resp: AnthropicResponse): OpenRouterResponse {
  let textContent = "";
  const toolCalls: OpenRouterResponse["choices"][0]["message"]["tool_calls"] = [];

  for (const block of resp.content) {
    if (block.type === "text") {
      textContent += (textContent ? "\n" : "") + block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  return {
    choices: [{
      message: {
        role: "assistant",
        content: textContent || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
    }],
    usage: {
      prompt_tokens: resp.usage.input_tokens,
      completion_tokens: resp.usage.output_tokens,
      total_tokens: resp.usage.input_tokens + resp.usage.output_tokens,
    },
  };
}

async function callAnthropic(
  params: OpenRouterParams,
  logger: LlmLogger,
): Promise<OpenRouterResponse> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("[ai-timeline-agent] Missing ANTHROPIC_API_KEY");

  const { system, messages } = toAnthropicMessages(params.messages);
  const tools = toAnthropicTools(params.tools);

  const body: Record<string, unknown> = {
    model: ANTHROPIC_MODEL,
    max_tokens: params.max_tokens ?? 4096,
    system,
    messages,
    ...(tools ? { tools, tool_choice: { type: "auto" } } : {}),
    ...(params.temperature != null ? { temperature: params.temperature } : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);

  try {
    console.log(
      `[agent] Anthropic request: model=${ANTHROPIC_MODEL} messages=${messages.length} tools=${tools?.length ?? 0}`,
    );
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(`[agent] Anthropic error ${response.status}: ${text.slice(0, 500)}`);
      throw new Error(`Anthropic ${response.status}: ${text}`);
    }

    const data = (await response.json()) as AnthropicResponse;
    console.log(
      `[agent] Anthropic response: blocks=${data.content.length} usage=${JSON.stringify(data.usage)}`,
    );
    logger.info("Anthropic response received", {
      model: ANTHROPIC_MODEL,
      usage: data.usage,
    });

    return fromAnthropicResponse(data);
  } finally {
    clearTimeout(timeout);
  }
}

// ── Unified entry point ─────────────────────────────────────────────

function callProvider(
  params: OpenRouterParams,
  difficulty: Difficulty,
  logger: LlmLogger,
): Promise<OpenRouterResponse> {
  if (difficulty === "hard") {
    return callAnthropic({ ...params, model: ANTHROPIC_MODEL }, logger);
  }
  return callFireworks({ ...params, model: FIREWORKS_MODEL }, logger);
}

export async function invokeLlm(
  params: Omit<OpenRouterParams, "model">,
  difficulty: Difficulty,
  logger: LlmLogger,
): Promise<OpenRouterResponse> {
  const fullParams = { ...params, model: "" }; // model set by callProvider

  try {
    return await callProvider(fullParams, difficulty, logger);
  } catch (firstError: unknown) {
    const provider = difficulty === "hard" ? "Anthropic" : "Fireworks";
    logger.error(`${provider} call failed on first attempt`, {
      error: toErrorMessage(firstError),
    });

    try {
      return await callProvider(fullParams, difficulty, logger);
    } catch (secondError: unknown) {
      logger.error(`${provider} call failed on retry`, {
        error: toErrorMessage(secondError),
      });
      throw secondError;
    }
  }
}
