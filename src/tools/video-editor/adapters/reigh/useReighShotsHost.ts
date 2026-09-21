import { useCallback, useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    let active = true;
    if (!projectId || !parentDocumentId || !shotComposition) {
      setPreparedComposition(null);
      setCanonicalLoading(false);
      setCanonicalCompositionError(new ShotCompositionUnavailableError(
        'The canonical shot-composition provider is unavailable for this editor.',
      ));
      return () => { active = false; };
    }
    setCanonicalLoading(true);
    setCanonicalCompositionError(null);
    void shotComposition.load({ projectId, parentDocumentId })
      .then((composition) => {
        if (!active) return;
        setPreparedComposition(composition);
        setCanonicalLoading(false);
        setCanonicalCompositionError(null);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setPreparedComposition(null);
        setCanonicalLoading(false);
        setCanonicalCompositionError(loadError instanceof Error ? loadError : new Error(String(loadError)));
      });
    return () => { active = false; };
  }, [parentDocumentId, projectId, reloadToken, shotComposition]);

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
