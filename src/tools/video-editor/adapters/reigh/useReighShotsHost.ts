import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShotFinalVideos, type ShotFinalVideo } from '@/tools/travel-between-images/hooks/video/useShotFinalVideos.ts';
import type { VideoEditorShotsHost } from '@/tools/video-editor/runtime/ports.ts';
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
  const [canonicalLoading, setCanonicalLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const refreshInFlightRef = useRef(false);
  const hasPreparedCompositionRef = useRef(false);
  const mountedRef = useRef(false);
  const loadGenerationRef = useRef(0);

  const loadCanonicalComposition = useCallback(async (showLoading: boolean, generation: number) => {
    if (generation !== loadGenerationRef.current) return;
    if (!projectId || !parentDocumentId || !shotComposition) {
      hasPreparedCompositionRef.current = false;
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
      hasPreparedCompositionRef.current = true;
      setPreparedComposition((current) => current?.headRevisionId === composition.headRevisionId ? current : composition);
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
    canonicalOccurrences: scopedComposition?.occurrences ?? [],
    canonicalComposition: scopedComposition,
    canonicalCompositionError,
  }), [
    canonicalLoading,
    dismissFinalVideo,
    refetchShots,
    shots,
    visibleFinalVideoMap,
    shotComposition,
    scopedComposition,
    canonicalCompositionError,
  ]);
}
