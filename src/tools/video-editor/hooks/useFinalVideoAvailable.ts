import { useCallback, useState } from 'react';
import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import {
  useShotFinalVideos,
  type ShotFinalVideo,
} from '@/tools/travel-between-images/hooks/video/useShotFinalVideos';

export type { ShotFinalVideo };

const dismissedFinalVideoIds = new Set<string>();

export function useFinalVideoAvailable() {
  const { selectedProjectId } = useProjectSelectionContext();
  const { finalVideoMap } = useShotFinalVideos(selectedProjectId);
  const [, forceRender] = useState(0);

  const dismissFinalVideo = useCallback((finalVideoId: string) => {
    dismissedFinalVideoIds.add(finalVideoId);
    forceRender((count) => count + 1);
  }, []);

  return {
    finalVideoMap,
    dismissFinalVideo,
  };
}
