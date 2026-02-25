/**
 * useShotEditorSetup - Initialization and setup logic for ShotEditor
 *
 * Extracts from ShotEditor:
 * - Shot resolution (foundShot, lastValidShotRef, selectedShot)
 * - Effective aspect ratio calculation
 * - Image query and selector hooks
 * - Stability refs for performance optimization
 *
 * @see Phase 3 of shot-settings-context-cleanup.md
 */

import React, { useMemo, useRef } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useShots } from '@/shared/contexts/ShotsContext';
import { useShotImages } from '@/shared/hooks/useShotImages';
import { Shot, GenerationRow } from '@/domains/generation/types';
import type { Project } from '@/types/project';

export interface UseShotEditorSetupProps {
  selectedShotId: string;
  projectId: string;
  optimisticShotData?: Shot;
  batchVideoFrames: number;
}

export interface UseShotEditorSetupReturn {
  // Shot resolution
  selectedShot: Shot | undefined;
  foundShot: Shot | undefined;
  shots: Shot[] | undefined;

  // Project data
  selectedProjectId: string;
  projects: Project[];

  // Aspect ratio
  effectiveAspectRatio: string | undefined;

  // Image data (from queries/selectors)
  allShotImages: GenerationRow[];
  timelineImages: GenerationRow[];
  unpositionedImages: GenerationRow[];
  videoOutputs: GenerationRow[];
  contextImages: GenerationRow[];
  isLoadingFullImages: boolean;

  // Initial parent generations (for fast FinalVideoSection render)
  initialParentGenerations: GenerationRow[];

  // Stability refs for callbacks
  refs: {
    selectedShotRef: React.MutableRefObject<Shot | undefined>;
    projectIdRef: React.MutableRefObject<string>;
    allShotImagesRef: React.MutableRefObject<GenerationRow[]>;
    batchVideoFramesRef: React.MutableRefObject<number>;
  };
}

/**
 * Hook that handles ShotEditor setup and initialization.
 * Extracts shot resolution, image queries, and stability refs.
 */
export function useShotEditorSetup({
  selectedShotId,
  projectId,
  optimisticShotData,
  batchVideoFrames,
}: UseShotEditorSetupProps): UseShotEditorSetupReturn {
  const { selectedProjectId, projects } = useProject();
  const { shots } = useShots();

  // ============================================================================
  // SHOT RESOLUTION
  // ============================================================================
  // [FlickerFix] Persist the last valid shot object to prevent UI flickering during refetches
  // When duplicating items, the shots list might briefly refetch, causing selectedShot to be undefined
  const foundShot = useMemo(
    () => shots?.find(shot => shot.id === selectedShotId),
    [shots, selectedShotId]
  );
  const lastValidShotRef = useRef<Shot | undefined>();

  // Update ref if we found the shot
  if (foundShot) {
    lastValidShotRef.current = foundShot;
  }

  // Use found shot if available, otherwise fallback to:
  // 1. Optimistic shot data (for newly created shots not in cache yet)
  // 2. Cached version if shots list is loading/refreshing
  // Only use cache fallback if shots is undefined/null (loading), not if it's an empty array (loaded but missing)
  const selectedShot = foundShot || optimisticShotData || (shots === undefined ? lastValidShotRef.current : undefined);

  // ============================================================================
  // STABILITY REFS
  // ============================================================================
  // Refs for values used in callbacks that shouldn't trigger callback recreation.
  // This prevents the cascade of callback recreations on every shot/settings change.
  const selectedShotRef = useRef(selectedShot);
  selectedShotRef.current = selectedShot;
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  // ============================================================================
  // ASPECT RATIO
  // ============================================================================
  // Compute effective aspect ratio: prioritize shot-level over project-level
  // This ensures videos in VideoOutputsGallery, items in Timeline, and other components
  // use the shot's aspect ratio when set, otherwise fall back to project aspect ratio
  const effectiveAspectRatio = useMemo(() => {
    const projectAspectRatio = projects.find(p => p.id === projectId)?.aspectRatio;
    return selectedShot?.aspect_ratio || projectAspectRatio;
  }, [selectedShot?.aspect_ratio, projects, projectId]);

  // ============================================================================
  // IMAGE QUERIES AND SELECTORS
  // ============================================================================
  // PERFORMANCE OPTIMIZATION: Use context images when available since they're already loaded
  // Only fall back to detailed query if context data is insufficient
  const contextImages = useMemo(
    () => selectedShot?.images ?? [],
    [selectedShot?.images]
  );

  // [ShotNavPerf] PERFORMANCE FIX: Always fetch full data in background, but don't block UI
  // We'll use context images immediately while the query runs asynchronously
  const shouldLoadDetailedData = useMemo(
    () => !!selectedShotId, // Always load full data in editor mode for pair prompts, mutations, etc.
    [selectedShotId]
  );

  // Always enable query to get full data (needed for mutations and pair prompts)
  const queryKey = shouldLoadDetailedData ? selectedShotId : null;

  // CRITICAL: Only call useShotImages when we genuinely need detailed data
  // Using disabled query when context data is available

  // [ShotNavPerf] CRITICAL FIX: Pass disableRefetch during initial load to prevent query storm
  // The query will still run once, but won't refetch on every render
  const fullImagesQueryResult = useShotImages(queryKey, {
    disableRefetch: false, // Let it fetch normally, we'll use context images as placeholder
  });

  const fullShotImages = useMemo(
    () => fullImagesQueryResult.data ?? [],
    [fullImagesQueryResult.data]
  );
  const isLoadingFullImages = fullImagesQueryResult.isLoading;

  // All shot images - use query data when available, fall back to context images during transition
  // This prevents the "flash to empty" when navigating between shots
  // PERF: Memoize to prevent ShotImagesEditor re-renders when reference doesn't actually change
  const allShotImages = useMemo(() => {
    return fullShotImages.length > 0 ? fullShotImages : contextImages;
  }, [fullShotImages, contextImages]);

  // PERF: Derive filtered views from the single useShotImages query instead of
  // calling selector hooks (useTimelineImages, useUnpositionedImages, useVideoOutputs).
  // Each selector hook internally calls useAllShotGenerations(shotId), creating a separate
  // React Query observer. 4 observers for the same query key amplify the render loop
  // because each runs observer.setOptions() every render.
  const timelineImages = useMemo(() => {
    return allShotImages
      .filter(g => {
        const location = g.imageUrl || g.location;
        const hasValidLocation = location && location !== '/placeholder.svg';
        return g.timeline_frame != null &&
               g.timeline_frame >= 0 &&
               !g.type?.includes('video') &&
               hasValidLocation;
      })
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
  }, [allShotImages]);

  const unpositionedImages = useMemo(() => {
    return allShotImages.filter(g => {
      const location = g.imageUrl || g.location;
      const hasValidLocation = location && location !== '/placeholder.svg';
      return g.timeline_frame == null &&
             !g.type?.includes('video') &&
             hasValidLocation;
    });
  }, [allShotImages]);

  const videoOutputs = useMemo(() => {
    return allShotImages.filter(g => g.type?.includes('video'));
  }, [allShotImages]);

  // PERF: Derive initial parent generations from fast videoOutputs cache
  // This allows FinalVideoSection to show thumbnail immediately while full segment data loads
  // Parent generations are videos with orchestrator_details (join output parents)
  const initialParentGenerations = useMemo(() => {
    return videoOutputs
      .filter(v => {
        const params = v.params as Record<string, unknown> | null;
        return params?.orchestrator_details != null;
      })
      .sort((a, b) => {
        // Sort by created_at descending (most recent first)
        const dateA = new Date(a.created_at || a.createdAt || 0).getTime();
        const dateB = new Date(b.created_at || b.createdAt || 0).getTime();
        return dateB - dateA;
      });
  }, [videoOutputs]);

  // Refs for stable access inside callbacks (avoid callback recreation on data changes)
  const allShotImagesRef = useRef<GenerationRow[]>(allShotImages);
  allShotImagesRef.current = allShotImages;
  const batchVideoFramesRef = useRef(batchVideoFrames);
  batchVideoFramesRef.current = batchVideoFrames;

  return {
    // Shot resolution
    selectedShot,
    foundShot,
    shots,

    // Project data
    selectedProjectId: selectedProjectId ?? projectId,
    projects,

    // Aspect ratio
    effectiveAspectRatio,

    // Image data
    allShotImages,
    timelineImages,
    unpositionedImages,
    videoOutputs,
    contextImages,
    isLoadingFullImages,
    initialParentGenerations,

    // Stability refs
    refs: {
      selectedShotRef,
      projectIdRef,
      allShotImagesRef,
      batchVideoFramesRef,
    },
  };
}
