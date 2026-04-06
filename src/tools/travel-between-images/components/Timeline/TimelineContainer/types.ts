import type { GenerationRow } from '@/domains/generation/types';
import type {
  ImageDeleteHandler,
  ImageReorderHandler,
  FileDropHandler,
  GenerationDropHandler,
} from '@/shared/types/imageHandlers';
import type { SegmentSlot } from '@/shared/hooks/segments';

// Re-export PairData from shared for backwards compatibility
export type { PairData } from '@/shared/types/pairData';

// ---------------------------------------------------------------------------
// Sub-interfaces (grouped for readability)
// ---------------------------------------------------------------------------

interface TimelinePairProps {
  onPairClick?: (pairIndex: number) => void;
  pairPrompts?: Record<number, { prompt: string; negativePrompt: string }>;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  onClearEnhancedPrompt?: (pairIndex: number) => void;
}

interface TimelineImageActionProps {
  onImageDelete: ImageDeleteHandler;
  onImageDuplicate: (imageId: string, timelineFrame: number, nextTimelineFrame?: number) => void;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
}

interface TimelineLightboxProps {
  handleDesktopDoubleClick: (idx: number) => void;
  handleMobileTap: (idx: number) => void;
  handleInpaintClick?: (idx: number) => void;
}

interface TimelineSegmentProps {
  selectedOutputId?: string | null;
  onSegmentFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  segmentSlots?: SegmentSlot[];
  isSegmentsLoading?: boolean;
  hasPendingTask?: (pairShotGenerationId: string | null | undefined) => boolean;
  videoOutputs?: GenerationRow[];
}

// ---------------------------------------------------------------------------
// Main props = core + sub-interfaces
// ---------------------------------------------------------------------------

export interface TimelineContainerProps extends
  TimelinePairProps,
  TimelineImageActionProps,
  TimelineLightboxProps,
  TimelineSegmentProps {
  // Core
  shotId: string;
  projectId?: string;
  images: GenerationRow[];
  framePositions: Map<string, number>;
  setFramePositions: (positions: Map<string, number>) => Promise<void>;
  onImageReorder: ImageReorderHandler;
  onFileDrop?: FileDropHandler;
  onGenerationDrop?: GenerationDropHandler;
  setIsDragInProgress: (dragging: boolean) => void;
  onResetFrames: (gap: number) => Promise<void>;
  // Display / state
  projectAspectRatio?: string;
  hasNoImages?: boolean;
  readOnly?: boolean;
  isUploadingImage?: boolean;
  uploadProgress?: number;
  maxFrameLimit?: number;
  // Multi-select
  onNewShotFromSelection?: (selectedIds: string[]) => Promise<string | void>;
  onShotChange?: (shotId: string) => void;
  // Position system
  onRegisterTrailingUpdater?: (fn: (endFrame: number) => void) => void;
}
