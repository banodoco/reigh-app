import { GenerationRow, PairLoraConfig, PairMotionSettings } from '@/types/shots';
import type { SegmentSlot } from '@/shared/hooks/segments';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { PairData } from '@/shared/types/pairData';
import type {
  ImageDeleteHandler,
  BatchImageDeleteHandler,
  ImageDuplicateHandler,
  ImageReorderHandler,
  FileDropHandler,
  GenerationDropHandler,
  AddToShotHandler,
} from '@/shared/types/imageHandlers';

/** Per-pair parameter overrides for showing override icons */
type PairOverridesMap = Record<number, {
  phaseConfig?: PhaseConfig;
  loras?: PairLoraConfig[];
  motionSettings?: PairMotionSettings;
}>;

// =============================================================================
// Prop sub-groups for ShotImageManagerProps
// =============================================================================

/** Core image CRUD and display props */
interface ShotImageCoreProps {
  images: GenerationRow[];
  onImageDelete: ImageDeleteHandler;
  onBatchImageDelete?: BatchImageDeleteHandler;
  onImageDuplicate?: ImageDuplicateHandler;
  /** @param draggedItemId - The ID of the item that was actually dragged (for midpoint insertion) */
  onImageReorder: ImageReorderHandler;
  columns?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  generationMode: 'batch' | 'timeline' | 'by-pair';
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  projectAspectRatio?: string;
  batchVideoFrames?: number;
  readOnly?: boolean;
  onSelectionChange?: (hasSelection: boolean) => void;
  /** Callback to notify parent of drag state changes - used to suppress query refetches during drag */
  onDragStateChange?: (isDragging: boolean) => void;
}

/** Upload and drop zone props */
interface ShotUploadProps {
  onImageUpload?: (files: File[]) => Promise<void>;
  isUploadingImage?: boolean;
  /** Drop files onto batch grid - component calculates targetFrame from grid position */
  onFileDrop?: FileDropHandler;
  /** Drop generation onto batch grid - component calculates targetFrame from grid position */
  onGenerationDrop?: GenerationDropHandler;
}

/** Shot management and cross-shot operations */
interface ShotManagementProps {
  shotId?: string;
  projectId?: string;
  toolTypeOverride?: string;
  allShots?: Array<{ id: string; name: string }>;
  selectedShotId?: string;
  onShotChange?: (shotId: string) => void;
  // CRITICAL: targetShotId is the shot selected in the DROPDOWN, not the shot being viewed
  onAddToShot?: AddToShotHandler;
  onAddToShotWithoutPosition?: AddToShotHandler;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{shotId?: string; shotName?: string} | void>;
  onNewShotFromSelection?: (selectedIds: string[]) => Promise<string | void>;
}

/** Per-pair prompt display and override props */
interface ShotPairPromptProps {
  onPairClick?: (pairIndex: number, pairData?: PairData) => void;
  pairPrompts?: Record<number, { prompt: string; negativePrompt: string }>;
  enhancedPrompts?: Record<number, string>;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  /** Callback to clear enhanced prompt for a pair */
  onClearEnhancedPrompt?: (pairIndex: number) => void;
  /** Per-pair parameter overrides for showing override icons */
  pairOverrides?: PairOverridesMap;
}

/** Segment video output props */
interface ShotSegmentProps {
  segmentSlots?: SegmentSlot[];
  onSegmentClick?: (slotIndex: number) => void;
  /** Check if a pair_shot_generation_id has a pending task */
  hasPendingTask?: (pairShotGenerationId: string | null | undefined) => boolean;
  /** Delete a segment video */
  onSegmentDelete?: (generationId: string) => void;
  /** ID of segment currently being deleted */
  deletingSegmentId?: string | null;
}

/** Lightbox and navigation props */
interface ShotLightboxProps {
  onOpenLightbox?: (index: number) => void;
  onMagicEdit?: (imageUrl: string, prompt: string, numImages: number) => void;
  /** Request to open lightbox for specific image (from segment constituent navigation) */
  pendingImageToOpen?: string | null;
  /** Variant ID to auto-select when opening from pendingImageToOpen */
  pendingImageVariantId?: string | null;
  /** Callback to clear the pending image request after handling */
  onClearPendingImageToOpen?: () => void;
  /** Helper to navigate with transition overlay (prevents flash when component type changes) */
  navigateWithTransition?: (doNavigation: () => void) => void;
}

/**
 * Full props for ShotImageManager.
 * Composed from logical sub-groups for documentation and maintainability.
 */
export interface ShotImageManagerProps extends
  ShotImageCoreProps,
  ShotUploadProps,
  ShotManagementProps,
  ShotPairPromptProps,
  ShotSegmentProps,
  ShotLightboxProps {}

export interface DerivedNavContext {
  sourceGenerationId: string;
  derivedGenerationIds: string[];
}

/**
 * Props for the mobile variant.
 * Picks from sub-groups plus mobile-specific additions.
 */
export interface BaseShotImageManagerProps extends
  ShotImageCoreProps,
  ShotPairPromptProps,
  ShotSegmentProps {
  onOpenLightbox?: (index: number) => void;
  onInpaintClick?: (index: number) => void;
  onImageUpload?: (files: File[]) => Promise<void>;
  isUploadingImage?: boolean;
  /** Create a new shot from selected images */
  onNewShotFromSelection?: (selectedIds: string[]) => Promise<string | void>;
  /** Change selected shot (used after creating a new shot from selection) */
  onShotChange?: (shotId: string) => void;
}

export interface ShotBatchItemMobileProps {
  image: GenerationRow;
  isSelected: boolean;
  index: number;
  onMobileTap: () => void;
  onDelete: () => void;
  onDuplicate?: (shotImageEntryId: string, timeline_frame: number) => void;
  onOpenLightbox?: () => void;
  onInpaintClick?: () => void;
  hideDeleteButton?: boolean;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  shouldLoad?: boolean;
  projectAspectRatio?: string;
  frameNumber?: number;
  readOnly?: boolean;
  /** Callback to mark all variants for this generation as viewed */
  onMarkAllViewed?: () => void;
}
