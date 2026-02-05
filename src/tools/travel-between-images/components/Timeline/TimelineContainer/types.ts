import type { GenerationRow } from '@/types/shots';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
import type {
  ImageDeleteHandler,
  ImageDuplicateHandler,
  ImageReorderHandler,
  FileDropHandler,
  GenerationDropHandler,
} from '@/shared/types/imageHandlers';

// Re-export PairData from shared for backwards compatibility
export type { PairData } from '@/shared/types/pairData';

export interface TimelineContainerProps {
  shotId: string;
  projectId?: string;
  images: GenerationRow[];
  framePositions: Map<string, number>;
  setFramePositions: (positions: Map<string, number>) => Promise<void>;
  onImageReorder: ImageReorderHandler;
  onFileDrop?: FileDropHandler;
  onGenerationDrop?: GenerationDropHandler;
  setIsDragInProgress: (dragging: boolean) => void;
  // Control props
  onResetFrames: (gap: number) => Promise<void>;
  // Pair-specific props
  onPairClick?: (pairIndex: number, pairData: PairData) => void;
  pairPrompts?: Record<number, { prompt: string; negativePrompt: string }>;
  enhancedPrompts?: Record<number, string>;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  onClearEnhancedPrompt?: (pairIndex: number) => void;
  // Action handlers
  onImageDelete: ImageDeleteHandler;
  onImageDuplicate: ImageDuplicateHandler;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  projectAspectRatio?: string;
  // Lightbox handlers
  handleDesktopDoubleClick: (idx: number) => void;
  handleMobileTap: (idx: number) => void;
  handleInpaintClick?: (idx: number) => void;
  // Structure video props (legacy single-video interface)
  structureVideoPath?: string | null;
  structureVideoMetadata?: VideoMetadata | null;
  structureVideoTreatment?: 'adjust' | 'clip';
  structureVideoMotionStrength?: number;
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth';
  onStructureVideoChange?: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => void;
  /** Uni3C end percent (only used when structureVideoType is 'uni3c') */
  uni3cEndPercent?: number;
  onUni3cEndPercentChange?: (value: number) => void;

  // Multi-video array interface
  structureVideos?: StructureVideoConfigWithMetadata[];
  onAddStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  onUpdateStructureVideo?: (index: number, updates: Partial<StructureVideoConfigWithMetadata>) => void;
  onRemoveStructureVideo?: (index: number) => void;
  // Audio strip props
  audioUrl?: string | null;
  audioMetadata?: { duration: number; name?: string } | null;
  onAudioChange?: (
    audioUrl: string | null,
    metadata: { duration: number; name?: string } | null
  ) => void;
  // Empty state flag for blur effect
  hasNoImages?: boolean;
  // Read-only mode - disables all interactions
  readOnly?: boolean;
  // Upload progress tracking
  isUploadingImage?: boolean;
  uploadProgress?: number;
  // Maximum frame limit for timeline gaps (77 with smooth continuations, 81 otherwise)
  maxFrameLimit?: number;
  // Shared output selection state (syncs FinalVideoSection with SegmentOutputStrip)
  selectedOutputId?: string | null;
  onSelectedOutputChange?: (id: string | null) => void;
  // Callback when segment frame count changes (for instant timeline updates)
  onSegmentFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  // Preloaded video outputs for readOnly mode (bypasses database query)
  videoOutputs?: GenerationRow[];
  // Multi-select: callback to create a new shot from selected images (returns new shot ID)
  onNewShotFromSelection?: (selectedIds: string[]) => Promise<string | void>;
  // Callback to navigate to a different shot (used for "Jump to shot" after creation)
  onShotChange?: (shotId: string) => void;
  // Position system: register trailing end frame updater with parent
  onRegisterTrailingUpdater?: (fn: (endFrame: number) => void) => void;
}

// Sub-component prop types are defined in their respective files
// and re-exported from components/index.ts
