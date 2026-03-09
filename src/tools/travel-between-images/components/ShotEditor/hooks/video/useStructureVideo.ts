import { useCallback, useMemo } from 'react';
import { useAutoSaveSettings } from '@/shared/settings/hooks/useAutoSaveSettings';
import type { VideoMetadata } from '@/shared/lib/media/videoUploader';
import {
  DEFAULT_STRUCTURE_VIDEO,
  type StructureGuidanceConfig,
  resolvePrimaryStructureVideo,
  StructureVideoConfig,
  StructureVideoConfigWithMetadata,
} from '@/shared/lib/tasks/travelBetweenImages';
import { migrateLegacyStructureVideos } from '@/shared/lib/tasks/travelBetweenImages/legacyStructureVideo';
import {
  buildStructureGuidanceFromControls,
  normalizeStructureGuidance,
  type StructureGuidanceControls,
  resolveStructureGuidanceControls,
} from '@/shared/lib/tasks/structureGuidance';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';

interface UseStructureVideoParams {
  projectId: string;
  shotId: string | undefined;
  /** Timeline frame range for auto-calculating default video ranges */
  timelineStartFrame?: number;
  timelineEndFrame?: number;
}

// Re-export types from the shared lib for convenience.
export type { StructureVideoConfig, StructureVideoConfigWithMetadata };

export interface UseStructureVideoReturn {
  /** Array of structure video configurations */
  structureVideos: StructureVideoConfigWithMetadata[];
  /** Canonical structure guidance persisted alongside structure videos. */
  structureGuidance?: StructureGuidanceConfig;
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

/** Canonical settings storage schema for travel structure guidance. */
interface StructureVideoSettings {
  structure_videos?: StructureVideoConfigWithMetadata[];
  structure_guidance?: StructureGuidanceConfig;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseTreatment(value: unknown): 'adjust' | 'clip' | undefined {
  return value === 'adjust' || value === 'clip' ? value : undefined;
}

function sanitizeEditableStructureVideos(
  videos: StructureVideoConfigWithMetadata[],
  defaultEndFrame: number,
): StructureVideoConfigWithMetadata[] {
  return videos
    .map((video) => {
      const path = parseString(video.path);
      if (!path) {
        return null;
      }

      return {
        path,
        start_frame: parseNumber(video.start_frame) ?? 0,
        end_frame: parseNumber(video.end_frame) ?? defaultEndFrame,
        treatment: parseTreatment(video.treatment) ?? DEFAULT_STRUCTURE_VIDEO.treatment,
        ...(parseNumber(video.source_start_frame) !== undefined
          ? { source_start_frame: parseNumber(video.source_start_frame) }
          : {}),
        ...(video.source_end_frame === null || parseNumber(video.source_end_frame) !== undefined
          ? { source_end_frame: video.source_end_frame ?? null }
          : {}),
        metadata: video.metadata ?? null,
        resource_id: video.resource_id ?? null,
      } satisfies StructureVideoConfigWithMetadata;
    })
    .filter((video): video is StructureVideoConfigWithMetadata => video !== null);
}

function mergeStoredStructureVideos(
  rawVideos: StructureVideoConfigWithMetadata[],
  structureGuidance: Record<string, unknown> | undefined,
  controls: StructureGuidanceControls,
  defaultEndFrame: number,
): StructureVideoConfigWithMetadata[] {
  const guidanceVideos = Array.isArray(structureGuidance?.videos)
    ? structureGuidance.videos.map((video) => asRecord(video)).filter((video): video is Record<string, unknown> => !!video)
    : [];
  const sourceVideos = guidanceVideos.length > 0 ? guidanceVideos : rawVideos;

  return sourceVideos
    .map((video, index) => {
      const path = parseString(video.path);
      if (!path) {
        return null;
      }

      const rawVideo = rawVideos[index];
      const mergedVideo = {
        path,
        start_frame: parseNumber(video.start_frame) ?? 0,
        end_frame: parseNumber(video.end_frame) ?? defaultEndFrame,
        treatment: parseTreatment(video.treatment) ?? DEFAULT_STRUCTURE_VIDEO.treatment,
        ...(parseNumber(video.source_start_frame) !== undefined
          ? { source_start_frame: parseNumber(video.source_start_frame) }
          : {}),
        ...(video.source_end_frame === null || parseNumber(video.source_end_frame) !== undefined
          ? { source_end_frame: video.source_end_frame ?? null }
          : {}),
        metadata: rawVideo?.metadata ?? null,
        resource_id: rawVideo?.resource_id ?? null,
      } satisfies StructureVideoConfigWithMetadata;

      return index === 0
        ? {
            ...mergedVideo,
            motion_strength: controls.motionStrength,
            structure_type: controls.structureType,
            uni3c_start_percent: controls.uni3cStartPercent,
            uni3c_end_percent: controls.uni3cEndPercent,
          }
        : mergedVideo;
    })
    .filter((video): video is StructureVideoConfigWithMetadata => video !== null);
}

/**
 * Hook to manage structure video state with database persistence.
 * Loads the canonical `structure_videos` + `structure_guidance` pair and
 * migrates older shapes only at the persistence boundary.
 */
export function useStructureVideo({
  projectId,
  shotId,
  timelineEndFrame = 81,
}: UseStructureVideoParams): UseStructureVideoReturn {
  const settings = useAutoSaveSettings<StructureVideoSettings>({
    toolId: SETTINGS_IDS.TRAVEL_STRUCTURE_VIDEO,
    projectId,
    shotId: shotId ?? null,
    scope: 'shot',
    defaults: { structure_videos: [], structure_guidance: undefined },
    enabled: !!shotId,
    debounceMs: 100,
  });

  const migratedStructureVideos = useMemo(
    () => migrateLegacyStructureVideos(settings.settings ?? null, {
      defaultEndFrame: timelineEndFrame,
      defaultVideoTreatment: DEFAULT_STRUCTURE_VIDEO.treatment,
      defaultMotionStrength: DEFAULT_STRUCTURE_VIDEO.motion_strength,
      defaultStructureType: DEFAULT_STRUCTURE_VIDEO.structure_type,
      defaultUni3cEndPercent: DEFAULT_STRUCTURE_VIDEO.uni3c_end_percent,
    }),
    [settings.settings, timelineEndFrame],
  );

  const structureGuidance = useMemo(
    () => normalizeStructureGuidance({
      structureGuidance: settings.settings?.structure_guidance,
      structureVideos: migratedStructureVideos,
      defaultVideoTreatment: DEFAULT_STRUCTURE_VIDEO.treatment,
      defaultUni3cEndPercent: DEFAULT_STRUCTURE_VIDEO.uni3c_end_percent,
    }) as StructureGuidanceConfig | undefined,
    [migratedStructureVideos, settings.settings?.structure_guidance],
  );

  const structureControls = useMemo(
    () => resolveStructureGuidanceControls(structureGuidance, {
      defaultStructureType: DEFAULT_STRUCTURE_VIDEO.structure_type,
      defaultMotionStrength: DEFAULT_STRUCTURE_VIDEO.motion_strength,
      defaultUni3cEndPercent: DEFAULT_STRUCTURE_VIDEO.uni3c_end_percent,
    }),
    [structureGuidance],
  );

  const structureVideos = useMemo(
    () => mergeStoredStructureVideos(
      migratedStructureVideos,
      asRecord(structureGuidance),
      structureControls,
      timelineEndFrame,
    ),
    [migratedStructureVideos, structureControls, structureGuidance, timelineEndFrame],
  );

  const setStructureVideos = useCallback((videos: StructureVideoConfigWithMetadata[]) => {
    const sanitizedVideos = sanitizeEditableStructureVideos(videos, timelineEndFrame);
    const currentControls = resolveStructureGuidanceControls(structureGuidance, {
      defaultStructureType: DEFAULT_STRUCTURE_VIDEO.structure_type,
      defaultMotionStrength: DEFAULT_STRUCTURE_VIDEO.motion_strength,
      defaultUni3cEndPercent: DEFAULT_STRUCTURE_VIDEO.uni3c_end_percent,
    });
    const primaryInput = videos[0];
    const nextControls = {
      ...currentControls,
      ...(primaryInput?.structure_type ? { structureType: primaryInput.structure_type } : {}),
      ...(primaryInput?.motion_strength !== undefined ? { motionStrength: primaryInput.motion_strength } : {}),
      ...(primaryInput?.uni3c_start_percent !== undefined ? { uni3cStartPercent: primaryInput.uni3c_start_percent } : {}),
      ...(primaryInput?.uni3c_end_percent !== undefined ? { uni3cEndPercent: primaryInput.uni3c_end_percent } : {}),
    };

    settings.updateFields({
      structure_videos: sanitizedVideos,
      structure_guidance: buildStructureGuidanceFromControls({
        structureVideos: sanitizedVideos,
        controls: nextControls,
        defaultVideoTreatment: DEFAULT_STRUCTURE_VIDEO.treatment,
        defaultUni3cEndPercent: DEFAULT_STRUCTURE_VIDEO.uni3c_end_percent,
      }),
    });
  }, [settings, structureGuidance, timelineEndFrame]);

  const addStructureVideo = useCallback((video: StructureVideoConfigWithMetadata) => {
    setStructureVideos([...structureVideos, video]);
  }, [setStructureVideos, structureVideos]);

  const updateStructureVideo = useCallback((index: number, updates: Partial<StructureVideoConfigWithMetadata>) => {
    if (index < 0 || index >= structureVideos.length) {
      return;
    }

    const next = [...structureVideos];
    next[index] = { ...next[index], ...updates };
    setStructureVideos(next);
  }, [setStructureVideos, structureVideos]);

  const removeStructureVideo = useCallback((index: number) => {
    if (index < 0 || index >= structureVideos.length) {
      return;
    }

    setStructureVideos(structureVideos.filter((_, i) => i !== index));
  }, [setStructureVideos, structureVideos]);

  const clearAllStructureVideos = useCallback(() => {
    settings.updateFields({
      structure_videos: [],
      structure_guidance: undefined,
    });
  }, [settings]);

  const primaryStructureVideo = useMemo(
    () => resolvePrimaryStructureVideo(structureVideos),
    [structureVideos],
  );

  return {
    structureVideos,
    structureGuidance,
    addStructureVideo,
    updateStructureVideo,
    removeStructureVideo,
    clearAllStructureVideos,
    setStructureVideos,
    isLoading: !!shotId && settings.status === 'loading',
    structureVideoPath: primaryStructureVideo.path,
    structureVideoMetadata: primaryStructureVideo.metadata,
    structureVideoTreatment: primaryStructureVideo.treatment,
    structureVideoMotionStrength: primaryStructureVideo.motionStrength,
    structureVideoType: primaryStructureVideo.structureType,
    structureVideoResourceId: structureVideos[0]?.resource_id ?? null,
    structureVideoUni3cEndPercent: primaryStructureVideo.uni3cEndPercent,
  };
}
