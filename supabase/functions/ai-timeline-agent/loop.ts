import type { EdgeRuntime } from "../_shared/edgeRequest.ts";
import { toErrorMessage } from "../_shared/errorMessage.ts";
import {
  LOOP_LIMIT,
  SOFT_TIMEOUT_MS,
} from "./config.ts";
import {
  fetchProjectTasks,
  loadActiveReference,
  loadProjectImageSettings,
  loadShotVideoTravelSettings,
  loadSessionStatus,
  loadTimelineState,
  persistSessionState,
} from "./db.ts";
import { invokeLlm, triageDifficulty } from "./llm/client.ts";
import {
  buildInitialMessages,
  createToolTurn,
  createTurn,
  extractAssistantText,
  isRecord,
} from "./llm/messages.ts";
import { buildTimelineAgentSystemPrompt } from "./prompts.ts";
import {
  extractToolCalls,
  isToolError,
  type ExtractedToolCall,
} from "./tool-calls.ts";
import { TIMELINE_AGENT_TOOLS } from "./tool-schemas.ts";
import { asStringArray, asTrimmedString } from "./utils.ts";
import {
  createShotWithGenerations,
  findShotForGenerations,
  resolveClipGenerationIds,
} from "./tools/clips.ts";
import { executeCreateTask } from "./tools/create-task.ts";
import { executeDuplicateGeneration } from "./tools/duplicate-generation.ts";
import { executeSearchLoras, executeSetLora } from "./tools/loras.ts";
import { executeCommand } from "./tools/registry.ts";
import { viewTimeline } from "./tools/timeline.ts";
import type {
  AgentSession,
  AgentSessionStatus,
  AgentTurn,
  GenerationContext,
  LlmMessage,
  SelectedClipPayload,
  SupabaseAdmin,
  TimelineState,
  ToolResult,
} from "./types.ts";

type LoopLogger = Pick<EdgeRuntime["logger"], "error" | "info">;

const APPEND_SHOT_POSITION = 2_147_483_647;

export interface RunAgentLoopOptions {
  session: AgentSession;
  userMessage?: string;
  selectedClips?: SelectedClipPayload[];
  supabaseAdmin: SupabaseAdmin;
  logger: LoopLogger;
}

export interface RunAgentLoopResult {
  status: AgentSessionStatus;
  turns: AgentTurn[];
  summary: string | null;
}

function attachSelectedClips(
  turn: AgentTurn,
  selectedClips?: SelectedClipPayload[],
) {
  if (!selectedClips?.length) {
    return;
  }

  turn.attachments = selectedClips.map((clip) => ({
    clipId: clip.clip_id,
    url: clip.url,
    mediaType: clip.media_type,
    ...(clip.generation_id ? { generationId: clip.generation_id } : {}),
    ...(clip.prompt ? { prompt: clip.prompt } : {}),
  }));
}

export function recoverSelectedClipsFromTurns(turns: AgentTurn[]): SelectedClipPayload[] {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn?.role !== "user" || !Array.isArray(turn.attachments) || turn.attachments.length === 0) {
      continue;
    }

    return turn.attachments.flatMap((attachment) => {
      if (!isRecord(attachment)) {
        return [];
      }

      const clipId = typeof attachment.clipId === "string" ? attachment.clipId.trim() : "";
      const url = typeof attachment.url === "string" ? attachment.url.trim() : "";
      const mediaType = attachment.mediaType;
      const generationId = typeof attachment.generationId === "string" && attachment.generationId.trim()
        ? attachment.generationId.trim()
        : undefined;
      const prompt = typeof attachment.prompt === "string" && attachment.prompt.trim()
        ? attachment.prompt.trim()
        : undefined;

      if (!clipId || !url || (mediaType !== "image" && mediaType !== "video")) {
        return [];
      }

      return [{
        clip_id: clipId,
        url,
        media_type: mediaType,
        ...(generationId ? { generation_id: generationId } : {}),
        ...(prompt ? { prompt } : {}),
      }];
    });
  }

  return [];
}

export function cleanAssistantText(text: string): string {
  return text
    .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, "")
    .replace(/<invoke[\s\S]*?<\/invoke>/g, "")
    .replace(/Tool call \w+:[\s\S]*?(?=\n\n|$)/g, "")
    .replace(/(?:run|create_task)\s*\([^)]*\)/g, "")
    .replace(/^\s*\d+[.):-]\s*(set-text|move|trim|delete|duplicate|add-text|set|view|find-issues|generate)\b.*$/gm, "")
    .trim();
}

async function executeCreateShot(
  args: Record<string, unknown>,
  timelineState: TimelineState,
  supabaseAdmin: SupabaseAdmin,
): Promise<Pick<ToolResult, "result">> {
  const shotName = asTrimmedString(args.shot_name);
  const generationIds = asStringArray(args.generation_ids);

  if (!shotName) {
    return { result: "create_shot requires shot_name." };
  }

  if (generationIds.length === 0) {
    return { result: "create_shot requires at least one generation_id." };
  }

  const shotId = await createShotWithGenerations(supabaseAdmin, {
    projectId: timelineState.projectId,
    shotName,
    generationIds,
    position: APPEND_SHOT_POSITION,
  });

  return {
    result: `Created shot ${shotName} (${shotId}) with ${generationIds.length} generation(s).`,
  };
}

async function executeGetTasks(
  args: Record<string, unknown>,
  timelineState: TimelineState,
  supabaseAdmin: SupabaseAdmin,
): Promise<ToolResult> {
  const tasks = await fetchProjectTasks(supabaseAdmin, timelineState.projectId, {
    status: typeof args.status === "string" ? args.status : undefined,
    taskId: typeof args.task_id === "string" ? args.task_id : undefined,
    limit: typeof args.limit === "number" ? args.limit : undefined,
  });

  if (tasks.length === 0) {
    return { result: "No tasks found." };
  }

  const lines = tasks.map((t) => {
    const age = timeSince(t.created_at);
    let line = `• ${t.id.slice(0, 8)} | ${t.task_type} | ${t.status} | ${age}`;
    if (t.params_summary) line += ` | ${t.params_summary}`;
    if (t.error_message) line += `\n  Error: ${t.error_message.slice(0, 200)}`;
    if (t.status === "In Progress" && t.generation_started_at) {
      line += ` | running ${timeSince(t.generation_started_at)}`;
    }
    if (t.status === "Complete" && t.attempts > 1) {
      line += ` | ${t.attempts} attempts`;
    }
    return line;
  });

  return { result: `${tasks.length} task(s):\n${lines.join("\n")}` };
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

export async function executeToolCall(
  toolCall: ExtractedToolCall,
  timelineState: TimelineState,
  supabaseAdmin: SupabaseAdmin,
  timelineId: string,
  selectedClips?: SelectedClipPayload[],
  generationContext?: GenerationContext,
  userId?: string,
): Promise<ToolResult> {
  const toolArgs = toolCall.args;

  if (toolCall.parseError) {
    return { result: toolCall.parseError };
  }

  if (toolCall.name === "run") {
    return typeof toolArgs.command === "string" && toolArgs.command.trim()
      ? await executeCommand(
        toolArgs.command,
        timelineState,
        timelineId,
        supabaseAdmin,
      )
      : { result: "run requires command." };
  }

  if (toolCall.name === "create_task") {
    return await executeCreateTask(toolArgs, timelineState, selectedClips, supabaseAdmin, generationContext);
  }

  if (toolCall.name === "search_loras") {
    return await executeSearchLoras(toolArgs, supabaseAdmin, userId);
  }

  if (toolCall.name === "set_lora") {
    return await executeSetLora(toolArgs, timelineState, selectedClips, supabaseAdmin, generationContext);
  }

  if (toolCall.name === "duplicate_generation") {
    return await executeDuplicateGeneration(toolArgs, timelineState, selectedClips, supabaseAdmin);
  }

  if (toolCall.name === "create_shot") {
    return await executeCreateShot(toolArgs, timelineState, supabaseAdmin);
  }

  if (toolCall.name === "get_tasks") {
    return await executeGetTasks(toolArgs, timelineState, supabaseAdmin);
  }

  return { result: `Unknown tool: ${toolCall.name}.` };
}

export function buildToolErrorTurn(toolCallId: string, error: unknown): AgentTurn {
  return createTurn("assistant", `[TOOL ERROR ${toolCallId}] ${toErrorMessage(error)}`);
}

async function processToolCalls({
  toolCalls,
  assistantText,
  turns,
  messages,
  timelineState,
  selectedClips,
  generationContext,
  supabaseAdmin,
  timelineId,
  userId,
  setActiveToolCallId,
}: {
  toolCalls: ExtractedToolCall[];
  assistantText: string;
  turns: AgentTurn[];
  messages: LlmMessage[];
  timelineState: TimelineState;
  selectedClips?: SelectedClipPayload[];
  generationContext?: GenerationContext;
  supabaseAdmin: SupabaseAdmin;
  timelineId: string;
  userId?: string;
  setActiveToolCallId: (toolCallId: string | null) => void;
}): Promise<{ hasError: boolean }> {
  let hasError = false;

  for (const toolCall of toolCalls) {
    const toolArgs = toolCall.args;
    const toolContent = toolCall.name === "run"
      ? (typeof toolArgs.command === "string" ? toolArgs.command : JSON.stringify(toolArgs))
      : JSON.stringify(toolArgs);

    setActiveToolCallId(toolCall.id);
    turns.push(createToolTurn("tool_call", toolCall.name, toolContent, toolArgs));
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: [{
        id: toolCall.id,
        type: "function" as const,
        function: { name: toolCall.name, arguments: JSON.stringify(toolArgs) },
      }],
    });

    const result = await executeToolCall(
      toolCall,
      timelineState,
      supabaseAdmin,
      timelineId,
      selectedClips,
      generationContext,
      userId,
    );
    setActiveToolCallId(null);

    turns.push(createToolTurn("tool_result", toolCall.name, result.result, toolArgs));
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: result.result,
    });

    if (isToolError(result.result)) {
      hasError = true;
      break;
    }
  }

  setActiveToolCallId(null);

  if (assistantText) {
    const cleaned = cleanAssistantText(assistantText);
    if (cleaned && cleaned.length > 2) {
      turns.push(createTurn("assistant", cleaned));
    }
  }

  if (hasError) {
    const lastResult = turns[turns.length - 1];
    messages.push({
      role: "user",
      content: `Tool failed: "${lastResult?.content ?? "unknown error"}". You can: (1) run(command="...") with a corrected timeline command, (2) create_task({...}) with corrected task arguments, (3) run(command="view") to inspect the timeline, or (4) reply in plain text to tell the user what went wrong.`,
    });
  }

  return { hasError };
}

export async function runAgentLoop(
  options: RunAgentLoopOptions,
): Promise<RunAgentLoopResult> {
  const { session, userMessage, selectedClips, supabaseAdmin, logger } = options;
  const effectiveSelectedClips = selectedClips?.length
    ? selectedClips
    : recoverSelectedClipsFromTurns(session.turns);

  const lastTurn = session.turns[session.turns.length - 1];
  const isDuplicate = userMessage && lastTurn?.role === "user" && lastTurn.content === userMessage;
  const turns = [...session.turns];
  if (userMessage && !isDuplicate) {
    const userTurn = createTurn("user", userMessage);
    attachSelectedClips(userTurn, effectiveSelectedClips);
    turns.push(userTurn);
  }
  let status: AgentSessionStatus = "processing";
  const summary = session.summary;
  let activeToolCallId: string | null = null;

  try {
    await persistSessionState(supabaseAdmin, {
      sessionId: session.id,
      status,
      turns,
      summary,
    });

    const timelineState = await loadTimelineState(supabaseAdmin, session.timeline_id);
    const imageSettings = await loadProjectImageSettings(supabaseAdmin, timelineState.projectId);
    const clipGenerationIds = resolveClipGenerationIds(
      effectiveSelectedClips ?? [],
      timelineState.registry,
      timelineState.config,
    );
    const clipShotId = clipGenerationIds.length > 0
      ? await findShotForGenerations(supabaseAdmin, clipGenerationIds)
      : null;
    const travelSettings = clipShotId
      ? await loadShotVideoTravelSettings(supabaseAdmin, clipShotId)
      : null;
    const activeReference = imageSettings
      ? await loadActiveReference(supabaseAdmin, imageSettings, clipShotId ?? undefined)
      : null;
    const generationContext: GenerationContext = {
      image: imageSettings
        ? {
          defaultModelName: imageSettings.selectedTextModel ?? "qwen-image",
          activeReference,
          selectedLorasByCategory: imageSettings.selectedLorasByCategory,
        }
        : null,
      travel: travelSettings,
    };
    const timelineSummary = viewTimeline(timelineState.config, timelineState.registry).result;
    const systemPrompt = buildTimelineAgentSystemPrompt({
      projectId: timelineState.projectId,
      timelineSummary,
      selectedClips: effectiveSelectedClips,
      defaultModel: generationContext.image?.defaultModelName,
      activeReference: generationContext.image?.activeReference ?? null,
      travelSettings,
      imageLorasByCategory: generationContext.image?.selectedLorasByCategory ?? null,
    });
    const messages = buildInitialMessages(systemPrompt, turns);
    const startedAt = Date.now();

    // Triage the user message to pick provider: easy/okay → Kimi K2.5, hard → Claude
    const difficulty = userMessage
      ? await triageDifficulty(userMessage, logger)
      : "okay";

    for (let iteration = 0; iteration < LOOP_LIMIT; iteration += 1) {
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

      const extractedToolCalls = extractToolCalls(responseMessage);
      const assistantText = extractAssistantText(responseMessage);

      if (extractedToolCalls.length === 0) {
        const text = assistantText || "What would you like me to do?";
        turns.push(createTurn("assistant", text));
        messages.push({ role: "assistant", content: text });
        status = "waiting_user";
        break;
      }

      const { hasError } = await processToolCalls({
        toolCalls: extractedToolCalls,
        assistantText,
        turns,
        messages,
        timelineState,
        selectedClips: effectiveSelectedClips,
        generationContext,
        supabaseAdmin,
        timelineId: session.timeline_id,
        userId: session.user_id,
        setActiveToolCallId: (toolCallId) => { activeToolCallId = toolCallId; },
      });

      if (hasError) {
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

    turns.push(
      activeToolCallId
        ? buildToolErrorTurn(activeToolCallId, error)
        : createTurn("assistant", `[INTERNAL ERROR] ${errorDetail}`),
    );

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
