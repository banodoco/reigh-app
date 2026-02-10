/**
 * Types for ShotImagesEditor and its sub-components.
 */

import type { GenerationRow, Shot } from "@/types/shots";
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import type { PairData } from "../Timeline/TimelineContainer";
import type { StructureVideoConfigWithMetadata } from "@/shared/lib/tasks/travelBetweenImages";

// =============================================================================
// Main Component Props
// =============================================================================

export interface ShotImagesEditorProps {
  /** Controls whether internal UI should render the skeleton */
  isModeReady: boolean;
  /** Optional error text shown at the top of the card */
  settingsError?: string | null;
  /** Whether the UI is currently on a mobile breakpoint */
  isMobile: boolean;
  /** Current generation mode */
  generationMode: "batch" | "timeline";
  /** Callback to switch modes */
  onGenerationModeChange: (mode: "batch" | "timeline") => void;
  /** Selected shot id */
  selectedShotId: string;
  /** Optional preloaded images (for read-only/share views) - bypasses database queries */
  preloadedImages?: GenerationRow[];
  /** Read-only mode - disables all interactions */
  readOnly?: boolean;
  /** Project id for video uploads */
  projectId?: string;
  /** Shot name for download filename */
  shotName?: string;
  /** Frame spacing (frames between key-frames) */
  batchVideoFrames: number;
  /** Reordering callback – receives ordered ids and optionally the dragged item ID */
  onImageReorder: (orderedIds: string[], draggedItemId?: string) => void;
  /** Timeline frame positions change */
  onFramePositionsChange: (newPositions: Map<string, number>) => void;
  /** Callback when external images are dropped on the timeline */
  onFileDrop: (files: File[], targetFrame?: number) => Promise<void>;
  /** Callback when generations are dropped from GenerationsPane onto the timeline */
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetFrame?: number) => Promise<void>;
  /** Callback when external images are dropped on batch mode grid */
  onBatchFileDrop?: (files: File[], targetPosition?: number) => Promise<void>;
  /** Callback when generations are dropped from GenerationsPane onto batch mode grid */
  onBatchGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetPosition?: number) => Promise<void>;
  /** Map of pending frame positions coming from server */
  pendingPositions: Map<string, number>;
  /** Callback when pending position is applied */
  onPendingPositionApplied: (generationId: string) => void;
  /** Image deletion callback - id is shot_generations.id (unique per entry) */
  onImageDelete: (id: string) => void;
  /** Batch image deletion callback - ids are shot_generations.id values */
  onBatchImageDelete?: (ids: string[]) => void;
  /** Image duplication callback - id is shot_generations.id */
  onImageDuplicate?: (id: string, timeline_frame: number) => void;
  /** Number of columns for batch mode grid */
  columns: 2 | 3 | 4 | 6;
  /** Skeleton component to show while loading */
  skeleton: React.ReactNode;
  /** Count of unpositioned generations */
  unpositionedGenerationsCount: number;
  /** Callback to open unpositioned pane */
  onOpenUnpositionedPane: () => void;
  /** File input key for resetting */
  fileInputKey: number;
  /** Image upload callback */
  onImageUpload: (files: File[]) => Promise<void>;
  /** Whether currently uploading image */
  isUploadingImage: boolean;
  /** Upload progress (0-100) */
  uploadProgress?: number;
  /** ID of image currently being duplicated */
  duplicatingImageId?: string | null;
  /** ID of image that was just duplicated (for success indication) */
  duplicateSuccessImageId?: string | null;
  /** Project aspect ratio for display */
  projectAspectRatio?: string;
  /** Default prompt for timeline pairs (from existing generation settings) */
  defaultPrompt?: string;
  onDefaultPromptChange?: (prompt: string) => void;
  /** Default negative prompt for timeline pairs (from existing generation settings) */
  defaultNegativePrompt?: string;
  onDefaultNegativePromptChange?: (prompt: string) => void;

  // Structure video props - legacy single-video interface
  structureVideoPath?: string | null;
  structureVideoMetadata?: VideoMetadata | null;
  structureVideoTreatment?: 'adjust' | 'clip';
  structureVideoMotionStrength?: number;
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth';
  /** Uni3C end percent (only used when structureVideoType is 'uni3c') */
  uni3cEndPercent?: number;
  onStructureVideoChange?: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => void;
  /** Callback for changing uni3c end percent */
  onUni3cEndPercentChange?: (value: number) => void;

  // Multi-video array interface
  structureVideos?: StructureVideoConfigWithMetadata[];
  onAddStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  onUpdateStructureVideo?: (index: number, updates: Partial<StructureVideoConfigWithMetadata>) => void;
  onRemoveStructureVideo?: (index: number) => void;
  /** Set the entire structure videos array (for overlap resolution) */
  onSetStructureVideos?: (videos: StructureVideoConfigWithMetadata[]) => void;

  /** Audio strip props */
  audioUrl?: string | null;
  audioMetadata?: { duration: number; name?: string } | null;
  onAudioChange?: (
    audioUrl: string | null,
    metadata: { duration: number; name?: string } | null
  ) => void;

  /** Callback when selection state changes */
  onSelectionChange?: (hasSelection: boolean) => void;

  /** Shot management for external generation viewing */
  allShots?: Shot[];
  onShotChange?: (shotId: string) => void;
  onAddToShot?: (shotId: string, generationId: string, position?: number) => Promise<void>;
  onAddToShotWithoutPosition?: (shotId: string, generationId: string) => Promise<boolean>;
  onCreateShot?: (name: string) => Promise<string>;
  onNewShotFromSelection?: (selectedIds: string[]) => Promise<string | void>;

  /** Callback to notify parent of drag state changes - used to suppress query refetches during drag */
  onDragStateChange?: (isDragging: boolean) => void;
  /** Callback when single-image duration changes (for single-image video generation) */
  onTrailingDurationChange?: (durationFrames: number | undefined) => void;
  /** Maximum frame limit for timeline gaps (77 when smoothContinuations enabled, 81 otherwise) */
  maxFrameLimit?: number;
  /** Whether smooth continuations is enabled - used to compact timeline gaps when toggled */
  smoothContinuations?: boolean;
  /** Shared selected output parent ID (for syncing FinalVideoSection with SegmentOutputStrip) */
  selectedOutputId?: string | null;
  /** Callback when selected output changes */
  onSelectedOutputChange?: (id: string | null) => void;
}

// =============================================================================
// Preview Together Dialog Types
// =============================================================================

export interface PreviewSegment {
  hasVideo: boolean;
  videoUrl: string | null;
  thumbUrl: string | null;
  startImageUrl: string | null;
  endImageUrl: string | null;
  index: number;
  durationFromFrames: number;
}

export interface PreviewTogetherDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  previewableSegments: PreviewSegment[];
  projectAspectRatio?: string;
  audioUrl?: string | null;
}

// =============================================================================
// Segment Slot Types
// =============================================================================

interface SegmentSlotState {
  segmentSlotLightboxIndex: number | null;
  activePairData: PairData | null;
  pendingImageToOpen: string | null;
  isLightboxTransitioning: boolean;
  deletingSegmentId: string | null;
}

// =============================================================================
// Stable Callback Dependencies
// =============================================================================

interface StableCallbackDeps {
  loadPositions: (options?: { silent?: boolean }) => Promise<void>;
  pairDataByIndex: Map<number, PairData>;
  setSegmentSlotLightboxIndex: (index: number | null) => void;
  setActivePairData: (data: PairData | null) => void;
  shotGenerations: GenerationRow[];
  clearEnhancedPrompt: (shotGenerationId: string) => Promise<void>;
  onCreateShot?: (name: string) => Promise<string>;
}

// =============================================================================
// Hook Return Types
// =============================================================================

interface UsePreviewStateReturn {
  isPreviewTogetherOpen: boolean;
  setIsPreviewTogetherOpen: (open: boolean) => void;
  currentPreviewIndex: number;
  setCurrentPreviewIndex: (index: number | ((prev: number) => number)) => void;
  previewIsPlaying: boolean;
  setPreviewIsPlaying: (playing: boolean | ((prev: boolean) => boolean)) => void;
  previewCurrentTime: number;
  setPreviewCurrentTime: (time: number) => void;
  previewDuration: number;
  setPreviewDuration: (duration: number) => void;
  isPreviewVideoLoading: boolean;
  setIsPreviewVideoLoading: (loading: boolean) => void;
  // Audio sync
  segmentDurations: number[];
  setSegmentDurations: (durations: number[]) => void;
  segmentOffsets: number[];
  setSegmentOffsets: (offsets: number[]) => void;
  isAudioEnabled: boolean;
  setIsAudioEnabled: (enabled: boolean) => void;
  // Crossfade
  crossfadeProgress: number;
  setCrossfadeProgress: (progress: number) => void;
  // Dual video
  activeVideoSlot: 'A' | 'B';
  setActiveVideoSlot: (slot: 'A' | 'B') => void;
  preloadedIndex: number | null;
  setPreloadedIndex: (index: number | null) => void;
}

// UseLightboxTransitionReturn is defined in ./hooks/useLightboxTransition.ts

// Re-export PairData for convenience
export type { PairData } from "../Timeline/TimelineContainer";
