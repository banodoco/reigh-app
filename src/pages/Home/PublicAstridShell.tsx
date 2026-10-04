import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode, type RefCallback } from 'react';
import { flushSync } from 'react-dom';
import { ArrowUpRight } from 'lucide-react';
import { retargetMotionTiming, type PublicAstridExperience, type PublicAstridMotionClock, type PublicAstridMotionTiming } from './publicAstridMotion';
import { ACTIVE_PUBLIC_ASTRID_EXAMPLE_METADATA, loadActivePublicAstridExample } from './publicAstridExampleSelection.ts';
import type { PublicAstridMountedEditorProps } from './PublicAstridMountedEditor.tsx';
import { PublicAstridCallouts } from './PublicAstridCallouts.tsx';
import { PublicAstridHeroCta } from './PublicAstridHeroCta.tsx';
import { MinkRunner } from '@/shared/components/MinkRunner/MinkRunner';
import './PublicAstridShell.css';
import { PublicAstridSocialLinks } from './PublicAstridSocialLinks.tsx';
import { usePublicAstridLayoutGlide } from './usePublicAstridLayoutGlide';
import { followInPage, VISION_PATH } from './publicAstridLinks';
import {
  DEFAULT_PUBLIC_ASTRID_SKY_SETTINGS,
  PUBLIC_ASTRID_SKY_REPLAY_MS,
  PUBLIC_ASTRID_SKY_REPLAY_SETTLE_MS,
  PUBLIC_ASTRID_SKY_REPLAY_TURN_MS,
  applyPageDusk, PublicAstridSky, PublicAstridSkyReview, setRootPaper, wantsPublicAstridSkyReview } from './PublicAstridSky.tsx';
import { duskTokens, pageDusk, skyDarknessAt, themeForDarkness, type PublicAstridSkyTheme } from './publicAstridSkyRender';

const EDITOR_RELOAD_PENDING_KEY = 'astrid-public-editor-reload-pending';
/** The editor stays hidden until its first frame and side panel are ready, so it assembles in one piece. */
const EDITOR_REVEAL_TIMEOUT_MS = 2_500;
const EDITOR_REVEAL_MEDIA_GRACE_MS = 900;
/** Keep in step with the App player width in PublicAstridShell.css. */
const PLAYER_WIDTH = 0.7;

async function loadPublicAstridMountedEditor() {
  const [module, example] = await Promise.all([
    import('./PublicAstridMountedEditor.tsx'),
    loadActivePublicAstridExample(),
  ]);
  const MountedEditor = module.PublicAstridMountedEditor;
  return {
    default: (props: Omit<PublicAstridMountedEditorProps, 'example'>) => (
      <MountedEditor {...props} example={example} />
    ),
  };
}

function isDynamicImportFailure(error: Error): boolean {
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|MIME type/i.test(error.message);
}

interface EditorChunkBoundaryProps {
  attempt: number;
  children: ReactNode;
  fallback: ReactNode;
  onChunkFailure: (attempt: number, error: Error) => void;
}

interface EditorChunkBoundaryState {
  attempt: number;
  error: Error | null;
}

/** Keeps a failed editor import inside its reserved stage and can reset for a fresh lazy attempt. */
class EditorChunkBoundary extends Component<EditorChunkBoundaryProps, EditorChunkBoundaryState> {
  constructor(props: EditorChunkBoundaryProps) {
    super(props);
    this.state = { attempt: props.attempt, error: null };
  }

  static getDerivedStateFromProps(
    props: EditorChunkBoundaryProps,
    state: EditorChunkBoundaryState,
  ): Partial<EditorChunkBoundaryState> | null {
    return props.attempt === state.attempt ? null : { attempt: props.attempt, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<EditorChunkBoundaryState> {
    if (!isDynamicImportFailure(error)) throw error;
    return { error };
  }

  componentDidCatch(error: Error): void {
    this.props.onChunkFailure(this.props.attempt, error);
  }

  render() {
    if (this.state.error && this.state.attempt === this.props.attempt) return this.props.fallback;
    return this.props.children;
  }
}

function EditorChunkReady({ attempt, onReady }: { attempt: number; onReady: (attempt: number) => void }) {
  useEffect(() => onReady(attempt), [attempt, onReady]);
  return null;
}

type ExperienceState = PublicAstridExperience;
type MotionTiming = PublicAstridMotionTiming;

function useInactiveSurface<T extends HTMLElement = HTMLElement>(inactive: boolean): RefCallback<T> {
  return useCallback((surface: T | null) => {
    if (!surface) return;
    if (inactive) surface.setAttribute('inert', '');
    else surface.removeAttribute('inert');
  }, [inactive]);
}


const HERO_SUBTITLE: Record<ExperienceState['audience'], string> = {
  app: 'An agent-powered video editor built to unlock the artistic potential of open-source models.',
  agent: 'An editor-powered creative agent built to unlock the artistic potential of open-source models.',
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

/**
 * Switching audience also switches theme (light App, dark Agent). A root View Transition crossfades the
 * whole page in one piece — the old view stays frozen while the live new one fades in over it — so no
 * element can flash its new colour early. Without View Transitions the flat elements crossfade in CSS.
 */
function drawnAt(element: Element, x: number, y: number) {
  const box = element.getBoundingClientRect();
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

function runThemeFade(commit: () => void, reducedMotion: boolean) {
  const doc = document as ViewTransitionDocument;
  if (reducedMotion || typeof doc.startViewTransition !== 'function') {
    commit();
    return;
  }
  doc.startViewTransition(() => flushSync(commit));
}

function readExperienceState(): ExperienceState {
  const search = new URLSearchParams(window.location.search);
  return {
    audience: search.get('experience') === 'agent' ? 'agent' : 'app',
  };
}

function routeAnnouncement(state: ExperienceState): string {
  return state.audience === 'app' ? 'App.' : 'Agent.';
}

function sameExperience(left: ExperienceState, right: ExperienceState): boolean {
  return left.audience === right.audience;
}

export function PublicAstridShell({ onOpenVision }: { onOpenVision?: () => void } = {}) {
  const [state, setState] = useState<ExperienceState>(readExperienceState);
  const [hasViewedAgent, setHasViewedAgent] = useState(() => state.audience === 'agent');
  useEffect(() => {
    if (state.audience === 'agent') setHasViewedAgent(true);
  }, [state.audience]);
  const [transportOutlet, setTransportOutlet] = useState<HTMLDivElement | null>(null);
  const editorStageRef = useRef<HTMLDivElement>(null);
  const editorFailurePanelRef = useRef<HTMLDivElement>(null);
  const editorAttemptRef = useRef(0);
  const editorLoadStatusRef = useRef<'initial' | 'loading' | 'failed' | 'ready'>('initial');
  const editorShellMountedRef = useRef(false);
  const editorReloadPendingRef = useRef(false);
  const [editorAttempt, setEditorAttempt] = useState(0);
  const [editorRetryCount, setEditorRetryCount] = useState(0);
  const [editorLoadStatus, setEditorLoadStatus] = useState<'initial' | 'loading' | 'failed' | 'ready'>('initial');
  const [editorReloadFollowup, setEditorReloadFollowup] = useState(false);
  const [LazyPublicAstridMountedEditor, setLazyPublicAstridMountedEditor] = useState(
    () => lazy(loadPublicAstridMountedEditor),
  );
  const [conversationReady, setConversationReady] = useState(false);
  const [editorRevealed, setEditorRevealed] = useState(false);
  // The loading runner unmounts once the editor has faded in, so nothing keeps animating unseen.
  const [loaderRetired, setLoaderRetired] = useState(false);
  const [routeStatusMessage, setRouteStatusMessage] = useState('');
  const [sky, setSky] = useState(DEFAULT_PUBLIC_ASTRID_SKY_SETTINGS);
  // The page's colours follow how dark the visitor's sky is, not the App/Agent switch, and change
  // gradually through twilight (see the dusk rules in PublicAstridShell.css).
  const mainRef = useRef<HTMLElement>(null);
  const [theme, setTheme] = useState<PublicAstridSkyTheme>(() => themeForDarkness(skyDarknessAt(new Date())));
  const themeRef = useRef(theme);
  const duskRef = useRef(pageDusk(skyDarknessAt(new Date())));
  const duskTokensRef = useRef(duskTokens(skyDarknessAt(new Date())));
  const [skyReview] = useState(wantsPublicAstridSkyReview);
  // Easter egg: clicking the mink turns her to face you, then she moves the sky through a whole day by
  // telekinesis (glowing eyes, psychic rings, a slight levitation) before turning back.
  const [skyReplayStartedAt, setSkyReplayStartedAt] = useState<number | null>(null);
  const [minkPose, setMinkPose] = useState<'profile' | 'facing' | 'focus'>('profile');
  const minkTimers = useRef<number[]>([]);
  useEffect(() => {
    for (const src of ['/astrid-mink-front.png', '/astrid-mink-focus.png', '/astrid-mink-psychic.png', '/astrid-mink-glint.png']) new Image().src = src;
    const timers = minkTimers.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);
  const endSkyReplay = useCallback(() => {
    setSkyReplayStartedAt(null);
    setMinkPose('profile');
  }, []);
  const playSkyDay = () => {
    if (minkPose !== 'profile') return;
    setMinkPose('facing');
    // With reduced motion she still turns to look, but the sky stays put.
    if (prefersReducedMotion || !sky.enabled) {
      minkTimers.current.push(window.setTimeout(endSkyReplay, 1200));
      return;
    }
    setSkyReplayStartedAt(performance.now());
    minkTimers.current.push(
      window.setTimeout(() => setMinkPose('focus'), PUBLIC_ASTRID_SKY_REPLAY_TURN_MS),
      window.setTimeout(() => setMinkPose('facing'), PUBLIC_ASTRID_SKY_REPLAY_MS - PUBLIC_ASTRID_SKY_REPLAY_SETTLE_MS),
    );
  };
  const minkSrc = { profile: '/astrid-mink-provisional.webp', facing: '/astrid-mink-front.png', focus: '/astrid-mink-focus.png' }[minkPose];
  const [routeAnnouncementGeneration, setRouteAnnouncementGeneration] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const stateRef = useRef(state);
  const motionClockRef = useRef<PublicAstridMotionClock>(null);
  const reducedMotionRef = useRef(prefersReducedMotion);
  const landingGridRef = useRef<HTMLElement>(null);
  usePublicAstridLayoutGlide(landingGridRef, prefersReducedMotion);
  const routeAnnouncementGenerationRef = useRef(0);
  const pendingRouteAnnouncementRef = useRef<{ generation: number; state: ExperienceState } | null>(null);
  const lastAnnouncedExperienceRef = useRef<ExperienceState | null>(null);
  const initialRouteAnnouncementDoneRef = useRef(false);
  const lastHistoryChangeRef = useRef(0);
  const pendingAudienceFocusRef = useRef<'agent' | 'launcher' | null>(null);
  const [motionTiming, setMotionTiming] = useState<MotionTiming>({
    duration: 600,
    assemblyDelay: 0,
    assemblyDuration: 240,
    surfaceDelay: 240,
    surfaceDuration: 360,
    labelDelay: 480,
    labelDuration: 120,
  });
  const appView = state.audience === 'app';
  const agentView = state.audience === 'agent';
  const playerRef = useInactiveSurface(!appView);
  const transportRef = useInactiveSurface<HTMLDivElement>(!appView);
  const chatRef = useInactiveSurface(!agentView);
  const showTimeline = appView;
  const onConversationReady = useCallback(() => setConversationReady(true), []);
  const inspectorRef = useInactiveSurface(!appView);
  const timelineRef = useInactiveSurface(!showTimeline);

  const queueRouteAnnouncement = useCallback((nextState: ExperienceState) => {
    const generation = routeAnnouncementGenerationRef.current + 1;
    routeAnnouncementGenerationRef.current = generation;
    pendingRouteAnnouncementRef.current = { generation, state: nextState };
    setRouteAnnouncementGeneration(generation);
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onPreferenceChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches;
      setPrefersReducedMotion(event.matches);
      if (pendingRouteAnnouncementRef.current) {
        queueRouteAnnouncement(pendingRouteAnnouncementRef.current.state);
      }
    };
    if (query.addEventListener) query.addEventListener('change', onPreferenceChange);
    else query.addListener?.(onPreferenceChange);
    return () => {
      if (query.removeEventListener) query.removeEventListener('change', onPreferenceChange);
      else query.removeListener?.(onPreferenceChange);
    };
  }, [queueRouteAnnouncement]);

  useEffect(() => {
    reducedMotionRef.current = prefersReducedMotion;
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (!initialRouteAnnouncementDoneRef.current) {
      initialRouteAnnouncementDoneRef.current = true;
      lastAnnouncedExperienceRef.current = state;
      setRouteStatusMessage(routeAnnouncement(state));
      return undefined;
    }

    const pending = pendingRouteAnnouncementRef.current;
    if (!pending || pending.generation !== routeAnnouncementGeneration) return undefined;
    if (!sameExperience(pending.state, state)) return undefined;
    if (lastAnnouncedExperienceRef.current && sameExperience(lastAnnouncedExperienceRef.current, state)) {
      pendingRouteAnnouncementRef.current = null;
      return undefined;
    }

    const generation = pending.generation;
    const preferenceAtSchedule = prefersReducedMotion;
    let active = true;
    let timeout: number | null = null;
    let frame: number | null = null;
    const publish = () => {
      if (!active
        || routeAnnouncementGenerationRef.current !== generation
        || reducedMotionRef.current !== preferenceAtSchedule
        || !sameExperience(stateRef.current, pending.state)) return;
      if (lastAnnouncedExperienceRef.current && sameExperience(lastAnnouncedExperienceRef.current, pending.state)) {
        pendingRouteAnnouncementRef.current = null;
        return;
      }
      lastAnnouncedExperienceRef.current = pending.state;
      pendingRouteAnnouncementRef.current = null;
      setRouteStatusMessage(routeAnnouncement(pending.state));
    };

    if (preferenceAtSchedule) frame = window.requestAnimationFrame(publish);
    else timeout = window.setTimeout(publish, motionTiming.duration);
    return () => {
      active = false;
      if (timeout !== null) window.clearTimeout(timeout);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [state, routeAnnouncementGeneration, prefersReducedMotion, motionTiming.duration]);

  useEffect(() => {
    try {
      editorReloadPendingRef.current = window.sessionStorage.getItem(EDITOR_RELOAD_PENDING_KEY) === '1';
      window.sessionStorage.removeItem(EDITOR_RELOAD_PENDING_KEY);
    } catch {
      editorReloadPendingRef.current = false;
    }
    editorShellMountedRef.current = true;
    return () => {
      editorShellMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const stage = editorStageRef.current;
    if (editorRevealed || editorLoadStatus !== 'ready' || !stage) return undefined;
    const stageElement: HTMLDivElement = stage;
    const startedAt = performance.now();
    let frame = 0;
    function check() {
      const elapsed = performance.now() - startedAt;
      const video = stageElement.querySelector<HTMLVideoElement>('.astrid-player-surface video');
      const mediaReady = video
        ? video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        : elapsed > EDITOR_REVEAL_MEDIA_GRACE_MS;
      const panelReady = stateRef.current.audience === 'app'
        ? stageElement.querySelector('[data-astrid-inspector-ready="true"], [data-astrid-inspector-ready="error"]') !== null
        : conversationReady;
      if ((mediaReady && panelReady) || elapsed > EDITOR_REVEAL_TIMEOUT_MS) {
        setEditorRevealed(true);
        return;
      }
      frame = window.requestAnimationFrame(check);
    }
    frame = window.requestAnimationFrame(check);
    return () => window.cancelAnimationFrame(frame);
  }, [conversationReady, editorLoadStatus, editorRevealed]);

  const onEditorChunkFailure = useCallback((attempt: number) => {
    if (!editorShellMountedRef.current || attempt !== editorAttemptRef.current) return;
    const followedReload = editorReloadPendingRef.current;
    editorReloadPendingRef.current = false;
    setEditorReloadFollowup(followedReload);
    editorLoadStatusRef.current = 'failed';
    setEditorLoadStatus('failed');
  }, []);

  const onEditorChunkReady = useCallback((attempt: number) => {
    if (!editorShellMountedRef.current || attempt !== editorAttemptRef.current) return;
    const restoreFocus = editorFailurePanelRef.current?.contains(document.activeElement) ?? false;
    editorReloadPendingRef.current = false;
    setEditorReloadFollowup(false);
    editorLoadStatusRef.current = 'ready';
    setEditorLoadStatus('ready');
    if (restoreFocus) {
      window.requestAnimationFrame(() => editorStageRef.current?.focus({ preventScroll: true }));
    }
  }, []);

  const retryEditorChunk = useCallback(() => {
    if (editorLoadStatusRef.current === 'loading') return;
    const nextAttempt = editorAttemptRef.current + 1;
    editorAttemptRef.current = nextAttempt;
    editorLoadStatusRef.current = 'loading';
    setEditorRetryCount((count) => count + 1);
    setEditorLoadStatus('loading');
    setEditorAttempt(nextAttempt);
    setLazyPublicAstridMountedEditor(() => lazy(loadPublicAstridMountedEditor));
  }, []);

  const reloadEditorPage = useCallback(() => {
    try {
      window.sessionStorage.setItem(EDITOR_RELOAD_PENDING_KEY, '1');
    } catch {
      // The page reload still works when session storage is unavailable.
    }
    window.location.reload();
  }, []);

  useEffect(() => {
    const stage = editorStageRef.current;
    if (!stage) return;
    const stageElement: HTMLDivElement = stage;
    let surfaces: HTMLElement | null = null;
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePlayerHeight);
    function updatePlayerHeight() {
      const nextSurfaces = stageElement.querySelector<HTMLElement>('.astrid-editor-surfaces');
      if (nextSurfaces !== surfaces) {
        resizeObserver?.disconnect();
        surfaces = nextSurfaces;
        if (surfaces) resizeObserver?.observe(surfaces);
      }
      if (!surfaces || window.matchMedia('(max-width: 640px)').matches) {
        stageElement.style.removeProperty('--astrid-player-height');
        return;
      }
      const width = surfaces.clientWidth * PLAYER_WIDTH;
      stageElement.style.setProperty('--astrid-player-height', `${width * 9 / 16}px`);
    }
    const mutationObserver = new MutationObserver(updatePlayerHeight);
    mutationObserver.observe(stageElement, { childList: true, subtree: true });
    window.addEventListener('resize', updatePlayerHeight);
    updatePlayerHeight();
    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updatePlayerHeight);
    };
  }, []);

  useEffect(() => {
    const focusTarget = pendingAudienceFocusRef.current;
    if (!focusTarget) return;
    if (focusTarget === 'agent' && !conversationReady) return;
    pendingAudienceFocusRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      if (focusTarget === 'agent') {
        document.querySelector<HTMLElement>('.astrid-scripted-conversation, .astrid-conversation-load-error')?.focus({ preventScroll: true });
      } else {
        document.querySelector<HTMLButtonElement>('[data-astrid-agent-launcher]')?.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversationReady, state.audience]);

  useEffect(() => {
    const syncFromHistory = () => {
      // Vision & Issues opens over the home page; its history entries carry no App/Agent state.
      if (window.location.pathname === VISION_PATH) return;
      const next = readExperienceState();
      const previous = stateRef.current;
      if (sameExperience(previous, next)) return;
      if (previous.audience !== next.audience) pendingAudienceFocusRef.current = next.audience === 'agent' ? 'agent' : 'launcher';
      const startedAt = performance.now();
      const timing = retargetMotionTiming(previous, next, motionClockRef.current, startedAt);
      motionClockRef.current = timing.duration ? { startedAt, duration: timing.duration, from: previous, to: next } : null;
      setMotionTiming(timing);
      stateRef.current = next;
      queueRouteAnnouncement(next);
      lastHistoryChangeRef.current = 0;
      runThemeFade(() => setState(next), reducedMotionRef.current);
    };
    window.addEventListener('popstate', syncFromHistory);
    return () => window.removeEventListener('popstate', syncFromHistory);
  }, [queueRouteAnnouncement]);

  const updateState = (next: Partial<ExperienceState>) => {
    const previousState = stateRef.current;
    const nextState = { ...previousState, ...next };
    if (previousState.audience === nextState.audience) return;
    pendingAudienceFocusRef.current = nextState.audience === 'agent' ? 'agent' : 'launcher';
    const url = new URL(window.location.href);
    if (nextState.audience === 'agent') url.searchParams.set('experience', 'agent');
    else url.searchParams.delete('experience');
    url.searchParams.delete('view');
    const startedAt = performance.now();
    const timing = retargetMotionTiming(previousState, nextState, motionClockRef.current, startedAt);
    motionClockRef.current = timing.duration ? { startedAt, duration: timing.duration, from: previousState, to: nextState } : null;
    setMotionTiming(timing);
    stateRef.current = nextState;
    queueRouteAnnouncement(nextState);
    const now = Date.now();
    const coalesce = now - lastHistoryChangeRef.current < 350;
    const currentEntry = window.history.state && typeof window.history.state === 'object'
      ? window.history.state as Record<string, unknown>
      : {};
    const historyEntry = { ...currentEntry, astridExperience: nextState };
    if (coalesce) window.history.replaceState(historyEntry, '', url);
    else window.history.pushState(historyEntry, '', url);
    lastHistoryChangeRef.current = now;
    runThemeFade(() => setState(nextState), reducedMotionRef.current);
  };

  // In Agent, the editor recedes behind the conversation; clicking that background brings App forward.
  // Keyboard users switch with the App/Agent toggle beside the hero copy.
  // Anywhere on the stage switches back, the receded panels included, except the conversation and the
  // labels. Labels ignore the pointer (clicks fall through to the stage), so test where they are drawn.
  const returnToAppFromStage = (x: number, y: number, target: Element, stage: HTMLElement) => {
    if (stateRef.current.audience !== 'agent') return;
    if (target.closest('.astrid-chat-surface, .astrid-editor-load-failure, button, a')) return;
    if ([...stage.querySelectorAll('.astrid-callout')].some((label) => drawnAt(label, x, y))) return;
    updateState({ audience: 'app' });
  };
  const onStageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    returnToAppFromStage(event.clientX, event.clientY, event.target, event.currentTarget);
  };
  const returnToAppFromStageRef = useRef(returnToAppFromStage);
  returnToAppFromStageRef.current = returnToAppFromStage;
  // While the side-switch colour fade runs, the browser hit-tests clicks to the document root instead of
  // the stage, so a click on the stage during the switch would otherwise be lost.
  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (event.target !== document.documentElement) return;
      const stage = editorStageRef.current;
      if (!stage || !drawnAt(stage, event.clientX, event.clientY)) return;
      const chat = stage.querySelector('.astrid-chat-surface');
      if (chat && drawnAt(chat, event.clientX, event.clientY)) return;
      returnToAppFromStageRef.current(event.clientX, event.clientY, stage, stage);
    };
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, []);

  const openVerifiedResult = () => {
    updateState({ audience: 'app' });
  };

  const lastSkyDarknessRef = useRef<number | null>(null);
  const onSkyDarkness = (darkness: number) => {
    const previous = lastSkyDarknessRef.current;
    lastSkyDarknessRef.current = darkness;
    applyPageDusk(mainRef.current, previous, darkness, () => applySkyDarkness(darkness));
  };
  const applySkyDarkness = (darkness: number) => {
    duskRef.current = pageDusk(darkness);
    duskTokensRef.current = duskTokens(darkness);
    const main = mainRef.current;
    main?.style.setProperty('--astrid-paper', duskRef.current.paper);
    setRootPaper(duskRef.current.paper);
    main?.style.setProperty('--astrid-dusk', String(duskRef.current.dusk));
    main?.style.setProperty('--astrid-dusk-ink', String(duskRef.current.ink));
    main?.style.setProperty('--astrid-dusk-firm', String(duskRef.current.firm));
    main?.style.setProperty('--astrid-dusk-ink-page', String(duskRef.current.inkPage));
    for (const [name, value] of Object.entries(duskTokensRef.current)) main?.style.setProperty(name, value);
    // Only shadows and the browser's control colours still switch, at mid-twilight.
    const next = themeForDarkness(darkness);
    if (next === themeRef.current) return;
    themeRef.current = next;
    setTheme(next);
  };

  return (
    <main
      ref={mainRef}
      className="astrid-public-site"
      data-astrid-public-entry="astrid-public-v1"
      data-audience={state.audience}
      data-theme={theme}
      data-dusk
      data-sky-frame={sky.enabled && sky.openFrame ? 'open' : 'solid'}
      data-pixel-mono={sky.details.pixelMono || undefined}
      data-pixel-beta={sky.details.pixelBeta || undefined}
      data-motion-duration={motionTiming.duration}
      style={{
        '--astrid-motion-duration': `${motionTiming.duration}ms`,
        '--astrid-assembly-delay': `${motionTiming.assemblyDelay}ms`,
        '--astrid-assembly-duration': `${motionTiming.assemblyDuration}ms`,
        '--astrid-surface-delay': `${motionTiming.surfaceDelay}ms`,
        '--astrid-surface-duration': `${motionTiming.surfaceDuration}ms`,
        '--astrid-label-delay': `${motionTiming.labelDelay}ms`,
        '--astrid-label-duration': `${motionTiming.labelDuration}ms`,
        '--astrid-paper': duskRef.current.paper,
        '--astrid-dusk': duskRef.current.dusk,
        '--astrid-dusk-ink': duskRef.current.ink,
        '--astrid-dusk-firm': duskRef.current.firm,
        '--astrid-dusk-ink-page': duskRef.current.inkPage,
        ...duskTokensRef.current,
      } as CSSProperties}
    >
      <div
        className="astrid-visually-hidden"
        data-astrid-route-status
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {routeStatusMessage}
      </div>
      <PublicAstridSky
        settings={sky}
        onDarkness={onSkyDarkness}
        reducedMotion={prefersReducedMotion}
        replayStartedAt={skyReplayStartedAt}
        onReplayEnd={endSkyReplay}
        quietBehind=".astrid-hero-copy h1, .astrid-hero-subtitle"
      />
      {skyReview && <PublicAstridSkyReview theme={theme} settings={sky} onChange={setSky} />}
      <section className="astrid-landing-grid" ref={landingGridRef} aria-labelledby="astrid-hero-title">
        <div className="astrid-hero-copy">
          <div className="astrid-brand">
            <button
              type="button"
              className="astrid-brand-mink-button"
              aria-label="Watch a day go by"
              data-pose={minkPose}
              onClick={playSkyDay}
            >
              {minkPose === 'focus' && <span className="astrid-brand-mink-psychic" aria-hidden="true" />}
              <span className="astrid-brand-mink-frame">
                <img className="astrid-brand-mink" src={minkSrc} alt="" />
                {minkPose === 'profile' && <img className="astrid-brand-mink astrid-brand-mink-glint" src="/astrid-mink-glint.png" alt="" />}
              </span>
            </button>
            <span className="astrid-brand-name">Astrid</span>
            <span className="astrid-visually-hidden">(beta)</span>
            {/* The beta stamp doubles as the way into the Vision & Issues page: what we're building
                toward, and what's still open, is the natural companion to "this is a beta". */}
            <a className="astrid-beta" href={VISION_PATH} aria-label="Vision & Issues" onClick={(event) => followInPage(event, onOpenVision)}>
              <span className="astrid-beta-tag" aria-hidden="true">BETA</span>
              <span className="astrid-beta-link">
                <span className="astrid-beta-link-text">Vision &amp; Issues</span>
                <ArrowUpRight size={10} strokeWidth={2.2} aria-hidden="true" />
              </span>
            </a>
          </div>
          <nav className="astrid-audience-switch" aria-label="Explore Astrid">
            <button type="button" data-audience="app" aria-pressed={state.audience === 'app'} onClick={() => updateState({ audience: 'app' })}>
              App
            </button>
            <button type="button" data-audience="agent" aria-pressed={state.audience === 'agent'} onClick={() => updateState({ audience: 'agent' })}>
              Agent
            </button>
          </nav>
          <h1 id="astrid-hero-title">Push local AI to its creative limits.</h1>
          <div className="astrid-hero-detail">
            <p className="astrid-hero-subtitle">{HERO_SUBTITLE[state.audience]}</p>
            <div className="astrid-hero-actions">
              <PublicAstridHeroCta audience={state.audience} pixelIcons={sky.details.pixelIcons} />
            </div>
          </div>
          <div className="astrid-hero-note">
            <PublicAstridSocialLinks />
          </div>
        </div>

        <section className="astrid-showcase" aria-label={state.audience === 'app' ? 'App' : 'Agent'}>
          <div
            className="astrid-editor-stage"
            ref={editorStageRef}
            data-astrid-surface-owner={ACTIVE_PUBLIC_ASTRID_EXAMPLE_METADATA.id}
            data-editor-load-state={editorLoadStatus}
            data-revealed={editorRevealed}
            data-audience={state.audience}
            role="group"
            aria-label={`${ACTIVE_PUBLIC_ASTRID_EXAMPLE_METADATA.title} editor preview`}
            tabIndex={-1}
            onClick={onStageClick}
          >
            <div
              className="astrid-editor-loading"
              data-audience={state.audience}
              role="status"
              aria-hidden={editorRevealed}
              data-hidden={editorRevealed || editorLoadStatus === 'failed' || editorLoadStatus === 'loading'}
              onTransitionEnd={() => { if (editorRevealed) setLoaderRetired(true); }}
            >
              {!loaderRetired && (
                <MinkRunner />
              )}
              <span className="astrid-visually-hidden">Loading the shared editor, preview and timeline…</span>
            </div>
            <EditorChunkBoundary
              attempt={editorAttempt}
              onChunkFailure={onEditorChunkFailure}
              fallback={null}
            >
              <Suspense fallback={null}>
                <LazyPublicAstridMountedEditor
                  audience={state.audience}
                  transportOutlet={transportOutlet}
                  onTransportOutletChange={setTransportOutlet}
                  playerRef={playerRef}
                  inspectorRef={inspectorRef}
                  timelineRef={timelineRef}
                  chatRef={chatRef}
                  transportRef={transportRef}
                  onConversationReady={onConversationReady}
                  onOpenVerifiedResult={openVerifiedResult}
                  preloadConversation={editorRevealed}
                  conversationActive={agentView && editorRevealed}
                />
                <EditorChunkReady attempt={editorAttempt} onReady={onEditorChunkReady} />
              </Suspense>
            </EditorChunkBoundary>

            {(editorLoadStatus === 'loading' || editorLoadStatus === 'failed') && (
              <div
                className="astrid-editor-load-failure"
                ref={editorFailurePanelRef}
                data-load-state={editorLoadStatus}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <img className="astrid-editor-load-failure-poster" src={ACTIVE_PUBLIC_ASTRID_EXAMPLE_METADATA.posterUrl} alt="" />
                <div className="astrid-editor-load-failure-card">
                  <strong>
                    {editorLoadStatus === 'loading' ? 'Loading editor…' : 'Editor preview couldn’t load'}
                  </strong>
                  <span>
                    {editorLoadStatus === 'loading'
                      ? 'The page is still available while the editor reloads.'
                      : editorReloadFollowup
                        ? 'The editor is still unavailable. Please try again later.'
                        : 'The page is still available. Try loading the editor again.'}
                  </span>
                  <button
                    className="astrid-editor-load-retry"
                    type="button"
                    aria-disabled={editorLoadStatus === 'loading'}
                    onClick={retryEditorChunk}
                  >
                    Retry editor
                  </button>
                  {editorLoadStatus === 'failed' && editorRetryCount > 0 && (
                    <button
                      className="astrid-editor-load-reload"
                      type="button"
                      onClick={reloadEditorPage}
                    >
                      Reload page
                    </button>
                  )}
                </div>
              </div>
            )}

            {appView && editorRevealed && (
              <button
                className="astrid-agent-launcher"
                type="button"
                data-astrid-agent-launcher
                aria-label={hasViewedAgent ? 'Open Agent' : 'Open Agent — 1 scripted conversation'}
                title="Open Agent conversation"
                onClick={() => updateState({ audience: 'agent' })}
              >
                <img src="/astrid-mink-provisional.webp" alt="" />
                {!hasViewedAgent && <span aria-hidden="true">1</span>}
              </button>
            )}

            {editorRevealed && (
              <PublicAstridCallouts
                stageRef={editorStageRef}
                audience={state.audience}
                reducedMotion={prefersReducedMotion}
              />
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
