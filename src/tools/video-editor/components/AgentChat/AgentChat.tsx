import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Loader2, MessageSquareText, Mic, Send, Square, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { GenerationRow } from '@/domains/generation/types';
import { MediaLightbox } from '@/domains/media-lightbox/MediaLightbox';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/components/ui/contracts/cn';
import { useGallerySelection } from '@/shared/contexts/GallerySelectionContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useAgentSession, useAgentSessions, useCancelSession, useCreateSession, useSendMessage } from '@/tools/video-editor/hooks/useAgentSession';
import {
  buildSummary,
  useSelectedMediaClips,
  type SelectedMediaClip,
} from '@/tools/video-editor/hooks/useSelectedMediaClips';
import { useAgentVoice } from '@/tools/video-editor/hooks/useAgentVoice';
import { useRenderDiagnostic } from '@/tools/video-editor/hooks/usePerfDiagnostics';
import { loadGenerationForLightbox } from '@/tools/video-editor/lib/generation-utils';
import type { AgentTurn } from '@/tools/video-editor/types/agent-session';
import { AgentChatAttachmentStrip, AgentChatMessage, AgentChatToolGroup, type AgentChatAttachmentPreviewItem } from './AgentChatMessage';

type AgentChatProps = {
  timelineId: string;
};

export type ToolCallPair = {
  call: AgentTurn;
  result: AgentTurn | null;
};

export type RenderedTurn =
  | { kind: 'message'; key: string; turn: AgentTurn }
  | { kind: 'tool_group'; key: string; pairs: ToolCallPair[] };

function mergeSelectedClips(
  timelineClips: SelectedMediaClip[],
  galleryClips: SelectedMediaClip[],
): SelectedMediaClip[] {
  const clipsByUrl = new Map<string, SelectedMediaClip>();

  for (const clip of [...timelineClips, ...galleryClips]) {
    const existing = clipsByUrl.get(clip.url);
    // Prefer gallery entries when the same URL exists in both panes because they retain
    // generationId metadata that timeline clips for that asset may not carry.
    if (!existing || (!existing.generationId && clip.generationId)) {
      clipsByUrl.set(clip.url, clip);
    }
  }

  return Array.from(clipsByUrl.values());
}

function buildRenderedTurns(turns: AgentTurn[]): RenderedTurn[] {
  const items: RenderedTurn[] = [];
  let pendingToolPairs: ToolCallPair[] = [];
  let toolGroupStartIndex = 0;

  const flushToolGroup = () => {
    if (pendingToolPairs.length === 0) return;
    items.push({
      kind: 'tool_group',
      key: `tool-group:${toolGroupStartIndex}`,
      pairs: pendingToolPairs,
    });
    pendingToolPairs = [];
  };

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];

    if (turn.role === 'tool_result') {
      continue;
    }

    if (turn.role === 'tool_call') {
      const nextTurn = turns[index + 1];
      const pairedResult = nextTurn?.role === 'tool_result' ? nextTurn : null;

      if (pendingToolPairs.length === 0) {
        toolGroupStartIndex = index;
      }
      pendingToolPairs.push({ call: turn, result: pairedResult });
      if (pairedResult) index += 1;
      continue;
    }

    flushToolGroup();

    // Skip assistant messages that duplicate a preceding message_user result
    if (turn.role === 'assistant' && items.length > 0) {
      const prev = items[items.length - 1];
      if (prev.kind === 'message' && prev.turn.content === turn.content) {
        continue;
      }
    }

    items.push({
      kind: 'message',
      key: `${turn.timestamp}:${turn.role}:${index}`,
      turn,
    });
  }

  flushToolGroup();
  return items;
}

export function AgentChat({ timelineId }: AgentChatProps) {
  useRenderDiagnostic('AgentChat');
  const sessions = useAgentSessions(timelineId);
  const createSession = useCreateSession(timelineId);
  const { isTasksPaneLocked, tasksPaneWidth, isGenerationsPaneLocked, isGenerationsPaneOpen, effectiveGenerationsPaneHeight } = usePanes();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [optimisticMessage, setOptimisticMessage] = useState<string | null>(null);
  const [attachmentLightboxMedia, setAttachmentLightboxMedia] = useState<GenerationRow | null>(null);
  const hasAutoCreatedSessionRef = useRef(false);
  const lightboxRequestIdRef = useRef(0);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const positionStyle = useMemo<CSSProperties>(() => ({
    right: isTasksPaneLocked ? tasksPaneWidth + 20 : 20,
    bottom: (isGenerationsPaneLocked || isGenerationsPaneOpen) ? effectiveGenerationsPaneHeight + 20 : 20,
    transition: 'right 300ms cubic-bezier(0.25, 0.1, 0.25, 1), bottom 300ms cubic-bezier(0.25, 0.1, 0.25, 1)',
  }), [isTasksPaneLocked, tasksPaneWidth, isGenerationsPaneLocked, isGenerationsPaneOpen, effectiveGenerationsPaneHeight]);

  const activeSession = useAgentSession(activeSessionId);
  const sendMessage = useSendMessage(activeSessionId, timelineId);
  const cancelSession = useCancelSession(activeSessionId);
  const sessionOptions = useMemo(() => sessions.data ?? [], [sessions.data]);
  const { clips: timelineClips } = useSelectedMediaClips();
  const {
    selectedGalleryClips,
    clearGallerySelection,
  } = useGallerySelection();
  const clips = useMemo(
    () => mergeSelectedClips(timelineClips, selectedGalleryClips),
    [selectedGalleryClips, timelineClips],
  );
  const summary = useMemo(() => {
    const imageCount = clips.filter((clip) => clip.mediaType === 'image').length;
    return buildSummary(imageCount, clips.length - imageCount);
  }, [clips]);

  const voice = useAgentVoice({
    onTranscription: (text) => {
      void handleSend(text);
    },
  });

  const renderedTurns = useMemo(
    () => buildRenderedTurns(activeSession.data?.turns ?? []),
    [activeSession.data?.turns],
  );
  const activeStatus = activeSession.data?.status;
  const isCancelled = activeStatus === 'cancelled';
  const isProcessing = activeStatus === 'processing' || activeStatus === 'continue';
  const showKillSwitch = activeStatus === 'processing' || activeStatus === 'continue';

  const handleAttachmentPreviewClick = useCallback(async (attachment: AgentChatAttachmentPreviewItem) => {
    if (!attachment.generationId) {
      return;
    }

    const requestId = lightboxRequestIdRef.current + 1;
    lightboxRequestIdRef.current = requestId;
    setAttachmentLightboxMedia(null);

    try {
      const media = await loadGenerationForLightbox(attachment.generationId);
      if (lightboxRequestIdRef.current !== requestId) {
        return;
      }

      setAttachmentLightboxMedia(media);
    } catch (error) {
      if (lightboxRequestIdRef.current === requestId) {
        setAttachmentLightboxMedia(null);
      }
      console.warn('[AgentChat] Failed to open attachment lightbox', error);
    }
  }, []);

  const handleCloseAttachmentLightbox = useCallback(() => {
    lightboxRequestIdRef.current += 1;
    setAttachmentLightboxMedia(null);
  }, []);

  // Auto-select or create session
  useEffect(() => {
    if (!sessionOptions.length) {
      setActiveSessionId(null);
      return;
    }

    setActiveSessionId((current) => {
      const currentSession = current
        ? sessionOptions.find((session) => session.id === current) ?? null
        : null;
      if (currentSession && currentSession.status !== 'cancelled') {
        return current;
      }

      const preferredSession = sessionOptions.find((session) => session.status !== 'cancelled');
      if (preferredSession) {
        return preferredSession.id;
      }

      if (currentSession) {
        return currentSession.id;
      }

      return sessionOptions[0]?.id ?? null;
    });
  }, [sessionOptions]);

  // Auto-create session when needed (only when chat is open or voice is active)
  useEffect(() => {
    if (
      hasAutoCreatedSessionRef.current
      || sessions.isLoading
      || createSession.isPending
      || sessionOptions.length > 0
      || (!isOpen && !voice.isRecording && !voice.isProcessing)
    ) {
      return;
    }

    hasAutoCreatedSessionRef.current = true;
    createSession.mutate(undefined, {
      onError: () => { hasAutoCreatedSessionRef.current = false; },
      onSuccess: (session) => { setActiveSessionId(session.id); },
    });
  }, [createSession, sessionOptions.length, sessions.isLoading, isOpen, voice.isRecording, voice.isProcessing]);

  // Scroll to bottom helper
  const scrollToBottom = useCallback((smooth = true) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: smooth ? 'smooth' : 'instant',
      });
    });
  }, []);

  // Auto-scroll on new turns or processing state change
  useEffect(() => {
    scrollToBottom();
  }, [renderedTurns, isProcessing, optimisticMessage, scrollToBottom]);

  // Scroll to bottom when opening the chat
  useEffect(() => {
    if (isOpen) {
      scrollToBottom(false);
    }
  }, [isOpen, scrollToBottom]);

  // Cmd+Shift+R global shortcut — toggle recording without opening chat
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        if (voice.isRecording) {
          voice.stopRecording();
        } else if (!voice.isProcessing) {
          voice.startRecording();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [voice]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Clear optimistic message only when the matching turn appears in real data
  useEffect(() => {
    if (!optimisticMessage || !activeSession.data?.turns) return;
    const hasRealTurn = activeSession.data.turns.some(
      (t) => t.role === 'user' && t.content === optimisticMessage,
    );
    if (hasRealTurn) {
      setOptimisticMessage(null);
    }
  }, [activeSession.data?.turns, optimisticMessage]);

  const sendingRef = useRef(false);
  const handleSend = useCallback(async (rawText?: string) => {
    const text = (rawText ?? draft).trim();
    if (!text || !activeSessionId || sendingRef.current) return;

    const attachments = clips.map((clip) => ({
      clipId: clip.clipId,
      url: clip.url,
      mediaType: clip.mediaType,
      generationId: clip.generationId,
    }));

    if (rawText === undefined) setDraft('');
    setOptimisticMessage(text);
    sendingRef.current = true;
    try {
      await sendMessage.mutateAsync({ message: text, attachments });
      clearGallerySelection();
    } finally {
      sendingRef.current = false;
      // Don't clear optimisticMessage here — let the effect clear it
      // when the real turn arrives, avoiding a flash.
    }
  }, [activeSessionId, clearGallerySelection, clips, draft, sendMessage]);

  const handleNewSession = useCallback(async () => {
    const session = await createSession.mutateAsync();
    setActiveSessionId(session.id);
    setDraft('');
  }, [createSession]);

  const hasMessages = renderedTurns.length > 0;
  let content: JSX.Element;

  if (!isOpen && (voice.isRecording || voice.isProcessing)) {
    content = (
      <div className="fixed z-50 flex items-center gap-3" style={positionStyle}>
        <div className="flex items-center gap-2 rounded-full border border-border/80 bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur">
          {voice.isRecording ? (
            <>
              <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              <div className="flex min-w-0 flex-col">
                <span className="text-sm text-foreground">Recording... {voice.remainingSeconds}s</span>
                {clips.length > 0 && (
                  <span className="text-xs text-muted-foreground">{summary}</span>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => voice.stopRecording()}
              >
                Done
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Transcribing...</span>
            </>
          )}
        </div>
      </div>
    );
  } else if (!isOpen) {
    content = (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          'group fixed z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95',
          'bg-primary text-primary-foreground',
        )}
        style={positionStyle}
        title="Timeline Agent (Cmd+Shift+R to talk)"
      >
        <MessageSquareText className="h-6 w-6" />
        {hasMessages && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-500" />
          </span>
        )}
      </button>
    );
  } else {
    content = (
      <div className="fixed z-50 flex h-[min(520px,calc(100vh-3rem))] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-background/95 shadow-2xl backdrop-blur" style={positionStyle}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Timeline Agent</span>
            {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-1">
            {showKillSwitch && (
              <Button
                type="button"
                size="icon"
                variant="destructive"
                className="h-7 w-7"
                onClick={() => cancelSession.mutate()}
                disabled={cancelSession.isPending}
                title="Stop agent"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => void handleNewSession()}
              disabled={createSession.isPending}
            >
              New
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {activeSession.isLoading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          )}

          {!activeSession.isLoading && renderedTurns.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <p>Ask me to edit your timeline.</p>
              <p className="mt-1 text-xs">Press <kbd className="rounded border border-border px-1 py-0.5 text-[10px]">Cmd+Shift+R</kbd> to talk</p>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {renderedTurns.map((item) =>
              item.kind === 'message' ? (
                <AgentChatMessage
                  key={item.key}
                  turn={item.turn}
                  onAttachmentClick={handleAttachmentPreviewClick}
                />
              ) : (
                <AgentChatToolGroup key={item.key} pairs={item.pairs} />
              ),
            )}

            {optimisticMessage && (
              <div className="flex w-full justify-end">
                <div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm">
                  {optimisticMessage}
                </div>
              </div>
            )}

            {(isProcessing || sendMessage.isPending || optimisticMessage) && (
              <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking...
              </div>
            )}
          </div>

          <div ref={bottomAnchorRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-border/70 px-3 py-3">
          {clips.length > 0 && (
            <div className="mb-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <AgentChatAttachmentStrip
                attachments={clips}
                isUser={false}
                className="mt-0"
                onAttachmentClick={handleAttachmentPreviewClick}
              />
              <div className="mt-2">{summary}</div>
            </div>
          )}

          {voice.isRecording && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-red-500/10 px-3 py-2 text-sm">
              <div className="flex items-center gap-2 text-red-400">
                <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-red-500" />
                Recording... {voice.remainingSeconds}s
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
                onClick={() => voice.stopRecording()}
              >
                Done
              </Button>
            </div>
          )}

          {voice.isProcessing && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Transcribing...
            </div>
          )}

          {!isProcessing && !sendMessage.isPending && isCancelled && (
            <div className="mb-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Session stopped. Start a new conversation to continue.
            </div>
          )}

          {!isProcessing && !sendMessage.isPending && !isCancelled && (sendMessage.localError || activeStatus === 'error') && (
            <div className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {sendMessage.localError ?? 'Agent error. Try again or start a new conversation.'}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={voice.isRecording ? 'Recording...' : 'Type or press Cmd+Shift+R to talk...'}
              className="h-10 flex-1 rounded-xl border border-border/70 bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/50"
              disabled={!activeSessionId || isCancelled || isProcessing || voice.isRecording || voice.isProcessing}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
            />

            <div className="relative shrink-0">
              <Button
                type="button"
                size="icon"
                variant={voice.isRecording ? 'destructive' : 'outline'}
                className="h-10 w-10 rounded-xl"
                onClick={() => voice.isRecording ? voice.stopRecording() : voice.startRecording()}
                disabled={!activeSessionId || isCancelled || voice.isProcessing || sendMessage.isPending}
                title={voice.isRecording ? 'Stop recording' : 'Voice input (Cmd+Shift+R)'}
              >
                {voice.isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              {voice.isRecording && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-muted hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => voice.cancelRecording()}
                  title="Cancel recording"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            <Button
              type="button"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl"
              onClick={() => void handleSend()}
              disabled={!draft.trim() || !activeSessionId || isCancelled || isProcessing || sendMessage.isPending}
              title="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {attachmentLightboxMedia && (
          <MediaLightbox
            media={attachmentLightboxMedia}
            initialVariantId={attachmentLightboxMedia.primary_variant_id ?? undefined}
            onClose={handleCloseAttachmentLightbox}
            features={{ showDownload: true, showTaskDetails: true }}
          />
        )}
      </div>
    );
  }

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(content, document.body);
}
