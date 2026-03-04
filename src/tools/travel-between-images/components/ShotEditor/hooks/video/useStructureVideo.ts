import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import type { VideoMetadata } from '@/shared/lib/media/videoUploader';
import {
  DEFAULT_STRUCTURE_VIDEO,
  StructureVideoConfig,
  StructureVideoConfigWithMetadata,
} from '@/shared/lib/tasks/travelBetweenImages';
import { migrateLegacyStructureVideos } from '@/shared/lib/tasks/travelBetweenImages/legacyStructureVideo';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';

interface UseStructureVideoParams {
  projectId: string;
  shotId: string | undefined;
  /** Timeline frame range for auto-calculating default video ranges */
  timelineStartFrame?: number;
  timelineEndFrame?: number;
}

// Re-export types from the shared lib for convenience
export type { StructureVideoConfig, StructureVideoConfigWithMetadata };

export interface UseStructureVideoReturn {
  // ============ NEW: Multi-video array interface ============
  /** Array of structure video configurations */
  structureVideos: StructureVideoConfigWithMetadata[];
  /** Add a new structure video to the array */
  addStructureVideo: (video: StructureVideoConfigWithMetadata) => void;
  /** Update a structure video at a specific index */
  updateStructureVideo: (index: number, video: Partial<StructureVideoConfigWithMetadata>) => void;
  /** Remove a structure video at a specific index */
  removeStructureVideo: (index: number) => void;
  /** Clear all structure videos */
  clearAllStructureVideos: () => void;
  /** Set the entire array of structure videos */
  setStructureVideos: (videos: StructureVideoConfigWithMetadata[]) => void;
  /** Loading state */
  isLoading: boolean;

  // Primary video accessors (derived from structureVideos[0])
  structureVideoPath: string | null;
  structureVideoMetadata: VideoMetadata | null;
  structureVideoTreatment: 'adjust' | 'clip';
  structureVideoMotionStrength: number;
  structureVideoType: 'uni3c' | 'flow' | 'canny' | 'depth';
  structureVideoResourceId: string | null;
  structureVideoUni3cEndPercent: number;
}

/**
 * Settings storage schema - supports both legacy single-video and new array format
 */
interface StructureVideoSettings {
  // Canonical array format (preferred)
  structure_videos?: StructureVideoConfigWithMetadata[];
}

/**
 * Hook to manage structure video state with database persistence.
 * Supports both legacy single-video format and new multi-video array format.
 * Handles loading from settings, auto-save on changes, and shot-switching.
 */
export function useStructureVideo({
  projectId,
  shotId,
  timelineEndFrame = 81,
}: UseStructureVideoParams): UseStructureVideoReturn {
  // Structure video persistence using tool settings (per-shot basis)
  // NOTE: Uses 'travel-structure-video' key - MediaLightbox and useSegmentSettings must read from this same key
  const {
    settings: structureVideoSettings,
    update: updateStructureVideoSettings,
    isLoading: isStructureVideoSettingsLoading
  } = useToolSettings<StructureVideoSettings>(SETTINGS_IDS.TRAVEL_STRUCTURE_VIDEO, {
    projectId,
    shotId: shotId,
    enabled: !!shotId
  });

  // Main state: array of structure videos
  const [structureVideos, setStructureVideosState] = useState<StructureVideoConfigWithMetadata[]>([]);
  const [hasInitialized, setHasInitialized] = useState<string | null>(null);

  // Reset initialization state when shot changes
  useEffect(() => {
    if (shotId !== hasInitialized) {
      setHasInitialized(null);
    }
  }, [shotId, hasInitialized]);

  // Track previous settings for external change detection (must be declared before both effects)
  const prevSettingsRef = useRef<StructureVideoSettings | null>(null);

  // Load structure videos from settings when shot loads (with migration)
  useEffect(() => {
    if (!hasInitialized && !isStructureVideoSettingsLoading && shotId) {
      const migratedVideos = migrateLegacyStructureVideos(
        structureVideoSettings ?? null,
        {
          defaultEndFrame: timelineEndFrame,
          defaultVideoTreatment: DEFAULT_STRUCTURE_VIDEO.treatment,
          defaultMotionStrength: DEFAULT_STRUCTURE_VIDEO.motion_strength,
          defaultStructureType: DEFAULT_STRUCTURE_VIDEO.structure_type,
          defaultUni3cEndPercent: DEFAULT_STRUCTURE_VIDEO.uni3c_end_percent,
        },
      );

      setStructureVideosState(migratedVideos);
      // Seed prevSettingsRef so the external sync effect doesn't immediately re-fire
      prevSettingsRef.current = structureVideoSettings ?? null;
      setHasInitialized(shotId);
    }
  }, [structureVideoSettings, isStructureVideoSettingsLoading, shotId, hasInitialized, timelineEndFrame]);

  // Sync local state when settings change externally (e.g., from "Set as Shot Defaults" in lightbox)
  // This runs AFTER initialization, when the underlying query data changes
  useEffect(() => {
    // Only sync after initial load, when settings actually change
    if (!hasInitialized || isStructureVideoSettingsLoading) return;

    // Compare with previous settings to detect external changes
    const prevSettings = prevSettingsRef.current;
    const currentSettings = structureVideoSettings ?? null;

    // Skip if settings haven't changed (same reference or both null)
    if (prevSettings === currentSettings) return;

    // Check if structure_videos array content changed
    const prevVideos = prevSettings?.structure_videos;
    const currentVideos = currentSettings?.structure_videos;

    // Only sync if the actual video data changed (not just a re-render)
    const videosChanged = JSON.stringify(prevVideos) !== JSON.stringify(currentVideos);

    if (videosChanged && currentVideos !== undefined) {
      const migratedVideos = migrateLegacyStructureVideos(
        currentSettings,
        {
          defaultEndFrame: timelineEndFrame,
          defaultVideoTreatment: DEFAULT_STRUCTURE_VIDEO.treatment,
          defaultMotionStrength: DEFAULT_STRUCTURE_VIDEO.motion_strength,
          defaultStructureType: DEFAULT_STRUCTURE_VIDEO.structure_type,
          defaultUni3cEndPercent: DEFAULT_STRUCTURE_VIDEO.uni3c_end_percent,
        },
      );
      setStructureVideosState(migratedVideos);
    }

    prevSettingsRef.current = currentSettings;
  }, [structureVideoSettings, isStructureVideoSettingsLoading, hasInitialized, shotId, timelineEndFrame]);

  // Refs for stable callbacks
  const updateSettingsRef = useRef(updateStructureVideoSettings);
  updateSettingsRef.current = updateStructureVideoSettings;

  // Save structure videos to database
  const saveToDatabase = useCallback((videos: StructureVideoConfigWithMetadata[]) => {
    updateSettingsRef.current('shot', {
      structure_videos: videos,
    });
  }, []);

  // ============ NEW: Array manipulation methods ============
  
  const setStructureVideos = useCallback((videos: StructureVideoConfigWithMetadata[]) => {
    setStructureVideosState(videos);
    saveToDatabase(videos);
  }, [saveToDatabase]);

  const addStructureVideo = useCallback((video: StructureVideoConfigWithMetadata) => {
    
    setStructureVideosState(prev => {
      const newVideos = [...prev, video];
      saveToDatabase(newVideos);
      return newVideos;
    });
  }, [saveToDatabase]);

  const updateStructureVideo = useCallback((index: number, updates: Partial<StructureVideoConfigWithMetadata>) => {
    
    setStructureVideosState(prev => {
      if (index < 0 || index >= prev.length) {
        return prev;
      }
      
      const newVideos = [...prev];
      newVideos[index] = { ...newVideos[index], ...updates };
      saveToDatabase(newVideos);
      return newVideos;
    });
  }, [saveToDatabase]);

  const removeStructureVideo = useCallback((index: number) => {
    
    setStructureVideosState(prev => {
      if (index < 0 || index >= prev.length) {
        return prev;
      }
      
      const newVideos = prev.filter((_, i) => i !== index);
      saveToDatabase(newVideos);
      return newVideos;
    });
  }, [saveToDatabase]);

  const clearAllStructureVideos = useCallback(() => {
    setStructureVideosState([]);
    saveToDatabase([]);
  }, [saveToDatabase]);

  const primaryStructureVideo = useMemo(
    () => structureVideos[0] ?? null,
    [structureVideos]
  );

  return {
    structureVideos,
    addStructureVideo,
    updateStructureVideo,
    removeStructureVideo,
    clearAllStructureVideos,
    setStructureVideos,
    isLoading: isStructureVideoSettingsLoading,
    structureVideoPath: primaryStructureVideo?.path ?? null,
    structureVideoMetadata: primaryStructureVideo?.metadata ?? null,
    structureVideoTreatment: primaryStructureVideo?.treatment ?? DEFAULT_STRUCTURE_VIDEO.treatment,
    structureVideoMotionStrength: primaryStructureVideo?.motion_strength ?? DEFAULT_STRUCTURE_VIDEO.motion_strength,
    structureVideoType: primaryStructureVideo?.structure_type ?? DEFAULT_STRUCTURE_VIDEO.structure_type,
    structureVideoResourceId: primaryStructureVideo?.resource_id ?? null,
    structureVideoUni3cEndPercent: primaryStructureVideo?.uni3c_end_percent ?? DEFAULT_STRUCTURE_VIDEO.uni3c_end_percent,
  };
}
