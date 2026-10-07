import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
 * A real-looking composer for the example. The exchange above is scripted, so sending doesn't post a
 * message; it explains how to talk to the agent for real instead.
 */
const COMPOSER_NOTE_MS = 3_500;

function ExampleComposer({ active }: { active: boolean }) {
  const [draft, setDraft] = useState('');
  const [explained, setExplained] = useState(false);
  const [noteVisible, setNoteVisible] = useState(false);
  const hideNoteRef = useRef<number | null>(null);
  useEffect(() => {
    if (!active) setNoteVisible(false);
    return () => {
      if (hideNoteRef.current !== null) window.clearTimeout(hideNoteRef.current);
    };
  }, [active]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!active || !draft.trim()) return;
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
  active = true,
}: {
  onReady?: () => void;
  onOpenVerifiedResult: () => void;
  /** Host visibility hint; the static transcript preserves its scroll position across entries. */
  active?: boolean;
}) {
  const example = usePublicAstridExample();
  const presentation = useMemo(
    () => deriveScriptedReplayPresentation(example.script, createInitialScriptedReplayState()),
    [example.script],
  );
  const turns = useMemo<readonly ConversationTurn[]>(() => [{
    role: 'user',
    content: presentation.request,
    timestamp: REQUEST_TIMESTAMP,
  }, {
    role: 'assistant',
    content: presentation.response,
    timestamp: RESPONSE_TIMESTAMP,
  }], [presentation.request, presentation.response]);
  const items = useMemo(() => buildConversationItems(turns), [turns]);

  useEffect(() => {
    // Readiness means the static transcript has mounted, even while its host waits to reveal it.
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
        showHeaderProcessing={false}
        hideEmptyState
        label="Astrid"
        avatarSrc="/astrid-mink-provisional.webp"
        scrollContainerTabIndex={0}
        footer={(
          <div className="astrid-conversation-footer">
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
            <ExampleComposer active={active} />
          </div>
        )}
      />
    </section>
  );
}
