import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode, type RefCallback } from 'react';
import { PublicAstridEditorProvider } from './PublicAstridEditorProvider.tsx';
import {
  PublicAstridInitialSelection,
  PublicAstridInspector,
  PublicAstridPlaybackCoordinator,
  PublicAstridPreview,
  PublicAstridTimeline,
} from './PublicAstridEditorParts.tsx';
import type { PublicAstridExampleBundle } from './publicAstridExample.tsx';

export interface PublicAstridMountedEditorProps {
  example: PublicAstridExampleBundle;
  audience: 'app' | 'agent';
  attempt: number;
  active?: boolean;
  transportOutlet: HTMLDivElement | null;
  onTransportOutletChange: (outlet: HTMLDivElement | null) => void;
  playerRef: RefCallback<HTMLElement>;
  inspectorRef: RefCallback<HTMLElement>;
  timelineRef: RefCallback<HTMLElement>;
  chatRef: RefCallback<HTMLElement>;
  transportRef: RefCallback<HTMLDivElement>;
  onConversationReady: (attempt: number) => void;
  onInspectorReady: (attempt: number) => void;
  onTimelineReady: (attempt: number) => void;
  /** Mount the Agent conversation in the background (e.g. once App has finished loading). */
  preloadConversation: boolean;
  /** The conversation is on screen (Agent, once the editor has been revealed). */
  conversationActive: boolean;
  onOpenVerifiedResult: () => void;
}

interface ConversationErrorBoundaryProps {
  children: ReactNode;
  onRetry: () => void;
  onFailure: () => void;
}

interface ConversationErrorBoundaryState {
  hasError: boolean;
}

function createLazyScriptedConversation() {
  return lazy(() => import('./PublicAstridScriptedConversation.tsx').then((module) => ({
    default: module.PublicAstridScriptedConversation,
  })));
}

class ConversationErrorBoundary extends Component<ConversationErrorBoundaryProps, ConversationErrorBoundaryState> {
  state: ConversationErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ConversationErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onFailure();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="astrid-conversation-load-error" role="alert" tabIndex={-1}>
          <p>The example conversation could not be loaded.</p>
          <button type="button" onClick={this.props.onRetry}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Loads the real shared editor only after the light landing shell can paint. */
export function PublicAstridMountedEditor({
  example,
  audience,
  attempt,
  active = true,
  transportOutlet,
  onTransportOutletChange,
  playerRef,
  inspectorRef,
  timelineRef,
  chatRef,
  transportRef,
  onConversationReady,
  onInspectorReady,
  onTimelineReady,
  onOpenVerifiedResult,
  preloadConversation,
  conversationActive,
}: PublicAstridMountedEditorProps) {
  const appView = audience === 'app';
  const agentView = audience === 'agent';
  const [conversationRequested, setConversationRequested] = useState(agentView);
  const [conversationAttempt, setConversationAttempt] = useState(0);
  const [LazyConversation, setLazyConversation] = useState(createLazyScriptedConversation);
  useEffect(() => {
    if (agentView || preloadConversation) setConversationRequested(true);
  }, [agentView, preloadConversation]);
  const retryConversation = useCallback(() => {
    setConversationAttempt((attempt) => attempt + 1);
    setLazyConversation(() => createLazyScriptedConversation());
  }, []);
  const markConversationReady = useCallback(() => onConversationReady(attempt), [attempt, onConversationReady]);
  const markInspectorReady = useCallback(() => onInspectorReady(attempt), [attempt, onInspectorReady]);
  const markTimelineReady = useCallback(() => onTimelineReady(attempt), [attempt, onTimelineReady]);
  const bindTransportOutlet = useCallback((element: HTMLDivElement | null) => {
    transportRef(element);
    onTransportOutletChange(element);
  }, [onTransportOutletChange, transportRef]);

  return (
    <PublicAstridEditorProvider example={example} previewFailureEnabled={active && appView}>
      <PublicAstridInitialSelection />
      <PublicAstridPlaybackCoordinator audience={audience} active={active} />
      <div className="astrid-editor-tilt">
        <div className="astrid-editor-surfaces" data-astrid-editor-root>
          <section
            className="astrid-surface astrid-player-surface"
            ref={playerRef}
            aria-label="Composition preview"
            aria-hidden={!appView}
            data-astrid-player-state={appView ? 'active' : 'background'}
          >
            <PublicAstridPreview transportOutlet={transportOutlet} />
          </section>
          <aside
            className="astrid-surface astrid-inspector-surface"
            ref={inspectorRef}
            id="astrid-public-inspector"
            aria-label="Inspector"
            aria-hidden={!appView}
          >
            <PublicAstridInspector active={active} onReady={markInspectorReady} />
          </aside>
          <section
            className="astrid-surface astrid-timeline-surface"
            ref={timelineRef}
            aria-label="Timeline"
            aria-hidden={!appView}
          >
            <PublicAstridTimeline active={active} onReady={markTimelineReady} />
          </section>
          <aside
            className="astrid-surface astrid-chat-surface"
            ref={chatRef}
            aria-label="Agent conversation"
            aria-hidden={!agentView}
          >
            {conversationRequested && (
              <ConversationErrorBoundary
                key={conversationAttempt}
                onRetry={retryConversation}
                onFailure={markConversationReady}
              >
                <Suspense fallback={<div className="astrid-conversation-loading" role="status">Loading {example.metadata.title} conversation…</div>}>
                  <LazyConversation
                    onReady={markConversationReady}
                    onOpenVerifiedResult={onOpenVerifiedResult}
                    active={conversationActive}
                  />
                </Suspense>
              </ConversationErrorBoundary>
            )}
          </aside>
        </div>
      </div>
      <div
        className="astrid-preview-transport-outlet"
        ref={bindTransportOutlet}
        aria-label="Preview playback controls"
        aria-hidden={!appView}
      />
    </PublicAstridEditorProvider>
  );
}
