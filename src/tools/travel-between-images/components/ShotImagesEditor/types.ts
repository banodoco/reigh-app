/**
 * Types for ShotImagesEditor and its sub-components.
 */

import type { GenerationRow, Shot } from '@/domains/generation/types';
import type {
  StructureGuidanceConfig,
  StructureVideoConfigWithMetadata,
} from '@/shared/lib/tasks/travelBetweenImages';
import type { OnPrimaryStructureVideoInputChange } from '@/tools/travel-between-images/types/mediaHandlers';

// =============================================================================
// Main Component Props
// =============================================================================

interface ShotImagesEditorDisplayOptions {
  isModeReady: boolean;
  settingsError?: string | null;
  isMobile: boolean;
  generationMode: 'batch' | 'timeline' | 'by-pair';
  onGenerationModeChange: (mode: 'batch' | 'timeline' | 'by-pair') => void;
  columns: 2 | 3 | 4 | 6;
  skeleton: React.ReactNode;
  readOnly?: boolean;
  projectAspectRatio?: string;
  cachedHasStructureVideo?: boolean;
  maxFrameLimit?: number;
  smoothContinuations?: boolean;
  selectedOutputId?: string | null;
  onSelectedOutputChange?: (id: string | null) => void;
}

interface ShotImagesEditorImageState {
  selectedShotId: string;
  preloadedImages?: GenerationRow[];
  projectId?: string;
  shotName?: string;
  batchVideoFrames: number;
  pendingPositions: Map<string, number>;
  unpositionedGenerationsCount: number;
  fileInputKey: number;
  isUploadingImage: boolean;
  uploadProgress?: number;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  defaultPrompt?: string;
  onDefaultPromptChange?: (prompt: string) => void;
  defaultNegativePrompt?: string;
  onDefaultNegativePromptChange?: (prompt: string) => void;

  // Canonical structure video contract
  structureGuidance?: StructureGuidanceConfig;
  structureVideos?: StructureVideoConfigWithMetadata[];
  isStructureVideoLoading?: boolean;
  audioUrl?: string | null;
  audioMetadata?: { duration: number; name?: string } | null;
}

interface ShotImagesEditorEditActions {
  onImageReorder: (orderedIds: string[], draggedItemId?: string) => void;
  onFramePositionsChange: (newPositions: Map<string, number>) => void;
  onFileDrop: (files: File[], targetFrame?: number) => Promise<void>;
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetFrame?: number) => Promise<void>;
  onBatchFileDrop?: (files: File[], targetPosition?: number) => Promise<void>;
  onBatchGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetPosition?: number) => Promise<void>;
  onPendingPositionApplied: (generationId: string) => void;
  onImageDelete: (id: string) => void;
  onBatchImageDelete?: (ids: string[]) => void;
  onImageDuplicate?: (id: string, timeline_frame: number) => void;
  onOpenUnpositionedPane: () => void;
  onImageUpload: (files: File[]) => Promise<void>;

  onPrimaryStructureVideoInputChange?: OnPrimaryStructureVideoInputChange;
  onUni3cEndPercentChange?: (value: number) => void;

  onAddStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  onUpdateStructureVideo?: (index: number, updates: Partial<StructureVideoConfigWithMetadata>) => void;
  onRemoveStructureVideo?: (index: number) => void;
  onSetStructureVideos?: (videos: StructureVideoConfigWithMetadata[]) => void;

  onAudioChange?: (
    audioUrl: string | null,
    metadata: { duration: number; name?: string } | null,
  ) => void;
  onSelectionChange?: (hasSelection: boolean) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onTrailingDurationChange?: (durationFrames: number | undefined) => void;
}

interface ShotImagesEditorShotWorkflow {
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
