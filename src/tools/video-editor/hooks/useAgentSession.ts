import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ProjectChatState } from '@/integrations/astrid/acpRoutes.ts';
import { AstridLocalClient } from '@/integrations/astrid/client.ts';
import { BridgeRouteError, BridgeTransportFailure } from '@/integrations/astrid/transport.ts';
import type { AgentChatEditorContext } from '@/shared/contexts/AgentChatContext.tsx';
import type { AgentTurn, AgentTurnAttachment, AgentSessionStatus } from '@/tools/video-editor/types/agent-session.ts';
import { timelineQueryKey, assetRegistryQueryKey } from '@/tools/video-editor/hooks/useTimeline.ts';
import {
  buildReighAgentContextSnapshot,
  serializeReighAgentContext,
} from '@/tools/video-editor/runtime/reighAgentContext.ts';
import type { LiveSceneScope } from '@/sdk/video/liveSceneAuthoring';

export type SendMessageInput = { message: string; attachments?: AgentTurnAttachment[] };
export type ProjectAgentMessage = {
  input: SendMessageInput;
  projectId: string;
  sessionId: string;
  context: AgentChatEditorContext;
};

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
 * streamed ACP notifications to the project chat panel's turn model.
 */
export class AstridAgentSessionStore {
  constructor(private readonly client = new AstridLocalClient({
    projectSlug: 'reigh-acp',
    timeoutMs: ACP_PROMPT_TIMEOUT_MS,
  })) {}
  private connectionId: string | null = null;
  private connectionPromise: Promise<string> | null = null;
  private eventsPromise: Promise<void> | null = null;
  private readonly sessions = new Map<string, AgentSessionView>();
  private readonly loaded = new Set<string>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly activePrompts = new Set<string>();
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

  private disconnect(connectionId: string): void {
    if (this.connectionId !== connectionId) return;
    this.connectionId = null;
    this.loaded.clear();
  }

  private state(sessionId: string): AgentSessionView {
    const current = this.sessions.get(sessionId);
    if (current) return current;
    const created = newSessionState(sessionId);
    this.sessions.set(sessionId, created);
    return created;
  }

  async list(projectId: string): Promise<AgentSessionOption[]> {
    const chat = await this.projectChat(projectId);
    return this.projectSessionOptions(chat);
  }

  projectSessionOptions(chat: ProjectChatState): AgentSessionOption[] {
    return chat.sessions.filter((session) => !session.missing).map(({ id }) => ({
      id, status: this.state(id).status,
    }));
  }

  private async assertOwned(projectId: string, sessionId: string): Promise<void> {
    const chat = await this.projectChat(projectId);
    if (!chat.sessions.some((session) => session.id === sessionId && !session.missing)) {
      throw new Error('This conversation does not belong to the selected project.');
    }
  }

  private async load(connectionId: string, sessionId: string): Promise<void> {
    if (this.loaded.has(sessionId)) return;
    const pending = this.loading.get(sessionId);
    if (pending) return pending;
    // A fresh connection reloads OMP's persisted transcript instead of appending
    // its replay to a previous connection's transient view.
    this.sessions.set(sessionId, newSessionState(sessionId));
    const loading = this.client.acp.loadSession(connectionId, sessionId)
      .then(() => { this.loaded.add(sessionId); })
      .finally(() => { this.loading.delete(sessionId); });
    this.loading.set(sessionId, loading);
    return loading;
  }

  async projectChat(projectId: string) {
    return this.client.acp.projectChat(projectId);
  }

  async saveProjectDraft(
    projectId: string,
    expectedRevision: number,
    text: string,
    queuedMessages: import('@/integrations/astrid/acpRoutes.ts').ProjectChatState['draft']['queued_messages'],
  ) {
    return this.client.acp.saveProjectDraft(projectId, expectedRevision, text, queuedMessages);
  }

  async selectProjectSession(projectId: string, expectedRevision: number, sessionId: string | null) {
    return this.client.acp.selectProjectSession(projectId, expectedRevision, sessionId);
  }

  async create(projectId: string, mode: 'ensure' | 'new', operationId: string) {
    const connectionId = await this.connection();
    const chat = await this.client.acp.createProjectSession(projectId, connectionId, mode, operationId);
    const id = chat.operation_session_id ?? chat.selected_session_id;
    if (!id) throw new Error('Astrid ACP did not return a project session ID.');
    this.state(id);
    return { id, chat };
  }

  async get(projectId: string, sessionId: string): Promise<AgentSessionView> {
    await this.assertOwned(projectId, sessionId);
    const connectionId = await this.connection();
    await this.load(connectionId, sessionId);
    await this.pullEvents();
    return cloneSession(this.state(sessionId));
  }

  async prompt(
    sessionId: string,
    input: SendMessageInput,
    editorContext: AgentChatEditorContext,
    isCurrent: () => boolean = () => true,
    scopeSignal?: AbortSignal,
  ): Promise<void> {
    if (this.activePrompts.has(sessionId)) throw new Error('An ACP prompt is already active for this session');
    const projectId = editorContext.projectId;
    if (!projectId) throw new Error('projectId is required');
    if (typeof input.message !== 'string' || !input.message.trim()) throw new Error('message is required');
    const checkCurrent = () => {
      if (!isCurrent()) throw new Error('Conversation changed before the request completed.');
    };
    checkCurrent();
    await this.assertOwned(projectId, sessionId);
    checkCurrent();
    const connectionId = await this.connection();
    checkCurrent();
    await this.load(connectionId, sessionId);
    checkCurrent();

    const contextSnapshot = buildReighAgentContextSnapshot(editorContext, input.attachments ?? []);
    if (this.activePrompts.has(sessionId)) throw new Error('An ACP prompt is already active for this session');
    const context = serializeReighAgentContext(contextSnapshot);
    const controller = new AbortController();
    const signal = scopeSignal ? AbortSignal.any([controller.signal, scopeSignal]) : controller.signal;
    const sceneScope: LiveSceneScope = {
      sessionId, turnId: contextSnapshot.request_id,
      projectId, timelineId: editorContext.timelineId ?? '',
      capturedTimelineVersion: editorContext.timelineSummary?.configVersion ?? -1,
    };

    const session = this.state(sessionId);
    session.turns.push({
      role: 'user',
      content: input.message,
      attachments: input.attachments,
      timestamp: timestamp(),
      messageId: `reigh-prompt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
    session.status = 'processing';
    session.assistantDraft = undefined;
    session.assistantDraftMessageId = undefined;
    this.activePrompts.add(sessionId);
    this.promptControllers.set(sessionId, controller);
    this.activePromptTexts.set(sessionId, input.message);
    try {
      let liveSceneAcp: typeof import('../runtime/liveSceneAcpRoundtrip') | null = null;
      if (editorContext.liveSceneOperationPort) {
        try {
          liveSceneAcp = await import('../runtime/liveSceneAcpRoundtrip');
        } catch (error) {
          throw new Error(
            `Live-scene ACP implementation failed to load: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (signal.aborted) return;
      checkCurrent();

      await this.client.acp.promptProjectSession(projectId, connectionId, sessionId, [
        { type: 'text', text: input.message },
        { type: 'text', text: context },
        ...(liveSceneAcp ? [{ type: 'text' as const, text: liveSceneAcp.liveScenePromptContract(sceneScope) }] : []),
      ]);
      if (this.connectionId !== connectionId) throw new Error('Astrid ACP disconnected. Retry the saved message.');
      await this.pullEvents();
      checkCurrent();
      if (signal.aborted) return;
      const draft = trimString(session.assistantDraft);
      const extracted = extractReighElementOperations(draft);
      let finalContent = extracted.visibleContent;
      if (extracted.parseErrors.length > 0) {
        finalContent = `${finalContent}${finalContent ? '\n\n' : ''}Element operation marker could not be parsed: ${extracted.parseErrors.join('; ')}`;
      }
      if (extracted.operations.length > 0) {
        if (!editorContext.elementOperationAdapter) {
          finalContent = `${finalContent}${finalContent ? '\n\n' : ''}Element operations were requested, but this editor session has no host operation adapter.`;
        } else {
          for (const operation of extracted.operations) {
            checkCurrent();
            if (signal.aborted) return;
            try {
              const result = await editorContext.elementOperationAdapter.execute(operation);
              finalContent = `${finalContent}${finalContent ? '\n\n' : ''}${formatElementOperationResult(result)}`;
            } catch (error) {
              finalContent = `${finalContent}${finalContent ? '\n\n' : ''}Element operation failed: ${error instanceof Error ? error.message : String(error)}`;
            }
          }
        }
      }
      if (liveSceneAcp) {
        finalContent = await liveSceneAcp.runLiveSceneAcpRoundtrip({
          content: finalContent, scope: sceneScope, port: editorContext.liveSceneOperationPort,
          signal,
          followup: async (feedback) => {
            checkCurrent();
            session.assistantDraft = undefined;
            session.assistantDraftMessageId = undefined;
            await this.client.acp.promptProjectSession(projectId, connectionId, sessionId, [{ type: 'text', text: feedback }]);
            if (this.connectionId !== connectionId) throw new Error('Astrid ACP disconnected. Retry the saved message.');
            await this.pullEvents();
            checkCurrent();
            return trimString(session.assistantDraft);
          },
        });
      }
      checkCurrent();
      this.commitAssistantDraft(session, finalContent);
    } catch (error) {
      if (error instanceof BridgeTransportFailure || (error instanceof BridgeRouteError && error.code === 'connection_not_found')) {
        this.disconnect(connectionId);
      }
      throw error;
    } finally {
      editorContext.liveSceneOperationPort?.endTurn(sceneScope);
      this.promptControllers.delete(sessionId);
      this.activePrompts.delete(sessionId);
      this.activePromptTexts.delete(sessionId);
      session.assistantDraft = undefined;
      session.assistantDraftMessageId = undefined;
      // `session/prompt` resolves only after OMP has finished the turn. A
      // concurrent polling request may have drained the final assistant chunk
      // after the response arrived, so do not let that replay mark a completed
      // turn as "thinking" again.
      session.status = controller.signal.aborted ? 'cancelled' : 'waiting_user';
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
    this.promptControllers.get(sessionId)?.abort();
    const connectionId = await this.connection();
    await this.client.acp.cancelSession(connectionId, sessionId);
    this.state(sessionId).status = 'cancelled';
    await this.pullEvents();
  }

  private async pullEvents(): Promise<void> {
    if (this.eventsPromise) return this.eventsPromise;
    this.eventsPromise = (async () => {
      const connectionId = await this.connection();
      let response;
      try {
        response = await this.client.acp.events(connectionId);
      } catch (error) {
        this.disconnect(connectionId);
        throw error;
      }
      for (const notification of response.notifications) this.applyNotification(notification);
      if (response.disconnected) {
        this.disconnect(connectionId);
        throw new Error('Astrid ACP disconnected. Reconnect and retry the saved message.');
      }
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

export const projectChatQueryKey = (projectId: string | null | undefined) => ['project-chat', projectId] as const;
export const agentSessionsQueryKey = projectChatQueryKey;
export const agentSessionQueryKey = (sessionId: string | null | undefined, projectId?: string | null) =>
  ['timeline-agent-session', sessionId, projectId] as const;

// Association/selection and draft revisions advance independently. A delayed
// draft reply must not undo a newer selected session, or vice versa.
function mergeProjectChat(current: ProjectChatState | undefined, incoming: ProjectChatState): ProjectChatState {
  if (!current) return incoming;
  const chat = current.revision > incoming.revision ? current : incoming;
  const draft = current.draft.revision > incoming.draft.revision ? current.draft : incoming.draft;
  return chat.draft === draft ? chat : { ...chat, draft };
}

function cacheProjectChat(queryClient: QueryClient, chat: ProjectChatState): void {
  queryClient.setQueryData<ProjectChatState>(projectChatQueryKey(chat.project_id), current => mergeProjectChat(current, chat));
}

export function useAgentSessions(projectId: string | null | undefined) {
  const chat = useProjectChat(projectId);
  const data = useMemo(() => chat.data ? agentStore.projectSessionOptions(chat.data) : undefined, [chat.data]);
  return { ...chat, data };
}

export function useProjectChat(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: projectChatQueryKey(projectId),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const chat = await agentStore.projectChat(projectId!);
      return mergeProjectChat(queryClient.getQueryData<ProjectChatState>(projectChatQueryKey(projectId)), chat);
    },
    refetchInterval: 5_000,
    retry: false,
  });
}

export function useSaveProjectDraft(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      expectedRevision: number;
      text: string;
      queuedMessages: import('@/integrations/astrid/acpRoutes.ts').ProjectChatState['draft']['queued_messages'];
    }) => {
      if (!projectId) throw new Error('projectId is required');
      return agentStore.saveProjectDraft(projectId, input.expectedRevision, input.text, input.queuedMessages);
    },
    onSuccess: (chat) => cacheProjectChat(queryClient, chat),
  });
}

export function useSelectProjectSession(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { expectedRevision: number; sessionId: string | null }) => {
      if (!projectId) throw new Error('projectId is required');
      return agentStore.selectProjectSession(projectId, input.expectedRevision, input.sessionId);
    },
    onSuccess: (chat) => cacheProjectChat(queryClient, chat),
  });
}

export function useAgentSession(sessionId: string | null | undefined, projectId: string | null | undefined) {
  return useQuery({
    queryKey: agentSessionQueryKey(sessionId, projectId),
    enabled: Boolean(sessionId && projectId),
    queryFn: () => agentStore.get(projectId!, sessionId!),
    // ACP events are drained independently of the prompt response so streamed
    // assistant text and tool activity paint while a long turn is running.
    refetchInterval: 500,
    retry: false,
  });
}

export function useCreateSession(projectId: string | null | undefined, mode: 'ensure' | 'new' = 'ensure') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (operationId: string) => {
      if (!projectId) throw new Error('projectId is required');
      if (!operationId) throw new Error('operationId is required');
      return agentStore.create(projectId, mode, operationId);
    },
    onSuccess: async (session) => {
      await queryClient.cancelQueries({ queryKey: projectChatQueryKey(session.chat.project_id) });
      cacheProjectChat(queryClient, session.chat);
      void queryClient.invalidateQueries({ queryKey: agentSessionsQueryKey(session.chat.project_id) });
    },
  });
}

export function useSendMessage(
  sessionId: string | null | undefined,
  editorContext?: AgentChatEditorContext | null,
) {
  const scopeLifetime = useMemo(() => ({ controller: new AbortController() }), [sessionId, editorContext?.projectId]);
  useEffect(() => {
    // Development StrictMode replays effect setup after cleanup on the same
    // mounted scope. Give that setup a fresh signal while retiring old work.
    if (scopeLifetime.controller.signal.aborted) scopeLifetime.controller = new AbortController();
    return () => scopeLifetime.controller.abort();
  }, [scopeLifetime]);
  const scopeRef = useRef({ sessionId, projectId: editorContext?.projectId, mounted: true });
  scopeRef.current.sessionId = sessionId;
  scopeRef.current.projectId = editorContext?.projectId;
  useEffect(() => {
    scopeRef.current.mounted = true;
    return () => { scopeRef.current.mounted = false; };
  }, []);
  const [localError, setLocalError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  useEffect(() => setLocalError(null), [sessionId, editorContext?.projectId]);
  const isCurrent = (message: ProjectAgentMessage) => !scopeLifetime.controller.signal.aborted && scopeRef.current.mounted
    && scopeRef.current.sessionId === message.sessionId
    && scopeRef.current.projectId === message.projectId;
  const mutation = useMutation({
    mutationFn: async (message: ProjectAgentMessage) => {
      if (!message.sessionId) throw new Error('sessionId is required');
      if (!message.projectId || message.context.projectId !== message.projectId) throw new Error('Matching projectId is required');
      if (!isCurrent(message)) throw new Error('Conversation changed before submission.');
      setLocalError(null);
      await agentStore.prompt(message.sessionId, message.input, message.context, () => isCurrent(message), scopeLifetime.controller.signal);
    },
    onSuccess: (_result, message) => {
      void queryClient.invalidateQueries({ queryKey: agentSessionQueryKey(message.sessionId, message.projectId) });
      void queryClient.invalidateQueries({ queryKey: timelineQueryKey(message.context.timelineId) });
      void queryClient.invalidateQueries({ queryKey: assetRegistryQueryKey(message.context.timelineId) });
    },
    onError: (error, message) => {
      if (isCurrent(message)) setLocalError(error instanceof Error ? error.message : String(error));
    },
  });

  useEffect(() => {
    // Detach this observer from a retired session's request. The server work
    // still settles naturally, with its captured scope guarded above.
    mutation.reset();
  }, [scopeLifetime, mutation.reset]);

  return {
    continuationNotice: null,
    clearContinuationNotice: () => undefined,
    localError,
    clearLocalError: () => setLocalError(null),
    ...mutation,
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
