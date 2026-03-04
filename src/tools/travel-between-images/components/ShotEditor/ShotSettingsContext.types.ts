import { QueryClient } from '@tanstack/react-query';
import { Shot, GenerationRow } from '@/domains/generation/types';
import type { Project } from '@/types/project';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import type { VideoMetadata } from '@/shared/lib/media/videoUploader';
import { ShotEditorState } from './state/types';
import { ShotEditorActions } from './state/useShotEditorState';
import { LoraManagerReturn } from './hooks/editor-state/useLoraSync';
import type { UseStructureVideoReturn } from './hooks/video/useStructureVideo';
import type { UseAudioReturn } from './hooks/video/useAudio';
import type { UseLoraManagerReturn } from '@/shared/hooks/useLoraManager';
import type { JoinSegmentsSettings } from '@/tools/travel-between-images/hooks/settings/useJoinSegmentsSettings';
import type {
  ImageDeleteHandler,
  BatchImageDeleteHandler,
  ImageDuplicateHandler,
  ImageReorderHandler,
  FileDropHandler,
  GenerationDropHandler,
  ImageUploadHandler,
} from '@/shared/types/imageHandlers';

export interface ShotCoreState {
  selectedShot: Shot;
  selectedShotId: string;
  projectId: string;
  selectedProjectId: string;
  effectiveAspectRatio: string | undefined;
}

export interface ShotLoraState {
  loraManager: LoraManagerReturn;
  availableLoras: LoraModel[];
}

export interface ShotImagesState {
  allShotImages: GenerationRow[];
  timelineImages: GenerationRow[];
  unpositionedImages: GenerationRow[];
  contextImages: GenerationRow[];
  videoOutputs: GenerationRow[];
  simpleFilteredImages: GenerationRow[];
}

export interface ShotImageHandlers {
  onReorder: ImageReorderHandler;
  onFileDrop: FileDropHandler;
  onGenerationDrop: GenerationDropHandler;
  onBatchFileDrop: FileDropHandler;
  onBatchGenerationDrop: GenerationDropHandler;
  onDelete: ImageDeleteHandler;
  onBatchDelete: BatchImageDeleteHandler;
  onDuplicate: ImageDuplicateHandler;
  onUpload: ImageUploadHandler;
}

export interface ShotManagementState {
  allShots: Shot[];
  onShotChange: (shotId: string) => void;
  onAddToShot: (shotId: string, generationId: string, position?: number) => Promise<void>;
  onAddToShotWithoutPosition: (shotId: string, generationId: string) => Promise<boolean>;
  onCreateShot: (name: string) => Promise<string>;
  onNewShotFromSelection: (selectedIds: string[]) => Promise<string | void>;
  openUnpositionedGenerationsPane: () => void;
}

export interface GenerationModeState {
  generateMode: 'batch' | 'join';
  setGenerateMode: (mode: 'batch' | 'join') => void;
  toggleGenerateModePreserveScroll: (targetMode: 'batch' | 'join') => void;
  isGenerationDisabled: boolean;
  isSteerableMotionEnqueuing: boolean;
  steerableMotionJustQueued: boolean;
  currentMotionSettings: {
    textBeforePrompts: string;
    textAfterPrompts: string;
    basePrompt: string;
    negativePrompt: string;
    enhancePrompt: boolean;
    durationFrames: number;
    lastGeneratedVideoUrl?: string;
    selectedLoras: Array<{ id: string; name: string; strength: number }>;
  };
  accelerated: boolean;
  onAcceleratedChange: (val: boolean) => void;
  randomSeed: boolean;
  onRandomSeedChange: (val: boolean) => void;
}

export interface GenerationHandlers {
  handleGenerateBatch: (variantName: string) => void;
  handleBatchVideoPromptChangeWithClear: (prompt: string) => void;
  handleStepsChange: (steps: number) => void;
  clearAllEnhancedPrompts: () => Promise<void>;
}

export interface StructureVideoHandlers {
  handleStructureVideoMotionStrengthChange: (strength: number) => void;
  handleStructureTypeChangeFromMotionControl: (type: 'uni3c' | 'flow' | 'canny' | 'depth') => void;
  handleUni3cEndPercentChange: (value: number) => void;
  handleStructureVideoInputChange: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => void;
}

export interface JoinState {
  joinSettings: {
    settings: JoinSegmentsSettings;
    updateField: <K extends keyof JoinSegmentsSettings>(field: K, value: JoinSegmentsSettings[K]) => void;
    updateFields: (fields: Partial<JoinSegmentsSettings>) => void;
  };
  joinLoraManager: UseLoraManagerReturn;
  joinValidationData: {
    videoCount: number;
    shortestClipFrames?: number;
  };
  handleJoinSegments: () => void;
  isJoiningClips: boolean;
  joinClipsSuccess: boolean;
  handleRestoreJoinDefaults: () => void;
}

export interface DimensionState {
  dimensionSource?: 'project' | 'firstImage' | 'custom';
  onDimensionSourceChange?: (source: 'project' | 'firstImage' | 'custom') => void;
  customWidth?: number;
  onCustomWidthChange?: (width?: number) => void;
  customHeight?: number;
  onCustomHeightChange?: (height?: number) => void;
}

export interface ShotSettingsContextValue {
  selectedShot: Shot;
  selectedShotId: string;
  projectId: string;
  selectedProjectId: string;
  effectiveAspectRatio: string | undefined;
  projects: Project[];
  state: ShotEditorState;
  actions: ShotEditorActions;
  loraManager: LoraManagerReturn;
  availableLoras: LoraModel[];
  allShotImages: GenerationRow[];
  timelineImages: GenerationRow[];
  unpositionedImages: GenerationRow[];
  contextImages: GenerationRow[];
  videoOutputs: GenerationRow[];
  simpleFilteredImages: GenerationRow[];
  structureVideo: UseStructureVideoReturn;
  structureVideoHandlers: StructureVideoHandlers;
  audio: UseAudioReturn;
  imageHandlers: ShotImageHandlers;
  shotManagement: ShotManagementState;
  generationMode: GenerationModeState;
  generationHandlers: GenerationHandlers;
  joinState: JoinState;
  dimensions: DimensionState;
  queryClient: QueryClient;
}
