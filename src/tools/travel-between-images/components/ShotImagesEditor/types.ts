/**
 * Types for ShotImagesEditor and its sub-components.
 */

import type { GenerationRow, Shot } from '@/domains/generation/types';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';

// =============================================================================
// Main Component Props
// =============================================================================

export interface ShotImagesEditorDisplayOptions {
  /** Controls whether internal UI should render the skeleton */
  isModeReady: boolean;
  /** Optional error text shown at the top of the card */
  settingsError?: string | null;
  /** Whether the UI is currently on a mobile breakpoint */
  isMobile: boolean;
  /** Current generation mode */
  generationMode: 'batch' | 'timeline' | 'by-pair';
  /** Callback to switch modes */
  onGenerationModeChange: (mode: 'batch' | 'timeline' | 'by-pair') => void;
  /** Number of columns for batch mode grid */
  columns: 2 | 3 | 4 | 6;
  /** Skeleton component to show while loading */
  skeleton: React.ReactNode;
  /** Read-only mode - disables all interactions */
  readOnly?: boolean;
  /** Project aspect ratio for display */
  projectAspectRatio?: string;
  /** Project-level cache: whether this shot has structure videos (for skeleton) */
  cachedHasStructureVideo?: boolean;
  /** Maximum frame limit for timeline gaps (77 when smoothContinuations enabled, 81 otherwise) */
  maxFrameLimit?: number;
  /** Whether smooth continuations is enabled - used to compact timeline gaps when toggled */
  smoothContinuations?: boolean;
  /** Shared selected output parent ID (for syncing FinalVideoSection with SegmentOutputStrip) */
  selectedOutputId?: string | null;
  /** Callback when selected output changes */
  onSelectedOutputChange?: (id: string | null) => void;
}

export interface ShotImagesEditorImageState {
  /** Selected shot id */
  selectedShotId: string;
  /** Optional preloaded images (for read-only/share views) - bypasses database queries */
  preloadedImages?: GenerationRow[];
  /** Project id for video uploads */
  projectId?: string;
  /** Shot name for download filename */
  shotName?: string;
  /** Frame spacing (frames between key-frames) */
  batchVideoFrames: number;
  /** Map of pending frame positions coming from server */
  pendingPositions: Map<string, number>;
  /** Count of unpositioned generations */
  unpositionedGenerationsCount: number;
  /** File input key for resetting */
  fileInputKey: number;
  /** Whether currently uploading image */
  isUploadingImage: boolean;
  /** Upload progress (0-100) */
  uploadProgress?: number;
  /** ID of image currently being duplicated */
  duplicatingImageId?: string | null;
  /** ID of image that was just duplicated (for success indication) */
  duplicateSuccessImageId?: string | null;
  /** Default prompt for timeline pairs (from existing generation settings) */
  defaultPrompt?: string;
  onDefaultPromptChange?: (prompt: string) => void;
  /** Default negative prompt for timeline pairs (from existing generation settings) */
  defaultNegativePrompt?: string;
  onDefaultNegativePromptChange?: (prompt: string) => void;

  // Structure video props - legacy single-video interface
  primaryStructureVideoPath?: string | null;
  primaryStructureVideoMetadata?: VideoMetadata | null;
  primaryStructureVideoTreatment?: 'adjust' | 'clip';
  primaryStructureVideoMotionStrength?: number;
  primaryStructureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth';
  /** Uni3C end percent (only used when primaryStructureVideoType is 'uni3c') */
  primaryStructureVideoUni3cEndPercent?: number;

  // Multi-video array interface
  structureVideos?: StructureVideoConfigWithMetadata[];
  isStructureVideoLoading?: boolean;

  /** Audio strip props */
  audioUrl?: string | null;
  audioMetadata?: { duration: number; name?: string } | null;
}

export interface ShotImagesEditorEditActions {
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
  /** Callback when pending position is applied */
  onPendingPositionApplied: (generationId: string) => void;
  /** Image deletion callback - id is shot_generations.id (unique per entry) */
  onImageDelete: (id: string) => void;
  /** Batch image deletion callback - ids are shot_generations.id values */
  onBatchImageDelete?: (ids: string[]) => void;
  /** Image duplication callback - id is shot_generations.id */
  onImageDuplicate?: (id: string, timeline_frame: number) => void;
  /** Callback to open unpositioned pane */
  onOpenUnpositionedPane: () => void;
  /** Image upload callback */
  onImageUpload: (files: File[]) => Promise<void>;

  onPrimaryStructureVideoInputChange?: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string,
  ) => void;
  /** Callback for changing uni3c end percent */
  onUni3cEndPercentChange?: (value: number) => void;

  onAddStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  onUpdateStructureVideo?: (index: number, updates: Partial<StructureVideoConfigWithMetadata>) => void;
  onRemoveStructureVideo?: (index: number) => void;
  /** Set the entire structure videos array (for overlap resolution) */
  onSetStructureVideos?: (videos: StructureVideoConfigWithMetadata[]) => void;

  onAudioChange?: (
    audioUrl: string | null,
    metadata: { duration: number; name?: string } | null,
  ) => void;

  /** Callback when selection state changes */
  onSelectionChange?: (hasSelection: boolean) => void;

  /** Callback to notify parent of drag state changes - used to suppress query refetches during drag */
  onDragStateChange?: (isDragging: boolean) => void;
  /** Callback when single-image duration changes (for single-image video generation) */
  onTrailingDurationChange?: (durationFrames: number | undefined) => void;
}

export interface ShotImagesEditorShotWorkflow {
  /** Shot management for external generation viewing */
  allShots?: Shot[];
  onShotChange?: (shotId: string) => void;
  onAddToShot?: (shotId: string, generationId: string, position?: number) => Promise<void>;
  onAddToShotWithoutPosition?: (shotId: string, generationId: string) => Promise<boolean>;
  onCreateShot?: (name: string) => Promise<string>;
  onNewShotFromSelection?: (selectedIds: string[]) => Promise<string | void>;
}

export interface ShotImagesEditorProps {
  displayOptions: ShotImagesEditorDisplayOptions;
  imageState: ShotImagesEditorImageState;
  editActions: ShotImagesEditorEditActions;
  shotWorkflow: ShotImagesEditorShotWorkflow;
}

export type ShotImagesEditorResolvedProps =
  & ShotImagesEditorDisplayOptions
  & ShotImagesEditorImageState
  & ShotImagesEditorEditActions
  & ShotImagesEditorShotWorkflow;

export function resolveShotImagesEditorProps(props: ShotImagesEditorProps): ShotImagesEditorResolvedProps {
  return {
    ...props.displayOptions,
    ...props.imageState,
    ...props.editActions,
    ...props.shotWorkflow,
  };
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

interface PreviewTogetherDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  previewableSegments: PreviewSegment[];
  projectAspectRatio?: string;
  audioUrl?: string | null;
}

export type { PreviewTogetherDialogProps };
