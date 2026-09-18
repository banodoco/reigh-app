import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShots } from '@/shared/contexts/ShotsContext.tsx';
import { useShotFinalVideos, type ShotFinalVideo } from '@/tools/travel-between-images/hooks/video/useShotFinalVideos.ts';
import type { VideoEditorShotsHost } from '@/tools/video-editor/runtime/ports.ts';
import {
  createShotCompositionAdapter,
  type ShotCompositionPort,
} from '@/tools/video-editor/data/shotCompositionAdapter.ts';

const MAX_DISMISSED_FINAL_VIDEOS = 256;
const dismissedFinalVideoIds = new Set<string>();

export function useReighShotsHost(
  projectId: string | null,
  parentDocumentId: string,
  shotCompositionPort?: ShotCompositionPort,
): VideoEditorShotsHost {
  const {
    shots,
    isLoading,
    error,
    refetchShots,
    allImagesCount,
    noShotImagesCount,
  } = useShots();
  const { finalVideoMap } = useShotFinalVideos(projectId);
  const [, forceRender] = useState(0);
  const shotComposition = useMemo(
    () => shotCompositionPort ? createShotCompositionAdapter(shotCompositionPort) : null,
    [shotCompositionPort],
  );
  const [canonicalOccurrences, setCanonicalOccurrences] = useState<VideoEditorShotsHost['canonicalOccurrences']>([]);
  const [canonicalCompositionError, setCanonicalCompositionError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    if (!projectId || !parentDocumentId || !shotComposition) {
      setCanonicalOccurrences([]);
      setCanonicalCompositionError(null);
      return () => { active = false; };
    }
    void shotComposition.load({ projectId, parentDocumentId })
      .then((composition) => {
        if (!active) return;
        setCanonicalOccurrences(composition.occurrences);
        setCanonicalCompositionError(null);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setCanonicalOccurrences([]);
        setCanonicalCompositionError(loadError instanceof Error ? loadError : new Error(String(loadError)));
      });
    return () => { active = false; };
  }, [parentDocumentId, projectId, shotComposition]);

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
    isLoading,
    error,
    refetchShots,
    allImagesCount,
    noShotImagesCount,
    finalVideoMap: visibleFinalVideoMap,
    dismissFinalVideo,
    shotComposition,
    canonicalOccurrences,
    canonicalCompositionError,
  }), [
    allImagesCount,
    dismissFinalVideo,
    error,
    isLoading,
    noShotImagesCount,
    refetchShots,
    shots,
    visibleFinalVideoMap,
    shotComposition,
    canonicalOccurrences,
    canonicalCompositionError,
  ]);
}
