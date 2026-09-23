import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AstridLocalClient } from '@/integrations/astrid/client.ts';
import type { AgentChatEditorContext } from '@/shared/contexts/AgentChatContext.tsx';
import type { AgentTurn, AgentTurnAttachment, AgentSessionStatus } from '@/tools/video-editor/types/agent-session.ts';
import { timelineQueryKey, assetRegistryQueryKey } from '@/tools/video-editor/hooks/useTimeline.ts';
import {
  buildReighAgentContextSnapshot,
  serializeReighAgentContext,
} from '@/tools/video-editor/runtime/reighAgentContext.ts';

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
class AstridAgentSessionStore {
  private readonly client = new AstridLocalClient({
    projectSlug: 'reigh-acp',
    timeoutMs: ACP_PROMPT_TIMEOUT_MS,
  });
  private connectionId: string | null = null;
  private connectionPromise: Promise<string> | null = null;
  private eventsPromise: Promise<void> | null = null;
  private readonly sessions = new Map<string, AgentSessionView>();
  private readonly loaded = new Set<string>();
  private readonly activePrompts = new Set<string>();
  private readonly activePromptTexts = new Map<string, string>();

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

  async list(): Promise<AgentSessionOption[]> {
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

  async create(): Promise<{ id: string }> {
    const connectionId = await this.connection();
    const result = await this.client.acp.createSession(connectionId, { mcpServers: [] });
    const id = sessionIdFromValue(result);
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
  ): Promise<void> {
    const connectionId = await this.connection();
    if (!this.loaded.has(sessionId)) {
      await this.client.acp.loadSession(connectionId, sessionId);
      this.loaded.add(sessionId);
    }

    const contextSnapshot = buildReighAgentContextSnapshot(editorContext, input.attachments ?? []);
    const context = serializeReighAgentContext(contextSnapshot);

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
    this.activePromptTexts.set(sessionId, input.message);
    try {
      await this.client.acp.promptSession(connectionId, sessionId, [
        { type: 'text', text: input.message },
        { type: 'text', text: context },
      ]);
      await this.pullEvents();
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
            try {
              const result = await editorContext.elementOperationAdapter.execute(operation);
              finalContent = `${finalContent}${finalContent ? '\n\n' : ''}${formatElementOperationResult(result)}`;
            } catch (error) {
              finalContent = `${finalContent}${finalContent ? '\n\n' : ''}Element operation failed: ${error instanceof Error ? error.message : String(error)}`;
            }
          }
        }
      }
      this.commitAssistantDraft(session, finalContent);
    } finally {
      this.activePrompts.delete(sessionId);
      this.activePromptTexts.delete(sessionId);
      session.assistantDraft = undefined;
      session.assistantDraftMessageId = undefined;
      // `session/prompt` resolves only after OMP has finished the turn. A
      // concurrent polling request may have drained the final assistant chunk
      // after the response arrived, so do not let that replay mark a completed
      // turn as "thinking" again.
      session.status = 'waiting_user';
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
    const connectionId = await this.connection();
    await this.client.acp.cancelSession(connectionId, sessionId);
    this.state(sessionId).status = 'cancelled';
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

export const agentSessionsQueryKey = (timelineId: string | null | undefined) =>
  ['timeline-agent-sessions', timelineId] as const;
export const agentSessionQueryKey = (sessionId: string | null | undefined) =>
  ['timeline-agent-session', sessionId] as const;

export function useAgentSessions(timelineId: string | null | undefined) {
  return useQuery({
    queryKey: agentSessionsQueryKey(timelineId),
    enabled: Boolean(timelineId),
    queryFn: () => agentStore.list(),
    refetchInterval: 5_000,
    retry: false,
  });
}

export function useAgentSession(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: agentSessionQueryKey(sessionId),
    enabled: Boolean(sessionId),
    queryFn: () => agentStore.get(sessionId!),
    // ACP events are drained independently of the prompt response so streamed
    // assistant text and tool activity paint while a long turn is running.
    refetchInterval: 500,
    retry: false,
  });
}

export function useCreateSession(timelineId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!timelineId) throw new Error('timelineId is required');
      return agentStore.create();
    },
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: agentSessionsQueryKey(timelineId) });
      void queryClient.invalidateQueries({ queryKey: agentSessionQueryKey(session.id) });
    },
  });
}

export function useSendMessage(
  sessionId: string | null | undefined,
  editorContextInput?: AgentChatEditorContext | string | null,
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
  const lastMessageRef = useRef<SendMessageInput | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: SendMessageInput) => {
      if (!sessionId) throw new Error('sessionId is required');
      if (!editorContext?.timelineId) throw new Error('timelineId is required');
      lastMessageRef.current = input;
      await agentStore.prompt(sessionId, input, editorContext);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentSessionQueryKey(sessionId) });
      // Astrid writes through the workspace runtime. Let the editor's normal
      // version-aware persistence/poll path adopt the changed document instead
      // of forcing a blind local-state replacement.
      void queryClient.invalidateQueries({ queryKey: timelineQueryKey(editorContext?.timelineId) });
      void queryClient.invalidateQueries({ queryKey: assetRegistryQueryKey(editorContext?.timelineId) });
    },
    onError: (error) => setLocalError(error instanceof Error ? error.message : String(error)),
  });

  const retryLastMessage = async () => {
    if (!lastMessageRef.current) return null;
    setLocalError(null);
    return await mutation.mutateAsync(lastMessageRef.current);
  };

  return {
    continuationNotice: null,
    clearContinuationNotice: () => undefined,
    localError,
    clearLocalError: () => setLocalError(null),
    hasRetryableMessage: Boolean(lastMessageRef.current),
    retryLastMessage,
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
