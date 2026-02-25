/**
 * ShotSettingsContext - Shot data and UI state for ShotSettingsEditor sections
 *
 * This context provides:
 * - Core: Shot data (selected shot, project, images)
 * - UI: State and actions for editor UI
 * - Structure Video: Video overlay configuration
 * - Audio: Audio track management
 * - Image Handlers: Timeline manipulation callbacks
 * - Shot Management: Shot navigation and creation
 *
 * Settings (prompt, motion, frames, etc.) come from VideoTravelSettingsProvider.
 * Use the focused hooks (usePromptSettings, useMotionSettings, etc.) for settings.
 *
 * @see providers/VideoTravelSettingsProvider.tsx for settings context
 */

import React, { createContext, useContext } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { Shot, GenerationRow } from '@/domains/generation/types';
import type { Project } from '@/types/project';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import { ShotEditorState } from './state/types';
import { ShotEditorActions } from './state/useShotEditorState';
import { LoraManagerReturn } from './hooks/useLoraSync';
import type { UseStructureVideoReturn } from './hooks/useStructureVideo';
import type { UseAudioReturn } from './hooks/useAudio';
import type { UseLoraManagerReturn } from '@/shared/hooks/useLoraManager';
import type { JoinSegmentsSettings } from '@/tools/travel-between-images/hooks/useJoinSegmentsSettings';
import type {
  ImageDeleteHandler,
  BatchImageDeleteHandler,
  ImageDuplicateHandler,
  ImageReorderHandler,
  FileDropHandler,
  GenerationDropHandler,
  ImageUploadHandler,
} from '@/shared/types/imageHandlers';

// ============================================================================
// Domain Types
// ============================================================================

/** Core shot data and identifiers */
interface ShotCoreState {
  selectedShot: Shot;
  selectedShotId: string;
  projectId: string;
  selectedProjectId: string;
  effectiveAspectRatio: string | undefined;
}

/** LoRA management state */
interface ShotLoraState {
  loraManager: LoraManagerReturn;
  availableLoras: LoraModel[];
}

/** Shot images data */
interface ShotImagesState {
  allShotImages: GenerationRow[];
  timelineImages: GenerationRow[];
  unpositionedImages: GenerationRow[];
  contextImages: GenerationRow[];
  videoOutputs: GenerationRow[];
  /** Timeline images filtered for simple mode (non-continuation frames) */
  simpleFilteredImages: GenerationRow[];
}

/**
 * Image manipulation handlers.
 * Uses shared handler types from @/shared/types/imageHandlers.
 * Both timeline and batch handlers use targetFrame (component calculates frame before calling).
 */
export interface ShotImageHandlers {
  /** Reorder images on timeline */
  onReorder: ImageReorderHandler;
  /** Drop external files onto timeline */
  onFileDrop: FileDropHandler;
  /** Drop existing generation onto timeline */
  onGenerationDrop: GenerationDropHandler;
  /** Batch drop files onto batch mode grid (uses targetFrame, not targetPosition) */
  onBatchFileDrop: FileDropHandler;
  /** Batch drop generations onto batch mode grid (uses targetFrame, not targetPosition) */
  onBatchGenerationDrop: GenerationDropHandler;
  /** Delete single image from timeline - id is shot_generations.id */
  onDelete: ImageDeleteHandler;
  /** Delete multiple images from timeline - ids are shot_generations.id values */
  onBatchDelete: BatchImageDeleteHandler;
  /** Duplicate image on timeline - id is shot_generations.id */
  onDuplicate: ImageDuplicateHandler;
  /** Upload image via file input */
  onUpload: ImageUploadHandler;
}

/** Shot management actions */
interface ShotManagementState {
  allShots: Shot[];
  onShotChange: (shotId: string) => void;
  onAddToShot: (shotId: string, generationId: string, position?: number) => Promise<void>;
  onAddToShotWithoutPosition: (shotId: string, generationId: string) => Promise<boolean>;
  onCreateShot: (name: string) => Promise<string>;
  onNewShotFromSelection: (selectedIds: string[]) => Promise<string | void>;
  openUnpositionedGenerationsPane: () => void;
}

/** Generation mode and status state */
export interface GenerationModeState {
  // Mode toggle
  generateMode: 'batch' | 'join';
  setGenerateMode: (mode: 'batch' | 'join') => void;
  toggleGenerateModePreserveScroll: (targetMode: 'batch' | 'join') => void;

  // Generation status
  isGenerationDisabled: boolean;
  isSteerableMotionEnqueuing: boolean;
  steerableMotionJustQueued: boolean;

  // Computed motion settings for preset display
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

  // Accelerated/random seed
  accelerated: boolean;
  onAcceleratedChange: (val: boolean) => void;
  randomSeed: boolean;
  onRandomSeedChange: (val: boolean) => void;
}

/** Batch generation handlers */
export interface GenerationHandlers {
  handleGenerateBatch: (variantName: string) => void;
  handleBatchVideoPromptChangeWithClear: (prompt: string) => void;
  handleStepsChange: (steps: number) => void;
  clearAllEnhancedPrompts: () => Promise<void>;
}

/** Structure video compound handlers (mode-aware) */
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

/** Join segments state and handlers */
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

/** Dimension settings state */
export interface DimensionState {
  dimensionSource?: 'project' | 'firstImage' | 'custom';
  onDimensionSourceChange?: (source: 'project' | 'firstImage' | 'custom') => void;
  customWidth?: number;
  onCustomWidthChange?: (width?: number) => void;
  customHeight?: number;
  onCustomHeightChange?: (height?: number) => void;
}

// ============================================================================
// Context Value
// ============================================================================

export interface ShotSettingsContextValue {
  // Core identifiers and shot data
  selectedShot: Shot;
  selectedShotId: string;
  projectId: string;
  selectedProjectId: string;
  effectiveAspectRatio: string | undefined;
  projects: Project[];

  // UI state management (not settings - those come from VideoTravelSettingsProvider)
  state: ShotEditorState;
  actions: ShotEditorActions;

  // LoRA management (UI state for modal, selection synced to settings provider)
  loraManager: LoraManagerReturn;
  availableLoras: LoraModel[];

  // Shot data (images on timeline, in gallery, etc.)
  allShotImages: GenerationRow[];
  timelineImages: GenerationRow[];
  unpositionedImages: GenerationRow[];
  contextImages: GenerationRow[];
  videoOutputs: GenerationRow[];
  simpleFilteredImages: GenerationRow[];

  // Structure video configuration
  structureVideo: UseStructureVideoReturn;

  // Structure video compound handlers
  structureVideoHandlers: StructureVideoHandlers;

  // Audio track management
  audio: UseAudioReturn;

  // Image manipulation handlers
  imageHandlers: ShotImageHandlers;

  // Shot management (navigation, creation)
  shotManagement: ShotManagementState;

  // Generation mode and status
  generationMode: GenerationModeState;

  // Batch generation handlers
  generationHandlers: GenerationHandlers;

  // Join segments state
  joinState: JoinState;

  // Dimension settings
  dimensions: DimensionState;

  // Query client for invalidations
  queryClient: QueryClient;
}

const ShotSettingsContext = createContext<ShotSettingsContextValue | null>(null);

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook to access full shot settings context
 * Throws if used outside of provider
 */
export function useShotSettingsContext(): ShotSettingsContextValue {
  const ctx = useContext(ShotSettingsContext);
  if (!ctx) {
    throw new Error('useShotSettingsContext must be used within ShotSettingsProvider');
  }
  return ctx;
}

// ============================================================================
// Domain-Focused Hooks
// ============================================================================

/**
 * Access core shot data: selected shot, IDs, aspect ratio, projects
 */
export function useShotCore(): ShotCoreState & { projects: Project[] } {
  const ctx = useShotSettingsContext();
  return {
    selectedShot: ctx.selectedShot,
    selectedShotId: ctx.selectedShotId,
    projectId: ctx.projectId,
    selectedProjectId: ctx.selectedProjectId,
    effectiveAspectRatio: ctx.effectiveAspectRatio,
    projects: ctx.projects,
  };
}

/**
 * Access UI state and actions
 */
export function useShotUI(): { state: ShotEditorState; actions: ShotEditorActions } {
  const { state, actions } = useShotSettingsContext();
  return { state, actions };
}

/**
 * Access LoRA management state
 */
export function useShotLoras(): ShotLoraState {
  const { loraManager, availableLoras } = useShotSettingsContext();
  return { loraManager, availableLoras };
}

/**
 * Access shot images data
 */
export function useShotImages(): ShotImagesState {
  const { allShotImages, timelineImages, unpositionedImages, contextImages, videoOutputs, simpleFilteredImages } = useShotSettingsContext();
  return { allShotImages, timelineImages, unpositionedImages, contextImages, videoOutputs, simpleFilteredImages };
}

/**
 * Access structure video configuration
 */
export function useShotStructureVideo(): UseStructureVideoReturn {
  const { structureVideo } = useShotSettingsContext();
  return structureVideo;
}

/**
 * Access audio track management
 */
export function useShotAudio(): UseAudioReturn {
  const { audio } = useShotSettingsContext();
  return audio;
}

/**
 * Access image manipulation handlers
 */
export function useShotImageHandlers(): ShotImageHandlers {
  const { imageHandlers } = useShotSettingsContext();
  return imageHandlers;
}

/**
 * Access shot management actions
 */
export function useShotManagement(): ShotManagementState {
  const { shotManagement } = useShotSettingsContext();
  return shotManagement;
}

/**
 * Access generation mode and status
 */
export function useGenerationMode(): GenerationModeState {
  const { generationMode } = useShotSettingsContext();
  return generationMode;
}

/**
 * Access batch generation handlers
 */
export function useGenerationHandlers(): GenerationHandlers {
  const { generationHandlers } = useShotSettingsContext();
  return generationHandlers;
}

/**
 * Access structure video compound handlers
 */
export function useStructureVideoHandlers(): StructureVideoHandlers {
  const { structureVideoHandlers } = useShotSettingsContext();
  return structureVideoHandlers;
}

/**
 * Access join segments state and handlers
 */
export function useJoinState(): JoinState {
  const { joinState } = useShotSettingsContext();
  return joinState;
}

/**
 * Access dimension settings
 */
export function useDimensions(): DimensionState {
  const { dimensions } = useShotSettingsContext();
  return dimensions;
}

// ============================================================================
// Provider Component
// ============================================================================

/**
 * Provider component - wraps children with context
 */
export const ShotSettingsProvider: React.FC<{
  value: ShotSettingsContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => {
  return (
    <ShotSettingsContext.Provider value={value}>
      {children}
    </ShotSettingsContext.Provider>
  );
};
