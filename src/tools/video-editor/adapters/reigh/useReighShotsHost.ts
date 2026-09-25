import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShotFinalVideos, type ShotFinalVideo } from '@/tools/travel-between-images/hooks/video/useShotFinalVideos.ts';
import type { VideoEditorShotsHost, CanonicalShotTimelineDraft, CanonicalShotTimelinePublication, CanonicalShotTimelineScope } from '@/tools/video-editor/runtime/ports.ts';
import {
  createShotCompositionAdapter,
  ShotCompositionUnavailableError,
  type ShotCompositionPort,
} from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import { selectCanonicalShotViewModels } from '@/tools/video-editor/data/canonicalShotViewModel.ts';

const MAX_DISMISSED_FINAL_VIDEOS = 256;
const dismissedFinalVideoIds = new Set<string>();

export function useReighShotsHost(
  projectId: string | null,
  parentDocumentId: string,
  shotCompositionPort?: ShotCompositionPort,
): VideoEditorShotsHost {
  const { finalVideoMap } = useShotFinalVideos(projectId);
  const [, forceRender] = useState(0);
  const shotComposition = useMemo(
    () => shotCompositionPort ? createShotCompositionAdapter(shotCompositionPort) : null,
    [shotCompositionPort],
  );
  const [canonicalCompositionError, setCanonicalCompositionError] = useState<Error | null>(null);
  const [preparedComposition, setPreparedComposition] = useState<Awaited<ReturnType<NonNullable<typeof shotComposition>['load']>> | null>(null);
  const preparedCompositionRef = useRef(preparedComposition);
  const [canonicalLoading, setCanonicalLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [canonicalDraftState, setCanonicalDraftState] = useState<CanonicalShotTimelineDraft | null>(null);
  const refreshInFlightRef = useRef(false);
  const hasPreparedCompositionRef = useRef(false);
  const mountedRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const canonicalDraftRef = useRef<CanonicalShotTimelineDraft | null>(null);
  const activeDraftSessionsRef = useRef(new Map<string, string>());
  const ignoredStaleHeadsRef = useRef(new Set<string>());
  const draftScopeMatchesHost = useCallback((scope: CanonicalShotTimelineScope) => (
    scope.projectId === projectId && scope.parentDocumentId === parentDocumentId
  ), [parentDocumentId, projectId]);
  const clearDraftState = useCallback(() => {
    canonicalDraftRef.current = null;
    setCanonicalDraftState(null);
  }, []);
  const beginCanonicalDraftSession = useCallback((scope: CanonicalShotTimelineScope) => {
    if (!draftScopeMatchesHost(scope)) return;
    const current = canonicalDraftRef.current;
    activeDraftSessionsRef.current.set(scope.occurrenceId, scope.editorSessionId);
    // Keep an unacknowledged projection for this same shot through close/reopen.
    // The recovered draft from the new editor session will replace it when ready.
    if (current && current.scope.occurrenceId !== scope.occurrenceId) {
      clearDraftState();
    }
  }, [clearDraftState, draftScopeMatchesHost]);
  const endCanonicalDraftSession = useCallback((scope: CanonicalShotTimelineScope) => {
    if (!draftScopeMatchesHost(scope)
      || activeDraftSessionsRef.current.get(scope.occurrenceId) !== scope.editorSessionId) return;
    activeDraftSessionsRef.current.delete(scope.occurrenceId);
    // Closing the popup is not a discard. The draft remains visible and
    // recoverable until a matching acknowledgement or explicit clean state.
  }, [draftScopeMatchesHost]);
  const setCanonicalDraftProjection = useCallback((draft: CanonicalShotTimelineDraft) => {
    if (!draftScopeMatchesHost(draft.scope)
      || activeDraftSessionsRef.current.get(draft.scope.occurrenceId) !== draft.scope.editorSessionId
      || draft.composition.projectId !== projectId
      || draft.composition.parentDocumentId !== parentDocumentId
      || !draft.composition.occurrences.some((occurrence) => occurrence.occurrenceId === draft.scope.occurrenceId)) return;
    const current = canonicalDraftRef.current;
    if (
      current
      && sameCanonicalDraftScope(current.scope, draft.scope)
      && current.generation >= draft.generation
    ) {
      return;
    }
    canonicalDraftRef.current = draft;
    setCanonicalDraftState(draft);
  }, [draftScopeMatchesHost, parentDocumentId, projectId]);
  const clearCanonicalDraftProjection = useCallback((
    scope: CanonicalShotTimelineScope,
    generation: number,
  ) => {
    const current = canonicalDraftRef.current;
    if (!draftScopeMatchesHost(scope) || !current || !sameCanonicalDraftScope(current.scope, scope)
      || current.generation > generation) {
      return;
    }
    clearDraftState();
  }, [clearDraftState, draftScopeMatchesHost]);
  const adoptCanonicalComposition = useCallback((
    composition: NonNullable<typeof preparedComposition>,
    publication?: CanonicalShotTimelinePublication,
  ) => {
    if (
      composition.projectId !== projectId
      || composition.parentDocumentId !== parentDocumentId
    ) {
      return;
    }
    if (publication && (!draftScopeMatchesHost(publication.scope)
      || publication.scope.projectId !== composition.projectId
      || publication.scope.parentDocumentId !== composition.parentDocumentId
      || !composition.occurrences.some((occurrence) => occurrence.occurrenceId === publication.scope.occurrenceId))) {
      return;
    }
    const expectedHead = publication?.expectedHeadRevisionId
      ?? composition.publicationReceipt?.expectedHead
      ?? null;
    const currentHead = preparedCompositionRef.current?.headRevisionId ?? null;
    // A slow acknowledgement may arrive after a later canonical head has
    // already been installed. Never roll the main timeline back to that ack.
    if (expectedHead && currentHead
      && currentHead !== expectedHead
      && currentHead !== composition.headRevisionId) {
      return;
    }
    if (expectedHead && expectedHead !== composition.headRevisionId) {
      rememberIgnoredHead(ignoredStaleHeadsRef.current, expectedHead);
    }
    const previousHead = preparedCompositionRef.current?.headRevisionId;
    if (previousHead && previousHead !== composition.headRevisionId) {
      rememberIgnoredHead(ignoredStaleHeadsRef.current, previousHead);
    }
    hasPreparedCompositionRef.current = true;
    preparedCompositionRef.current = composition;
    setPreparedComposition(composition);
    setCanonicalCompositionError(null);
    setCanonicalLoading(false);
    if (publication) {
      clearCanonicalDraftProjection(publication.scope, publication.generation);
    }
  }, [clearCanonicalDraftProjection, draftScopeMatchesHost, parentDocumentId, projectId]);

  const loadCanonicalComposition = useCallback(async (showLoading: boolean, generation: number) => {
    if (generation !== loadGenerationRef.current) return;
    if (!projectId || !parentDocumentId || !shotComposition) {
      hasPreparedCompositionRef.current = false;
      preparedCompositionRef.current = null;
      setPreparedComposition(null);
      setCanonicalLoading(false);
      setCanonicalCompositionError(new ShotCompositionUnavailableError(
        'The canonical shot-composition provider is unavailable for this editor.',
      ));
      return;
    }
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    if (showLoading) setCanonicalLoading(true);
    try {
      const composition = await shotComposition.load({ projectId, parentDocumentId });
      if (!mountedRef.current || generation !== loadGenerationRef.current) return;
      const currentHead = preparedCompositionRef.current?.headRevisionId;
      if (currentHead && composition.headRevisionId !== currentHead
        && ignoredStaleHeadsRef.current.has(composition.headRevisionId)) {
        setCanonicalCompositionError(null);
        setCanonicalLoading(false);
        return;
      }
      hasPreparedCompositionRef.current = true;
      if (!canonicalDraftRef.current || !draftScopeMatchesHost(canonicalDraftRef.current.scope)) {
        if (preparedCompositionRef.current?.headRevisionId !== composition.headRevisionId) {
          preparedCompositionRef.current = composition;
          setPreparedComposition(composition);
        }
      }
      setCanonicalCompositionError(null);
      setCanonicalLoading(false);
    } catch (loadError: unknown) {
      if (!mountedRef.current || generation !== loadGenerationRef.current) return;
      // A transient poll failure must not erase the last coherent pinned head.
      // Initial failures still surface normally to the editor.
      setCanonicalCompositionError((current) => hasPreparedCompositionRef.current
        ? current
        : loadError instanceof Error ? loadError : new Error(String(loadError)));
      setCanonicalLoading(false);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [draftScopeMatchesHost, parentDocumentId, projectId, shotComposition]);

  useEffect(() => {
    canonicalDraftRef.current = null;
    setCanonicalDraftState(null);
    activeDraftSessionsRef.current.clear();
    ignoredStaleHeadsRef.current.clear();
    preparedCompositionRef.current = null;
  }, [parentDocumentId, projectId, shotComposition]);

  useEffect(() => {
    mountedRef.current = true;
    const generation = ++loadGenerationRef.current;
    void loadCanonicalComposition(true, generation);
    if (!projectId || !parentDocumentId || !shotComposition) {
      return () => { mountedRef.current = false; };
    }
    const interval = globalThis.setInterval(() => {
      void loadCanonicalComposition(false, generation);
    }, 2_000);
    return () => {
      mountedRef.current = false;
      globalThis.clearInterval(interval);
    };
  }, [loadCanonicalComposition, parentDocumentId, projectId, reloadToken, shotComposition]);

  // A previous document's prepared graph may remain in React state for one
  // render while the next Runtime read is in flight. Scope the exposed graph
  // before it reaches preview/export so a new document can never borrow the
  // old document's child timelines.
  const scopedComposition = preparedComposition
    && preparedComposition.projectId === projectId
    && preparedComposition.parentDocumentId === parentDocumentId
    ? preparedComposition
    : null;
  const activeCanonicalOccurrences = useMemo(() => canonicalDraftState
    && draftScopeMatchesHost(canonicalDraftState.scope)
    ? canonicalDraftState.composition.occurrences
    : scopedComposition?.occurrences ?? [], [canonicalDraftState, draftScopeMatchesHost, scopedComposition]);
  const shots = useMemo(() => selectCanonicalShotViewModels(scopedComposition), [scopedComposition]);
  const refetchShots = useCallback(() => setReloadToken((value) => value + 1), []);

  const dismissFinalVideo = useCallback((finalVideoId: string) => {
    dismissedFinalVideoIds.add(finalVideoId);
    if (dismissedFinalVideoIds.size > MAX_DISMISSED_FINAL_VIDEOS) {
      const oldest = dismissedFinalVideoIds.values().next().value;
      if (oldest !== undefined) {
        dismissedFinalVideoIds.delete(oldest);
      }
    }
    forceRender((count) => count + 1);
  }, []);

  const visibleFinalVideoMap = useMemo(() => {
    const filtered = new Map<string, ShotFinalVideo>();

    for (const [shotId, finalVideo] of finalVideoMap.entries()) {
      if (!dismissedFinalVideoIds.has(finalVideo.id)) {
        filtered.set(shotId, finalVideo);
      }
    }

    return filtered;
  }, [finalVideoMap]);

  return useMemo(() => ({
    shots,
    isLoading: canonicalLoading,
    error: canonicalCompositionError,
    refetchShots,
    allImagesCount: shots.reduce((total, shot) => total + (shot.images?.length ?? 0), 0),
    noShotImagesCount: 0,
    finalVideoMap: visibleFinalVideoMap,
    dismissFinalVideo,
    shotComposition,
    canonicalOccurrences: activeCanonicalOccurrences,
    canonicalComposition: scopedComposition,
    canonicalCompositionError,
    canonicalDraft: canonicalDraftState,
    beginCanonicalDraftSession,
    endCanonicalDraftSession,
    setCanonicalDraftProjection,
    clearCanonicalDraftProjection,
    adoptCanonicalComposition,
  }), [
    canonicalLoading,
    dismissFinalVideo,
    refetchShots,
    shots,
    visibleFinalVideoMap,
    shotComposition,
    scopedComposition,
    canonicalCompositionError,
    canonicalDraftState,
    activeCanonicalOccurrences,
    beginCanonicalDraftSession,
    endCanonicalDraftSession,
    setCanonicalDraftProjection,
    clearCanonicalDraftProjection,
    adoptCanonicalComposition,
  ]);
}

function sameCanonicalDraftScope(left: CanonicalShotTimelineScope, right: CanonicalShotTimelineScope): boolean {
  return left.projectId === right.projectId
    && left.parentDocumentId === right.parentDocumentId
    && left.occurrenceId === right.occurrenceId
    && left.editorSessionId === right.editorSessionId;
}

function rememberIgnoredHead(heads: Set<string>, headRevisionId: string): void {
  heads.add(headRevisionId);
  while (heads.size > 64) {
    const oldest = heads.values().next().value;
    if (oldest === undefined) return;
    heads.delete(oldest);
  }
}
