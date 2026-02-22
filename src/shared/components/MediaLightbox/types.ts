import type { GenerationRow } from '@/types/shots';
import type { Task } from '@/types/database';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';

/**
 * Shared task details data shape used by lightbox components.
 * Passed through from parent to InfoPanel/TaskDetailsPanelWrapper.
 */
export interface TaskDetailsData {
  task: Task | null;
  isLoading: boolean;
  error: Error | null;
  inputImages: string[];
  taskId: string | null;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  onClose?: () => void;
}

/**
 * Information about an adjacent segment (video) for navigation.
 * Used to show "jump to video" buttons when viewing an image in the lightbox.
 */
interface AdjacentSegmentInfo {
  /** Pair index to navigate to */
  pairIndex: number;
  /** Whether this segment has a generated video */
  hasVideo: boolean;
  /** Start image URL (thumbnail preferred) */
  startImageUrl?: string;
  /** End image URL (thumbnail preferred) */
  endImageUrl?: string;
}

/**
 * Adjacent segments data for the current image.
 * - prev: The segment that ENDS with this image (before this image in timeline)
 * - next: The segment that STARTS with this image (after this image in timeline)
 */
export interface AdjacentSegmentsData {
  prev?: AdjacentSegmentInfo;
  next?: AdjacentSegmentInfo;
  /** Callback to navigate to a segment by pair index */
  onNavigateToSegment: (pairIndex: number) => void;
}

interface BrushStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  isErasing: boolean;
}

export interface QuickCreateSuccess {
  isSuccessful: boolean;
  shotId: string | null;
  shotName: string | null;
  isLoading?: boolean; // True when shot is created but still syncing/loading
}

export interface ShotOption {
  id: string;
  name: string;
}

/**
 * Unified segment slot data for MediaLightbox segment editor mode.
 * Combines pair data (images on timeline) with optional segment video.
 */
export interface SegmentSlotModeData {
  /** Current pair index (0-based) */
  currentIndex: number;
  /** Total number of pairs */
  totalPairs: number;

  /** Pair data from the timeline */
  pairData: {
    index: number;
    frames: number;
    startFrame: number;
    endFrame: number;
    startImage: {
      id: string;           // shot_generation.id
      generationId?: string; // generation_id
      primaryVariantId?: string; // generation_variants.id of primary variant
      url?: string;
      thumbUrl?: string;
      position: number;
    } | null;
    endImage: {
      id: string;
      generationId?: string;
      primaryVariantId?: string;
      url?: string;
      thumbUrl?: string;
      position: number;
    } | null;
  };

  /** The video generation if this slot has one, null otherwise */
  segmentVideo: GenerationRow | null;
  /** Active child generation ID (for creating variants on correct child) */
  activeChildGenerationId?: string;

  /** Navigation callback - called with new pair index */
  onNavigateToPair: (index: number) => void;

  /** Project/shot context */
  projectId: string | null;
  shotId: string;
  /** Parent generation ID (for regeneration task linking) */
  parentGenerationId?: string;

  /** Prompts for this pair */
  pairPrompt?: string;
  pairNegativePrompt?: string;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  enhancedPrompt?: string;

  /** Project resolution for output */
  projectResolution?: string;

  /** Structure video config for this segment (if applicable) */
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth' | null;
  structureVideoDefaults?: {
    motionStrength: number;
    treatment: 'adjust' | 'clip';
    uni3cEndPercent: number;
  };
  structureVideoUrl?: string;
  structureVideoFrameRange?: {
    segmentStart: number;
    segmentEnd: number;
    videoTotalFrames: number;
    videoFps: number;
    /** Video's output start position on timeline (for "fit to range" calculation) */
    videoOutputStart?: number;
    /** Video's output end position on timeline (for "fit to range" calculation) */
    videoOutputEnd?: number;
  };

  /** Callback when frame count changes - for instant timeline updates */
  onFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  /** Callback when generate is initiated (for optimistic UI updates) */
  onGenerateStarted?: (pairShotGenerationId: string | null | undefined) => void;
  /** Maximum frames allowed (77 with smooth continuations, 81 otherwise) */
  maxFrameLimit?: number;

  // Per-segment structure video management (Timeline Mode only)
  /** Whether in timeline mode (shows structure video upload) vs batch mode (preview only) */
  isTimelineMode?: boolean;
  /** All existing structure videos (for overlap detection) */
  existingStructureVideos?: StructureVideoConfigWithMetadata[];
  /** Callback to add a structure video for this segment (handles overlap resolution) */
  onAddSegmentStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  /** Callback to update this segment's structure video */
  onUpdateSegmentStructureVideo?: (updates: Partial<StructureVideoConfigWithMetadata>) => void;
  /** Callback to remove this segment's structure video */
  onRemoveSegmentStructureVideo?: () => void;

  /** Callback to navigate to a constituent image by shot_generation.id */
  onNavigateToImage?: (shotGenerationId: string) => void;

  /** Adjacent video thumbnails for preview sequence pill (video lightbox only) */
  adjacentVideoThumbnails?: {
    prev?: { thumbUrl: string; pairIndex: number };
    current?: { thumbUrl: string; pairIndex: number };
    next?: { thumbUrl: string; pairIndex: number };
  };
  /** Callback to open the preview-together dialog starting at a given pair index */
  onOpenPreviewDialog?: (startAtPairIndex: number) => void;
}
