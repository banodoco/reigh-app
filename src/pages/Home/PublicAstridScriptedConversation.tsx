import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import { userSelectTimelineClip } from '@/shared/state/selectionStore.ts';
import {
  buildConversationItems,
  ConversationPresentation,
  type ConversationTurn,
} from '@/shared/components/conversation/index.ts';
import { usePublicAstridExample } from './publicAstridExample.tsx';
import { formatPublicAstridExampleClipCount, formatPublicAstridExampleDuration } from './publicAstridExampleSelection.ts';
import { createInitialScriptedReplayState, deriveScriptedReplayPresentation } from './replay/scriptedReplay.ts';

const REQUEST_TIMESTAMP = '2026-09-01T10:00:00.000Z';
const RESPONSE_TIMESTAMP = '2026-09-01T10:00:12.000Z';

/**
 * The first time the conversation becomes active it plays out a short exchange. The request and the
 * agent's "Thinking..." are already in the thread when the chat opens, and the reply arrives a moment
 * later. Once seen through to the reply, later visits show the finished exchange. Timed from activation.
 */
type IntroPhase = 'thinking' | 'replied';
const INTRO_REPLY_MS = 3_000;

/**
 * A real-looking composer for the example. The exchange above is scripted, so sending doesn't post a
 * message; it explains how to talk to the agent for real instead.
 */
const COMPOSER_NOTE_MS = 3_500;

function ExampleComposer() {
  const [draft, setDraft] = useState('');
  const [explained, setExplained] = useState(false);
  const [noteVisible, setNoteVisible] = useState(false);
  const hideNoteRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (hideNoteRef.current !== null) window.clearTimeout(hideNoteRef.current);
  }, []);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setDraft('');
    setExplained(true);
    setNoteVisible(true);
    // The note floats above the field briefly, then fades away; sending again restarts it.
    if (hideNoteRef.current !== null) window.clearTimeout(hideNoteRef.current);
    hideNoteRef.current = window.setTimeout(() => setNoteVisible(false), COMPOSER_NOTE_MS);
  };
  return (
    <form className="astrid-composer" onSubmit={submit}>
      <div className="astrid-composer-field">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask Astrid to edit your project…"
          aria-label="Message Astrid"
        />
        <button type="submit" aria-label="Send message" disabled={!draft.trim()}>
          <ArrowUp size={15} aria-hidden="true" />
        </button>
      </div>
      <p className="astrid-composer-note" role="status" data-visible={noteVisible}>
        {explained ? 'This conversation is a scripted example. Install the agent to try your own.' : ''}
      </p>
    </form>
  );
}

export function PublicAstridScriptedConversation({
  onReady,
  onOpenVerifiedResult,
  active,
}: {
  onReady?: () => void;
  onOpenVerifiedResult: () => void;
  /**
   * Whether the conversation is on screen. When provided, the first activation plays the send → think →
   * reply exchange (until then it waits empty). When omitted, it shows the finished exchange.
   */
  active?: boolean;
}) {
  const example = usePublicAstridExample();
  // The thread stays pinned to its latest message (on entering Agent, while the card expands, as the
  // reply arrives) unless the reader has deliberately scrolled up.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  useEffect(() => {
    if (active) pinnedRef.current = true;
  }, [active]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const pin = () => { if (pinnedRef.current) el.scrollTop = el.scrollHeight; };
    const onScroll = () => { pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8; };
    el.addEventListener('scroll', onScroll, { passive: true });
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(pin);
    resizeObserver?.observe(el);
    if (el.firstElementChild) resizeObserver?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', onScroll);
      resizeObserver?.disconnect();
    };
  }, []);
  const presentation = useMemo(
    () => deriveScriptedReplayPresentation(example.script, createInitialScriptedReplayState()),
    [example.script],
  );
  const [introPhase, setIntroPhase] = useState<IntroPhase>(active === undefined ? 'replied' : 'thinking');
  const introSeenRef = useRef(false);
  useEffect(() => {
    if (introPhase === 'replied') introSeenRef.current = true;
  }, [introPhase]);
  useEffect(() => {
    if (active === undefined || introSeenRef.current) return undefined;
    // Left before the reply arrived: start over next time.
    if (!active) {
      setIntroPhase('thinking');
      return undefined;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIntroPhase('replied');
      return undefined;
    }
    setIntroPhase('thinking');
    const timer = window.setTimeout(() => setIntroPhase('replied'), INTRO_REPLY_MS);
    return () => window.clearTimeout(timer);
  }, [active]);
  const replyVisible = introPhase === 'replied';
  const thinking = introPhase === 'thinking';
  const turns = useMemo<readonly ConversationTurn[]>(() => {
    const request: ConversationTurn = {
      role: 'user',
      content: presentation.request,
      timestamp: REQUEST_TIMESTAMP,
    };
    if (replyVisible) {
      return [request, {
        role: 'assistant',
        content: presentation.response,
        timestamp: RESPONSE_TIMESTAMP,
      }];
    }
    return [request];
  }, [presentation.request, presentation.response, replyVisible]);
  const items = useMemo(() => buildConversationItems(turns), [turns]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const verifiedResultTarget = example.providerBinding.state === 'verified'
    && example.verifiedResult.state === 'verified'
    ? example.resultTarget
    : null;
  const resultIsUnavailable = verifiedResultTarget === null;
  const openVerifiedResult = useCallback(() => {
    if (!verifiedResultTarget) return;
    userSelectTimelineClip(verifiedResultTarget.clipId, { additive: false });
    onOpenVerifiedResult();
  }, [onOpenVerifiedResult, verifiedResultTarget]);

  return (
    <section className="astrid-scripted-conversation" aria-label="Scripted example conversation" tabIndex={-1}>
      <ConversationPresentation
        items={items}
        isProcessing={thinking}
        showHeaderProcessing={false}
        hideEmptyState
        label="Astrid"
        avatarSrc="/astrid-mink-provisional.webp"
        scrollContainerRef={scrollRef}
        scrollContainerTabIndex={0}
        footer={(
          <div className="astrid-conversation-footer">
            {/* The result is the outcome of the exchange, so it arrives with the reply. */}
            {replyVisible && (
              <article className="astrid-example-result" aria-label={`${example.metadata.title} example result status`}>
                <img src={example.metadata.posterUrl} alt="" />
                <div>
                  <strong>{example.metadata.title}</strong>
                  <span>{formatPublicAstridExampleDuration(example.timelineSummary.durationSeconds)} · {formatPublicAstridExampleClipCount(example.timelineSummary.clipCount)}</span>
                  <p>{resultIsUnavailable ? 'Example result unavailable until a verified render.' : `Verified ${example.metadata.title} result available.`}</p>
                  {verifiedResultTarget && (
                    <button
                      type="button"
                      className="astrid-result-handoff-button"
                      onClick={openVerifiedResult}
                    >
                      Open in Workspace Preview
                    </button>
                )}
              </div>
            </article>
            )}
            <ExampleComposer />
          </div>
        )}
      />
    </section>
  );
}
