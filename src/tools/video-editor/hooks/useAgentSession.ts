import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AstridLocalClient } from '@/integrations/astrid/client.ts';
import type { AgentChatEditorContext } from '@/shared/contexts/AgentChatContext.tsx';
import type { AgentTurn, AgentTurnAttachment, AgentSessionStatus } from '@/tools/video-editor/types/agent-session.ts';
import { timelineQueryKey, assetRegistryQueryKey } from '@/tools/video-editor/hooks/useTimeline.ts';
import type { LiveSceneScope } from '@/sdk/video/liveSceneAuthoring';
import type { LiveSceneOperationPort } from '@/tools/video-editor/runtime/liveSceneOperationPort';

type SendMessageInput = { message: string; attachments?: AgentTurnAttachment[] };
export type TrackedAgentTurn = AgentTurn & { messageId?: string };
type AgentSessionView = {
  id: string;
  status: AgentSessionStatus;
  turns: TrackedAgentTurn[];
  /** Streamed assistant text stays transient until the ACP turn completes. */
  assistantDraft?: string;
  assistantDraftMessageId?: string;
};
type AgentSessionOption = Pick<AgentSessionView, 'id' | 'status'>;
type JsonRecord = Record<string, unknown>;

const ACP_PROMPT_TIMEOUT_MS = 5 * 60_000;

type CapturedAgentRequest = {
  input: SendMessageInput;
  sessionId: string;
  routingProjectId: string | undefined;
  editorContext: Omit<AgentChatEditorContext, 'elementOperationAdapter' | 'liveSceneOperationPort'>;
  hostOperationRefs: Pick<AgentChatEditorContext, 'elementOperationAdapter' | 'liveSceneOperationPort'>;
};

type AgentSendCommand =
  | { kind: 'send'; input: SendMessageInput }
  | { kind: 'retry'; request: CapturedAgentRequest };

function hasNonEmptyId(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function cloneAgentRequest(input: SendMessageInput, sessionId: string, context: AgentChatEditorContext, routingProjectId: string | undefined): CapturedAgentRequest {
  const timelineId = hasNonEmptyId(context.timelineId) ? context.timelineId : null;
  const timelineSelected = timelineId !== null;
  const summary = timelineSelected && context.timelineSummary ? { ...context.timelineSummary } : undefined;
  const serializableContext: CapturedAgentRequest['editorContext'] = {
    tool: 'video-editor',
      projectId: context.projectId,
    projectSlug: context.projectSlug,
    timelineId,
    timelineName: timelineSelected ? context.timelineName : null,
    ...(context.deepLink !== undefined ? { deepLink: context.deepLink } : {}),
    ...(summary ? { timelineSummary: summary } : {}),
    ...(timelineSelected && context.elementContext ? { elementContext: structuredClone(context.elementContext) } : {}),
  };
  return {
    input: {
      message: input.message,
      ...(input.attachments ? { attachments: structuredClone(input.attachments) } : {}),
    },
    sessionId,
    routingProjectId,
    editorContext: serializableContext,
    hostOperationRefs: {
      ...(timelineSelected && context.elementOperationAdapter ? { elementOperationAdapter: context.elementOperationAdapter } : {}),
      ...(timelineSelected && context.liveSceneOperationPort ? { liveSceneOperationPort: context.liveSceneOperationPort } : {}),
    },
  };
}

function editorContextForRequest(request: CapturedAgentRequest): AgentChatEditorContext {
  return { ...request.editorContext, ...request.hostOperationRefs };
}

function sceneScopeForRequest(
  sessionId: string,
  turnId: string,
  context: AgentChatEditorContext,
): { scope: LiveSceneScope; port: LiveSceneOperationPort } | null {
  const projectId = hasNonEmptyId(context.projectId) ? context.projectId : null;
  const timelineId = hasNonEmptyId(context.timelineId) ? context.timelineId : null;
  const configVersion = context.timelineSummary?.configVersion;
  const port = context.liveSceneOperationPort;
  if (!projectId || !timelineId || !port || typeof configVersion !== 'number' || !Number.isSafeInteger(configVersion) || configVersion < 0) {
    return null;
  }
  return {
    port,
    scope: { sessionId, turnId, projectId, timelineId, capturedTimelineVersion: configVersion },
  };
}

function removeUnscopedLiveSceneMarkers(content: string): string {
  const cleaned = content.replace(/<reigh_live_scene_request>[\s\S]*?(?:<\/reigh_live_scene_request>|$)/g, '')
    .replace(/<reigh_live_scene_(?:context|result)>[\s\S]*?(?:<\/reigh_live_scene_(?:context|result)>|$)/g, '')
    .trim();
  if (cleaned === content.trim()) return cleaned;
  return `${cleaned}${cleaned ? '\n\n' : ''}Live-scene request ignored because this turn has no valid selected-timeline scope.`;
}

function throwIfPromptCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('ACP prompt was cancelled before dispatch.');
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function textFromContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textFromContent).filter(Boolean).join('');
  const record = asRecord(value);
  if (!record) return '';
  if (record.type === 'text') return typeof record.text === 'string' ? record.text : '';
  if (record.content !== undefined) return textFromContent(record.content);
  if (record.title && typeof record.title === 'string') return record.title;
  return '';
}

const ELEMENT_OPERATION_MARKER = /<reigh_element_operation>\s*([\s\S]*?)\s*<\/reigh_element_operation>/g;

export type ReighElementOperationExtraction = {
  visibleContent: string;
  operations: readonly unknown[];
  parseErrors: readonly string[];
};

/**
 * ACP remains the conversational surface, while the host-owned marker is the
 * narrow machine boundary for Elements edits. Keeping it in the assistant
 * turn means the model can still explain its work, but the host never has to
 * scrape shell commands or guess whether prose describes a completed edit.
 */
export function extractReighElementOperations(content: string): ReighElementOperationExtraction {
  const operations: unknown[] = [];
  const parseErrors: string[] = [];
  const visibleContent = content.replace(ELEMENT_OPERATION_MARKER, (_match, payload: string) => {
    try {
      operations.push(JSON.parse(payload));
    } catch (error) {
      parseErrors.push(error instanceof Error ? error.message : String(error));
    }
    return '';
  }).trim();
  return { visibleContent, operations, parseErrors };
}

function formatElementOperationResult(result: unknown): string {
  const record = asRecord(result);
  const operation = stringValue(record?.operation) ?? 'element operation';
  const version = typeof record?.config_version === 'number' ? ` (timeline v${record.config_version})` : '';
  const validation = asRecord(record?.validation);
  if (validation) {
    return `${operation}: ${validation.valid === true ? 'validated' : 'validation failed'}${version}`;
  }
  return `${operation}: applied${version}`;
}

/** Keep the transport context model-visible but hide it from the chat UI. */
export function stripReighEditorContext(content: string): string {
  if (content.startsWith('<reigh_live_scene_result>') || content.startsWith('<reigh_live_scene_context>')) return '';
  const markerIndex = content.indexOf('<reigh_editor_context>');
  if (markerIndex >= 0) return content.slice(0, markerIndex).trimEnd();

  // Sessions created before the structured contract used this text prefix.
  // Keep old transcripts readable after the bridge migrates to the new block.
  const legacyMarker = content.search(/reigh editor context:\s*timeline id:/i);
  return legacyMarker >= 0 ? content.slice(0, legacyMarker).trimEnd() : content;
}

function timestamp(): string {
  return new Date().toISOString();
}

function newSessionState(id: string): AgentSessionView {
  return { id, status: 'waiting_user', turns: [] };
}

function cloneSession(session: AgentSessionView): AgentSessionView {
  return { ...session, turns: session.turns.map((turn) => ({ ...turn })) };
}

function sessionIdFromValue(value: unknown): string | null {
  const record = asRecord(value);
  return stringValue(record?.sessionId)
    ?? stringValue(record?.session_id)
    ?? stringValue(record?.id);
}

function sessionItemsFromValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  return Array.isArray(record?.sessions) ? record.sessions : Array.isArray(record?.items) ? record.items : [];
}

function extractNotification(value: unknown): { sessionId: string; update: JsonRecord; messageId?: string } | null {
  const envelope = asRecord(value);
  const params = asRecord(envelope?.params) ?? envelope;
  const sessionId = stringValue(params?.sessionId) ?? stringValue(params?.session_id);
  const update = asRecord(params?.update);
  if (!sessionId || !update) return null;
  const messageId = stringValue(update.messageId) ?? stringValue(update.message_id) ?? undefined;
  return { sessionId, update, messageId };
}

export function appendAcpTextTurn(
  turns: TrackedAgentTurn[],
  role: 'user' | 'assistant',
  content: string,
  at: string,
  messageId?: string,
): void {
  const last = turns.at(-1);
  if (
    last?.role === role
    && (!messageId || !last.messageId || last.messageId === messageId)
  ) {
    if (!(role === 'user' && last.content === content)) last.content += content;
    return;
  }
  turns.push({ role, content, timestamp: at, messageId });
}

export type AcpAssistantDraft = {
  content: string;
  messageId?: string;
};

/**
 * Keep streamed assistant narration out of the committed transcript. A new
 * ACP message id starts a fresh candidate response; callers clear the draft
 * when a tool call begins so the next segment is the one that can be committed
 * when the turn stops.
 */
export function appendAcpAssistantDraft(
  draft: AcpAssistantDraft | undefined,
  content: string,
  messageId?: string,
): AcpAssistantDraft {
  const startsNewDraft = !draft
    || (
      Boolean(messageId)
      && Boolean(draft.messageId)
      && messageId !== draft.messageId
    );

  return {
    content: startsNewDraft ? content : `${draft.content}${content}`,
    messageId,
  };
}

/**
 * The ACP connection is intentionally tab-local. OMP remains the authority
 * for session identity and transcript persistence; this store only adapts the
 * streamed ACP notifications to the legacy chat panel's turn model.
 */
type LiveSceneAcpModule = typeof import('../runtime/liveSceneAcpRoundtrip');

export class AstridAgentSessionStore {
  constructor(private readonly client = new AstridLocalClient({
    projectSlug: 'reigh-acp',
    timeoutMs: ACP_PROMPT_TIMEOUT_MS,
  }), private readonly loadLiveSceneAcpRoundtrip: () => Promise<LiveSceneAcpModule> =
    () => import('../runtime/liveSceneAcpRoundtrip')) {}
  private connectionId: string | null = null;
  private connectionPromise: Promise<string> | null = null;
  private eventsPromise: Promise<void> | null = null;
  private readonly sessions = new Map<string, AgentSessionView>();
  private readonly loaded = new Set<string>();
  private readonly activePrompts = new Set<string>();
  private readonly dispatchedPrompts = new Set<string>();
  private readonly activePromptTexts = new Map<string, string>();
  private readonly promptControllers = new Map<string, AbortController>();

  private async connection(): Promise<string> {
    if (this.connectionId) return this.connectionId;
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = this.client.acp.connect()
      .then((connection) => {
        this.connectionId = connection.connection_id;
        return connection.connection_id;
      })
      .finally(() => {
        this.connectionPromise = null;
      });
    return this.connectionPromise;
  }

  private state(sessionId: string): AgentSessionView {
    const current = this.sessions.get(sessionId);
    if (current) return current;
    const created = newSessionState(sessionId);
    this.sessions.set(sessionId, created);
    return created;
  }

  async list(projectId?: string | null): Promise<AgentSessionOption[]> {
    if (projectId && typeof this.client.acp.projectChat === 'function') {
      const chat = await this.client.acp.projectChat(projectId);
      const ordered = [...chat.sessions].sort((a, b) => Number(b.id === chat.selected_session_id) - Number(a.id === chat.selected_session_id));
      const options = ordered.filter((session) => !session.missing).map(({ id }) => ({ id, status: this.state(id).status }));
      await this.pullEvents();
      return options;
    }
    const connectionId = await this.connection();
    const result = await this.client.acp.listSessions(connectionId);
    const options: AgentSessionOption[] = [];
    for (const item of sessionItemsFromValue(result)) {
      const id = sessionIdFromValue(item);
      if (!id) continue;
      const session = this.state(id);
      options.push({ id, status: session.status });
    }
    await this.pullEvents();
    return options;
  }

  async projectChat(projectId: string) { return this.client.acp.projectChat(projectId); }
  async unassignedProjectSessions(projectId: string) {
    return this.client.acp.unassignedProjectSessions(projectId, await this.connection());
  }
  async associateProjectSession(projectId: string, expectedRevision: number, sessionId: string) {
    return this.client.acp.associateProjectSession(projectId, await this.connection(), expectedRevision, sessionId);
  }
  async selectProjectSession(projectId: string, expectedRevision: number, sessionId: string | null) {
    return this.client.acp.selectProjectSession(projectId, expectedRevision, sessionId);
  }
  async saveProjectDraft(projectId: string, expectedRevision: number, text: string, queuedMessages: import('@/integrations/astrid/acpRoutes.ts').ProjectChatState['draft']['queued_messages']) {
    return this.client.acp.saveProjectDraft(projectId, expectedRevision, text, queuedMessages);
  }

  async create(projectId?: string | null, mode: 'ensure' | 'new' = 'ensure', operationId?: string): Promise<{ id: string }> {
    const connectionId = await this.connection();
    const useProjectRegistry = Boolean(projectId && typeof this.client.acp.createProjectSession === 'function');
    const result = useProjectRegistry
      ? await this.client.acp.createProjectSession(projectId!, connectionId, mode, operationId ?? `reigh-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      : await this.client.acp.createSession(connectionId, { mcpServers: [] });
    const id = useProjectRegistry
      ? stringValue(asRecord(result)?.operation_session_id) ?? stringValue(asRecord(result)?.selected_session_id)
      : sessionIdFromValue(result);
    if (!id) throw new Error('Astrid ACP did not return a session ID.');
    this.state(id);
    this.loaded.add(id);
    await this.pullEvents();
    return { id };
  }

  async get(sessionId: string): Promise<AgentSessionView> {
    const connectionId = await this.connection();
    if (!this.loaded.has(sessionId)) {
      await this.client.acp.loadSession(connectionId, sessionId);
      this.loaded.add(sessionId);
    }
    await this.pullEvents();
    return cloneSession(this.state(sessionId));
  }

  async prompt(
    sessionId: string,
    input: SendMessageInput,
    editorContext: AgentChatEditorContext,
    projectId?: string,
  ): Promise<void> {
    if (this.activePrompts.has(sessionId)) throw new Error('An ACP prompt is already active for this session');
    const controller = new AbortController();
    const session = this.state(sessionId);
    session.status = 'processing';
    session.assistantDraft = undefined;
    session.assistantDraftMessageId = undefined;
    this.activePrompts.add(sessionId);
    this.promptControllers.set(sessionId, controller);
    this.activePromptTexts.set(sessionId, input.message);
    let sceneScope: LiveSceneScope | undefined;
    let scenePort: LiveSceneOperationPort | undefined;
    let dispatchStarted = false;
    try {
      if (controller.signal.aborted) return;
      const connectionId = await this.connection();
      if (controller.signal.aborted) return;
      if (!this.loaded.has(sessionId)) {
        await this.client.acp.loadSession(connectionId, sessionId);
        if (controller.signal.aborted) return;
        this.loaded.add(sessionId);
      }

      const isSessionConfigCommand = !input.attachments?.length
        && /^\/(?:model|thinking)(?:\s|$)/.test(input.message.trim());
      if (isSessionConfigCommand) {
        const { setSessionConfigOption } = await import('../runtime/agentSessionSettings');
        if (controller.signal.aborted) return;
        const acknowledgement = await setSessionConfigOption(this.client.acp, connectionId, sessionId, input.message);
        session.turns.push({
          role: 'user', content: input.message, attachments: input.attachments, timestamp: timestamp(),
          messageId: `reigh-setting-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
        this.commitAssistantDraft(session, acknowledgement);
        await this.pullEvents();
        return;
      }

      const reighAgentContext = await import('@/tools/video-editor/runtime/reighAgentContext.ts');
      if (controller.signal.aborted) return;
      const contextSnapshot = reighAgentContext.buildReighAgentContextSnapshot(editorContext, input.attachments ?? []);
      const context = reighAgentContext.serializeReighAgentContext(contextSnapshot);
      const sceneBinding = sceneScopeForRequest(sessionId, contextSnapshot.request_id, editorContext);
      if (sceneBinding) {
        sceneScope = sceneBinding.scope;
        scenePort = sceneBinding.port;
      }

      let liveSceneAcp: LiveSceneAcpModule | null = null;
      if (sceneScope && scenePort) {
        try {
          liveSceneAcp = await this.loadLiveSceneAcpRoundtrip();
        } catch (error) {
          throw new Error(
            `Live-scene ACP implementation failed to load: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (controller.signal.aborted) return;

      const promptBlocks = [
        { type: 'text', text: input.message },
        { type: 'text', text: context },
        ...(liveSceneAcp && sceneScope ? [{ type: 'text' as const, text: liveSceneAcp.liveScenePromptContract(sceneScope) }] : []),
      ];
      session.turns.push({
        role: 'user',
        content: input.message,
        attachments: input.attachments,
        timestamp: timestamp(),
        messageId: `reigh-prompt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      dispatchStarted = true;
      this.dispatchedPrompts.add(sessionId);
      if (projectId) await this.client.acp.promptProjectSession(projectId, connectionId, sessionId, promptBlocks);
      else await this.client.acp.promptSession(connectionId, sessionId, promptBlocks);
      await this.pullEvents();
      const draft = trimString(session.assistantDraft);
      const extracted = extractReighElementOperations(draft);
      let finalContent = liveSceneAcp
        ? extracted.visibleContent
        : removeUnscopedLiveSceneMarkers(extracted.visibleContent);
      if (extracted.parseErrors.length > 0) {
        finalContent = `${finalContent}${finalContent ? '\n\n' : ''}Element operation marker could not be parsed: ${extracted.parseErrors.join('; ')}`;
      }
      if (extracted.operations.length > 0) {
        if (!editorContext.elementOperationAdapter) {
          finalContent = `${finalContent}${finalContent ? '\n\n' : ''}Element operations were requested, but this editor session has no host operation adapter.`;
        } else {
          for (const operation of extracted.operations) {
            if (controller.signal.aborted) {
              finalContent = `${finalContent}${finalContent ? '\n\n' : ''}Element operation was cancelled before host execution.`;
              break;
            }
            try {
              const result = await editorContext.elementOperationAdapter.execute(operation);
              finalContent = `${finalContent}${finalContent ? '\n\n' : ''}${formatElementOperationResult(result)}`;
            } catch (error) {
              finalContent = `${finalContent}${finalContent ? '\n\n' : ''}Element operation failed: ${error instanceof Error ? error.message : String(error)}`;
            }
          }
        }
      }
      if (liveSceneAcp && sceneScope && scenePort) {
        finalContent = await liveSceneAcp.runLiveSceneAcpRoundtrip({
          content: finalContent, scope: sceneScope, port: scenePort,
          signal: controller.signal,
          followup: async (feedback) => {
            throwIfPromptCancelled(controller.signal);
            session.assistantDraft = undefined;
            session.assistantDraftMessageId = undefined;
            await this.client.acp.promptSession(connectionId, sessionId, [{ type: 'text', text: feedback }]);
            await this.pullEvents();
            return trimString(session.assistantDraft);
          },
        });
      }
      this.commitAssistantDraft(session, finalContent);
    } finally {
      try {
        if (sceneScope && scenePort) scenePort.endTurn(sceneScope);
      } finally {
        this.promptControllers.delete(sessionId);
        this.activePrompts.delete(sessionId);
        this.dispatchedPrompts.delete(sessionId);
        this.activePromptTexts.delete(sessionId);
        session.assistantDraft = undefined;
        session.assistantDraftMessageId = undefined;
        // `session/prompt` resolves only after OMP has finished the turn. A
        // concurrent polling request may have drained the final assistant chunk
        // after the response arrived, so do not let that replay mark a completed
        // turn as "thinking" again.
        session.status = controller.signal.aborted && dispatchStarted ? 'cancelled' : 'waiting_user';
      }
    }
  }

  private commitAssistantDraft(session: AgentSessionView, contentOverride?: string): void {
    const content = (contentOverride ?? session.assistantDraft)?.trim();
    if (!content) return;

    session.turns.push({
      role: 'assistant',
      content,
      timestamp: timestamp(),
      messageId: session.assistantDraftMessageId,
    });
  }

  async cancel(sessionId: string): Promise<void> {
    const cancelledBeforeDispatch = this.activePrompts.has(sessionId) && !this.dispatchedPrompts.has(sessionId);
    this.promptControllers.get(sessionId)?.abort();
    const connectionId = await this.connection();
    await this.client.acp.cancelSession(connectionId, sessionId);
    this.state(sessionId).status = cancelledBeforeDispatch ? 'waiting_user' : 'cancelled';
    await this.pullEvents();
  }

  private async pullEvents(): Promise<void> {
    if (this.eventsPromise) return this.eventsPromise;
    this.eventsPromise = (async () => {
      const connectionId = await this.connection();
      const response = await this.client.acp.events(connectionId);
      for (const notification of response.notifications) this.applyNotification(notification);
      if (response.disconnected) this.connectionId = null;
    })().finally(() => {
      this.eventsPromise = null;
    });
    return this.eventsPromise;
  }

  private applyNotification(value: unknown): void {
    const notification = extractNotification(value);
    if (!notification) return;

    const session = this.state(notification.sessionId);
    const updateType = notification.update.sessionUpdate;
    const content = textFromContent(notification.update.content);
    const at = timestamp();

    if (updateType === 'user_message_chunk' || updateType === 'agent_message_chunk') {
      if (!content) return;
      const role = updateType === 'user_message_chunk' ? 'user' : 'assistant';
      const visibleContent = role === 'user' ? stripReighEditorContext(content) : content;
      if (!visibleContent) return;
      // ACP replays persisted user messages, but the live prompt request does
      // not consistently echo the just-sent user message. The local prompt
      // turn above is authoritative for that live request; do not duplicate it
      // if a runtime build happens to echo the same prompt back.
      if (role === 'user' && this.activePrompts.has(notification.sessionId)) {
        const promptText = this.activePromptTexts.get(notification.sessionId);
        // The local optimistic turn is authoritative for the live request.
        // ACP implementations may echo either of the two prompt content
        // blocks, so ignore all user chunks while that request is in flight.
        if (promptText && visibleContent === promptText) {
          return;
        }
      }
      if (role === 'assistant' && this.activePrompts.has(notification.sessionId)) {
        const draft = appendAcpAssistantDraft(
          session.assistantDraft
            ? { content: session.assistantDraft, messageId: session.assistantDraftMessageId }
            : undefined,
          visibleContent,
          notification.messageId,
        );
        session.assistantDraft = draft.content;
        session.assistantDraftMessageId = draft.messageId;
        session.status = 'processing';
        return;
      }

      appendAcpTextTurn(session.turns, role, visibleContent, at, notification.messageId);
      if (role === 'assistant' && this.activePrompts.has(notification.sessionId)) {
        session.status = 'processing';
      }
      return;
    }

    if (updateType === 'tool_call') {
      // Any assistant text before a tool call is progress narration, not the
      // completed answer. The next assistant segment becomes the candidate
      // final response for this turn.
      if (this.activePrompts.has(notification.sessionId)) {
        session.assistantDraft = undefined;
        session.assistantDraftMessageId = undefined;
      }
      const title = stringValue(notification.update.title) ?? 'Astrid tool';
      session.turns.push({
        role: 'tool_call',
        content: content || title,
        tool_name: title,
        tool_args: asRecord(notification.update.rawInput) ?? undefined,
        timestamp: at,
      });
      if (this.activePrompts.has(notification.sessionId)) session.status = 'processing';
      return;
    }

    if (updateType === 'tool_call_update') {
      if (content) session.turns.push({ role: 'tool_result', content, timestamp: at });
      if (this.activePrompts.has(notification.sessionId)) session.status = 'processing';
    }
  }
}

const agentStore = new AstridAgentSessionStore();

/** ACP chat is now the local Astrid implementation, not the retired Supabase surface. */
export function isTimelineAgentSessionsAvailable(): boolean {
  return true;
}

export const agentSessionsQueryKey = (timelineId: string | null | undefined, projectId?: string | null) =>
  ['timeline-agent-sessions', timelineId, projectId ?? null] as const;
export const agentSessionQueryKey = (sessionId: string | null | undefined) =>
  ['timeline-agent-session', sessionId] as const;

export function useAgentSessions(timelineId: string | null | undefined, projectId?: string | null) {
  return useQuery({
    queryKey: agentSessionsQueryKey(timelineId, projectId),
    enabled: Boolean(timelineId || projectId),
    queryFn: () => agentStore.list(projectId),
    refetchInterval: 5_000,
    retry: false,
  });
}

export const projectChatQueryKey = (projectId: string | null | undefined) => ['project-agent-chat', projectId ?? null] as const;
export const unassignedProjectSessionsQueryKey = (projectId: string | null | undefined) => ['project-agent-chat-unassigned', projectId ?? null] as const;

export function useProjectChat(projectId: string | null | undefined) {
  return useQuery({
    queryKey: projectChatQueryKey(projectId),
    enabled: Boolean(projectId),
    queryFn: () => agentStore.projectChat(projectId!),
    retry: false,
  });
}

export function useUnassignedProjectSessions(projectId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: unassignedProjectSessionsQueryKey(projectId),
    enabled: Boolean(projectId) && enabled,
    queryFn: () => agentStore.unassignedProjectSessions(projectId!),
    retry: false,
  });
}

export function useSaveProjectDraft(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { expectedRevision: number; text: string; queuedMessages: import('@/integrations/astrid/acpRoutes.ts').ProjectChatState['draft']['queued_messages'] }) => {
      if (!projectId) throw new Error('projectId is required');
      return agentStore.saveProjectDraft(projectId, input.expectedRevision, input.text, input.queuedMessages);
    },
    onSuccess: (chat) => queryClient.setQueryData(projectChatQueryKey(projectId), chat),
  });
}

export function useSelectProjectSession(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { expectedRevision: number; sessionId: string | null }) => {
      if (!projectId) throw new Error('projectId is required');
      return agentStore.selectProjectSession(projectId, input.expectedRevision, input.sessionId);
    },
    onSuccess: (chat) => queryClient.setQueryData(projectChatQueryKey(projectId), chat),
  });
}

export function useAssociateProjectSession(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { expectedRevision: number; sessionId: string }) => {
      if (!projectId) throw new Error('projectId is required');
      return agentStore.associateProjectSession(projectId, input.expectedRevision, input.sessionId);
    },
    onSuccess: (chat) => {
      queryClient.setQueryData(projectChatQueryKey(projectId), chat);
      void queryClient.invalidateQueries({ queryKey: unassignedProjectSessionsQueryKey(projectId) });
    },
  });
}

export function useAgentSession(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: agentSessionQueryKey(sessionId),
    enabled: Boolean(sessionId),
    queryFn: () => agentStore.get(sessionId!),
    // ACP events are drained independently of the prompt response so streamed
    // assistant text and tool activity paint while a long turn is running.
    // A failed persisted-session load needs an explicit retry/reconnect, not
    // an unbounded RPC loop. Healthy sessions still drain streamed events.
    refetchInterval: (query) => query.state.error ? false : 500,
    retry: false,
  });
}

export function useCreateSession(timelineId: string | null | undefined, projectId?: string | null, mode: 'ensure' | 'new' = 'ensure') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (operationId?: string) => {
      if (!timelineId && !projectId) throw new Error('Select a project or timeline to start chatting.');
      return agentStore.create(projectId, mode, operationId);
    },
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: agentSessionsQueryKey(timelineId, projectId) });
      void queryClient.invalidateQueries({ queryKey: agentSessionQueryKey(session.id) });
      if (projectId) void queryClient.invalidateQueries({ queryKey: projectChatQueryKey(projectId) });
    },
  });
}

export function useSendMessage(
  sessionId: string | null | undefined,
  editorContextInput?: AgentChatEditorContext | string | null,
  projectIdInput?: string | null,
) {
  // Keep the old timeline-only call shape usable for small host fixtures while
  // the video editor uses the richer structured context.
  const editorContext = typeof editorContextInput === 'string'
    ? {
        tool: 'video-editor' as const,
        projectId: null,
        projectSlug: null,
        timelineId: editorContextInput,
        timelineName: null,
      }
    : editorContextInput;
  const lastMessageRef = useRef<CapturedAgentRequest | null>(null);
  const retryInFlightRef = useRef(false);
  const sendInFlightRef = useRef(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (command: AgentSendCommand) => {
      if (sendInFlightRef.current) throw new Error('A message is already being sent or retried.');
      sendInFlightRef.current = true;
      try {
        if (!sessionId) throw new Error('sessionId is required');
        let request: CapturedAgentRequest;
        if (command.kind === 'retry') {
          if (sessionId !== command.request.sessionId) {
            throw new Error('The active session changed; the failed message can only be retried in its original session.');
          }
          if ((projectIdInput ?? undefined) !== command.request.routingProjectId) {
            throw new Error('The active project changed; the failed message can only be retried in its original project.');
          }
          request = command.request;
        } else {
          if (retryInFlightRef.current) throw new Error('A message is already being sent or retried.');
          if (!editorContext || (!hasNonEmptyId(editorContext.projectId) && !hasNonEmptyId(editorContext.timelineId))) {
            throw new Error('Select a project or timeline to chat.');
          }
          const routingProjectId = projectIdInput ?? undefined;
          if (routingProjectId !== undefined && routingProjectId !== editorContext.projectId) {
            throw new Error('The routing project does not match the captured editor context.');
          }
          request = cloneAgentRequest(command.input, sessionId, editorContext, routingProjectId);
        }
        try {
          await agentStore.prompt(request.sessionId, request.input, editorContextForRequest(request), request.routingProjectId);
          lastMessageRef.current = null;
          return request;
        } catch (error) {
          lastMessageRef.current = request;
          throw error;
        }
      } finally {
        sendInFlightRef.current = false;
      }
    },
    onSuccess: (request) => {
      void queryClient.invalidateQueries({ queryKey: agentSessionQueryKey(request.sessionId) });
      // Astrid writes through the workspace runtime. Let the editor's normal
      // version-aware persistence/poll path adopt the changed document instead
      // of forcing a blind local-state replacement.
      if (request.editorContext.timelineId) {
        void queryClient.invalidateQueries({ queryKey: timelineQueryKey(request.editorContext.timelineId) });
        void queryClient.invalidateQueries({ queryKey: assetRegistryQueryKey(request.editorContext.timelineId) });
      }
    },
    onError: (error) => setLocalError(error instanceof Error ? error.message : String(error)),
  });

  const retryLastMessage = async () => {
    const request = lastMessageRef.current;
    if (!request) return null;
    if (retryInFlightRef.current || sendInFlightRef.current || mutation.isPending) {
      throw new Error('A message is already being sent or retried.');
    }
    if (sessionId !== request.sessionId) {
      const error = new Error('The active session changed; the failed message can only be retried in its original session.');
      setLocalError(error.message);
      throw error;
    }
    if ((projectIdInput ?? undefined) !== request.routingProjectId) {
      const error = new Error('The active project changed; the failed message can only be retried in its original project.');
      setLocalError(error.message);
      throw error;
    }
    setLocalError(null);
    retryInFlightRef.current = true;
    try {
      return await mutation.mutateAsync({ kind: 'retry', request });
    } finally {
      retryInFlightRef.current = false;
    }
  };

  return {
    ...mutation,
    mutate: (input: SendMessageInput) => mutation.mutate({ kind: 'send', input }),
    mutateAsync: (input: SendMessageInput) => mutation.mutateAsync({ kind: 'send', input }),
    continuationNotice: null,
    clearContinuationNotice: () => undefined,
    localError,
    clearLocalError: () => setLocalError(null),
    hasRetryableMessage: Boolean(lastMessageRef.current),
    retryLastMessage,
  };
}

export function useCancelSession(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error('sessionId is required');
      await agentStore.cancel(sessionId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentSessionQueryKey(sessionId) });
    },
  });
}
