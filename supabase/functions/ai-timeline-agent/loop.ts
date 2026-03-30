import type { EdgeRuntime } from "../_shared/edgeRequest.ts";
import { toErrorMessage } from "../_shared/errorMessage.ts";
import {
  LOOP_LIMIT,
  SOFT_TIMEOUT_MS,
} from "./config.ts";
import { loadSessionStatus, loadTimelineState, persistSessionState } from "./db.ts";
import { invokeLlm, triageDifficulty } from "./llm/client.ts";
import {
  buildInitialMessages,
  createToolTurn,
  createTurn,
  extractAssistantText,
  isRecord,
  parseToolArgsSafely,
} from "./llm/messages.ts";
import { buildTimelineAgentSystemPrompt } from "./prompts.ts";
import { TIMELINE_AGENT_TOOLS } from "./tool-schemas.ts";
import { executeCommand } from "./tools/registry.ts";
import { viewTimeline } from "./tools/timeline.ts";
import type {
  AgentSession,
  AgentSessionStatus,
  AgentTurn,
  SupabaseAdmin,
} from "./types.ts";

type LoopLogger = Pick<EdgeRuntime["logger"], "error" | "info">;

export interface RunAgentLoopOptions {
  session: AgentSession;
  userMessage?: string;
  supabaseAdmin: SupabaseAdmin;
  logger: LoopLogger;
}

export interface RunAgentLoopResult {
  status: AgentSessionStatus;
  turns: AgentTurn[];
  summary: string | null;
}

/**
 * Extract the command string from an LLM response.
 * Handles structured tool_calls (run(command="...")), plain text with "run(...)",
 * or just bare command text.
 */
/** Strip escaped quotes and trailing junk from extracted command strings. */
function cleanCommand(raw: string): string {
  return raw
    .replace(/\\"/g, '"')   // unescape \"
    .replace(/\\'/g, "'")   // unescape \'
    .replace(/^["']+|["']+$/g, "")  // strip wrapping quotes
    .trim();
}

function extractCommands(responseMessage: Record<string, unknown>): string[] {
  const commands: string[] = [];

  // Structured tool_calls
  const rawToolCalls = Array.isArray((responseMessage as { tool_calls?: unknown[] }).tool_calls)
    ? (responseMessage as { tool_calls: unknown[] }).tool_calls
    : [];

  for (const tc of rawToolCalls) {
    if (!isRecord(tc)) continue;
    const fn = isRecord(tc.function) ? tc.function : undefined;
    if (!fn || fn.name !== "run") continue;
    const { args } = parseToolArgsSafely(typeof fn.arguments === "string" ? fn.arguments : "{}");
    if (typeof args.command === "string" && args.command.trim()) {
      commands.push(cleanCommand(args.command));
    }
  }
  if (commands.length > 0) return commands;

  // Text fallback
  const text = extractAssistantText(responseMessage);
  if (!text) return [];

  // Multiple run() calls
  const runRe = /run\s*\(\s*(?:command\s*=\s*)?["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = runRe.exec(text)) !== null) {
    commands.push(cleanCommand(m[1]));
  }
  if (commands.length > 0) return commands;

  // Numbered list of commands: "1. set-text clip-abc hello\n2. set-text clip-def world"
  // Match lines starting with a number followed by a known command verb
  const COMMAND_VERBS = /^(?:view|move|trim|delete|rm|set|set-text|settext|add-text|addtext|text|duplicate|dup|clone|find-issues|findissues|issues|generate|gen)\b/;
  const lines = text.split('\n');
  for (const line of lines) {
    const stripped = line.replace(/^\s*\d+[\.\):\-]\s*/, '').trim();
    if (stripped && COMMAND_VERBS.test(stripped)) {
      commands.push(cleanCommand(stripped));
    }
  }
  if (commands.length > 0) return commands;

  // Single command formats
  const patterns = [
    /Tool call run:\s*\n?\{?\s*"?command"?\s*[:=]\s*"([^"]+)"/,
    /<parameter\s+name="command">([^<]+)<\/parameter>/,
    /\[TOOL_CALL\][\s\S]*?--command\s+"([^"]+)"[\s\S]*?\[\/TOOL_CALL\]/,
    /command["\s:=]+["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const match = text.match(re);
    if (match) return [cleanCommand(match[1])];
  }

  return [];
}

export async function runAgentLoop(
  options: RunAgentLoopOptions,
): Promise<RunAgentLoopResult> {
  const { session, userMessage, supabaseAdmin, logger } = options;

  const lastTurn = session.turns[session.turns.length - 1];
  const isDuplicate = userMessage && lastTurn?.role === "user" && lastTurn.content === userMessage;
  const turns = (userMessage && !isDuplicate)
    ? [...session.turns, createTurn("user", userMessage)]
    : [...session.turns];
  let status: AgentSessionStatus = "processing";
  let summary = session.summary;

  try {
    await persistSessionState(supabaseAdmin, {
      sessionId: session.id,
      status,
      turns,
      summary,
    });

    const timelineState = await loadTimelineState(supabaseAdmin, session.timeline_id);
    const timelineSummary = viewTimeline(timelineState.config, timelineState.registry).result;
    const systemPrompt = buildTimelineAgentSystemPrompt({
      projectId: timelineState.projectId,
      timelineSummary,
    });
    const messages = buildInitialMessages(systemPrompt, turns);
    const startedAt = Date.now();

    // Triage the user message to pick provider: easy/okay → Kimi K2.5, hard → Claude
    const difficulty = userMessage
      ? await triageDifficulty(userMessage, logger)
      : "okay";

    loop: for (let iteration = 0; iteration < LOOP_LIMIT; iteration += 1) {
      if (Date.now() - startedAt >= SOFT_TIMEOUT_MS) {
        status = "continue";
        break;
      }

      const currentStatus = await loadSessionStatus(supabaseAdmin, session.id);
      if (currentStatus === "cancelled") {
        status = "cancelled";
        break;
      }

      let completion;
      try {
        completion = await invokeLlm(
          {
            messages: messages as unknown[],
            tools: TIMELINE_AGENT_TOOLS as unknown[],
            tool_choice: "auto",
            temperature: 0.2,
            max_tokens: 4096,
            top_p: 1,
          },
          difficulty,
          logger,
        );
      } catch (llmError: unknown) {
        const text = `AI service error: ${toErrorMessage(llmError)}`;
        turns.push(createTurn("assistant", text));
        messages.push({ role: "assistant", content: text });
        status = "waiting_user";
        break;
      }

      const responseMessage = completion.choices[0]?.message;
      if (!responseMessage) {
        turns.push(createTurn("assistant", "No response from AI."));
        status = "waiting_user";
        break;
      }

      const extractedCommands = extractCommands(responseMessage);
      const assistantText = extractAssistantText(responseMessage);

      // No commands — the model is talking to the user. Pass it through.
      if (extractedCommands.length === 0) {
        const text = assistantText || "What would you like me to do?";
        turns.push(createTurn("assistant", text));
        messages.push({ role: "assistant", content: text });
        status = "waiting_user";
        break;
      }

      // Execute all commands
      let hasError = false;
      for (const command of extractedCommands) {
        console.log(`[agent] Executing command: ${command}`);
        const toolCallId = crypto.randomUUID();
        turns.push(createToolTurn("tool_call", "run", command, { command }));

        messages.push({
          role: "assistant",
          content: null,
          tool_calls: [{
            id: toolCallId,
            type: "function" as const,
            function: { name: "run", arguments: JSON.stringify({ command }) },
          }],
        });

        const result = await executeCommand(
          command,
          timelineState,
          session.timeline_id,
          supabaseAdmin,
        );

        turns.push(createToolTurn("tool_result", "run", result.result, { command }));
        messages.push({
          role: "tool",
          tool_call_id: toolCallId,
          content: result.result,
        });

        const isError = result.result.includes("not found")
          || result.result.includes("does not exist")
          || result.result.includes("requires")
          || result.result.includes("must be")
          || result.result.includes("Failed")
          || result.result.includes("Unknown command")
          || result.result.includes("error");
        if (isError) {
          hasError = true;
          break; // Stop executing remaining commands on error
        }
      }

      // Strip tool-call formatting junk from any assistant text
      if (assistantText) {
        const cleaned = assistantText
          .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, "")
          .replace(/<invoke[\s\S]*?<\/invoke>/g, "")
          .replace(/Tool call \w+:[\s\S]*?(?=\n\n|$)/g, "")
          .replace(/run\s*\([^)]*\)/g, "")
          .replace(/^\s*\d+[\.\):\-]\s*(set-text|move|trim|delete|duplicate|add-text|set|view|find-issues|generate)\b.*$/gm, "")
          .trim();
        if (cleaned && cleaned.length > 2) {
          turns.push(createTurn("assistant", cleaned));
        }
      }

      // If a command failed, give the model structured recovery options
      if (hasError) {
        const lastResult = turns[turns.length - 1];
        messages.push({
          role: "user",
          content: `Command failed: "${lastResult?.content ?? "unknown error"}". You can: (1) run(command="...") with a corrected command, (2) run(command="view") to inspect the timeline, or (3) reply in plain text to tell the user what went wrong.`,
        });
        continue;
      }
    }

    if (status === "processing") {
      status = "continue";
    }

    await persistSessionState(supabaseAdmin, {
      sessionId: session.id,
      status,
      turns,
      summary,
    });

    logger.info("Agent loop completed", {
      session_id: session.id,
      status,
      turns_added: turns.length - session.turns.length,
    });

    return { status, turns, summary };
  } catch (error: unknown) {
    const errorDetail = toErrorMessage(error);
    console.error(`[agent] FATAL: ${errorDetail}`);
    logger.error("Agent loop failed", {
      session_id: session.id,
      error: errorDetail,
    });

    turns.push(createTurn("assistant", `[INTERNAL ERROR] ${errorDetail}`));

    try {
      await persistSessionState(supabaseAdmin, {
        sessionId: session.id,
        status: "error",
        turns,
        summary,
      });
    } catch (persistError: unknown) {
      logger.error("Failed to persist error state", {
        session_id: session.id,
        error: toErrorMessage(persistError),
      });
    }

    return { status: "error", turns, summary };
  }
}
