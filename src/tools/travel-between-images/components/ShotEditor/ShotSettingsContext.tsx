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
import { Shot, GenerationRow } from '@/types/shots';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { ShotEditorState } from './state/types';
import { ShotEditorActions } from './state/useShotEditorState';
import { LoraManagerReturn } from './hooks/useLoraSync';
import type { UseStructureVideoReturn } from './hooks/useStructureVideo';
import type { UseAudioReturn } from './hooks/useAudio';

// ============================================================================
// Domain Types
// ============================================================================

/** Core shot data and identifiers */
export interface ShotCoreState {
  selectedShot: Shot;
  selectedShotId: string;
  projectId: string;
  selectedProjectId: string;
  effectiveAspectRatio: string | undefined;
}

/** LoRA management state */
export interface ShotLoraState {
  loraManager: LoraManagerReturn;
  availableLoras: LoraModel[];
}

/** Shot images data */
export interface ShotImagesState {
  allShotImages: GenerationRow[];
  timelineImages: GenerationRow[];
  contextImages: GenerationRow[];
  videoOutputs: GenerationRow[];
  /** Timeline images filtered for simple mode (non-continuation frames) */
  simpleFilteredImages: GenerationRow[];
}

/** Image manipulation handlers */
export interface ShotImageHandlers {
  /** Reorder images on timeline */
  onReorder: (orderedShotGenerationIds: string[], draggedItemId?: string) => void;
  /** Drop external files onto timeline */
  onImageDrop: (files: File[], targetFrame?: number) => Promise<void>;
  /** Drop existing generation onto timeline */
  onGenerationDrop: (generationId: string, targetFrame: number) => Promise<void>;
  /** Batch drop files onto timeline/grid */
  onBatchFileDrop: (files: File[]) => Promise<void>;
  /** Batch drop generations onto timeline/grid */
  onBatchGenerationDrop: (generationIds: string[]) => Promise<void>;
  /** Delete single image from timeline */
  onDelete: (generation: GenerationRow) => Promise<void>;
  /** Delete multiple images from timeline */
  onBatchDelete: (generations: GenerationRow[]) => Promise<void>;
  /** Duplicate image on timeline */
  onDuplicate: (generation: GenerationRow) => Promise<void>;
  /** Upload image via file input */
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
}

/** Shot management actions */
export interface ShotManagementState {
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
}

/** Join segments state and handlers */
export interface JoinState {
  joinSettings: {
    settings: any;
    updateField: (field: string, value: any) => void;
    updateFields: (fields: Record<string, any>) => void;
  };
  joinLoraManager: LoraManagerReturn;
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
  projects: Array<{ id: string; aspectRatio?: string }>;

  // UI state management (not settings - those come from VideoTravelSettingsProvider)
  state: ShotEditorState;
  actions: ShotEditorActions;

  // LoRA management (UI state for modal, selection synced to settings provider)
  loraManager: LoraManagerReturn;
  availableLoras: LoraModel[];

  // Shot data (images on timeline, in gallery, etc.)
  allShotImages: GenerationRow[];
  timelineImages: GenerationRow[];
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
  queryClient: any;
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
export function useShotCore(): ShotCoreState & { projects: Array<{ id: string; aspectRatio?: string }> } {
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
  const { allShotImages, timelineImages, contextImages, videoOutputs, simpleFilteredImages } = useShotSettingsContext();
  return { allShotImages, timelineImages, contextImages, videoOutputs, simpleFilteredImages };
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
// Safe Hooks (for components that may be outside provider)
// ============================================================================
// These hooks return undefined when used outside of ShotSettingsProvider,
// allowing components to work with props as fallback.

/**
 * Safe hook to check if ShotSettingsContext is available
 */
export function useShotSettingsContextSafe(): ShotSettingsContextValue | null {
  return useContext(ShotSettingsContext);
}

/**
 * Safe access to core shot data - returns undefined if outside provider
 */
export function useShotCoreSafe(): ShotCoreState | undefined {
  const ctx = useContext(ShotSettingsContext);
  if (!ctx) return undefined;
  return {
    selectedShot: ctx.selectedShot,
    selectedShotId: ctx.selectedShotId,
    projectId: ctx.projectId,
    selectedProjectId: ctx.selectedProjectId,
    effectiveAspectRatio: ctx.effectiveAspectRatio,
  };
}

/**
 * Safe access to UI state - returns undefined if outside provider
 */
export function useShotUISafe(): { state: ShotEditorState; actions: ShotEditorActions } | undefined {
  const ctx = useContext(ShotSettingsContext);
  if (!ctx) return undefined;
  return { state: ctx.state, actions: ctx.actions };
}

/**
 * Safe access to shot images - returns undefined if outside provider
 */
export function useShotImagesSafe(): ShotImagesState | undefined {
  const ctx = useContext(ShotSettingsContext);
  if (!ctx) return undefined;
  return {
    allShotImages: ctx.allShotImages,
    timelineImages: ctx.timelineImages,
    contextImages: ctx.contextImages,
    videoOutputs: ctx.videoOutputs,
    simpleFilteredImages: ctx.simpleFilteredImages,
  };
}

/**
 * Safe access to structure video - returns undefined if outside provider
 */
export function useShotStructureVideoSafe(): UseStructureVideoReturn | undefined {
  const ctx = useContext(ShotSettingsContext);
  if (!ctx) return undefined;
  return ctx.structureVideo;
}

/**
 * Safe access to audio - returns undefined if outside provider
 */
export function useShotAudioSafe(): UseAudioReturn | undefined {
  const ctx = useContext(ShotSettingsContext);
  if (!ctx) return undefined;
  return ctx.audio;
}

/**
 * Safe access to image handlers - returns undefined if outside provider
 */
export function useShotImageHandlersSafe(): ShotImageHandlers | undefined {
  const ctx = useContext(ShotSettingsContext);
  if (!ctx) return undefined;
  return ctx.imageHandlers;
}

/**
 * Safe access to shot management - returns undefined if outside provider
 */
export function useShotManagementSafe(): ShotManagementState | undefined {
  const ctx = useContext(ShotSettingsContext);
  if (!ctx) return undefined;
  return ctx.shotManagement;
}

/**
 * Safe access to generation mode - returns undefined if outside provider
 */
export function useGenerationModeSafe(): GenerationModeState | undefined {
  const ctx = useContext(ShotSettingsContext);
  if (!ctx) return undefined;
  return ctx.generationMode;
}

/**
 * Safe access to generation handlers - returns undefined if outside provider
 */
export function useGenerationHandlersSafe(): GenerationHandlers | undefined {
  const ctx = useContext(ShotSettingsContext);
  if (!ctx) return undefined;
  return ctx.generationHandlers;
}

/**
 * Safe access to structure video handlers - returns undefined if outside provider
 */
export function useStructureVideoHandlersSafe(): StructureVideoHandlers | undefined {
  const ctx = useContext(ShotSettingsContext);
  if (!ctx) return undefined;
  return ctx.structureVideoHandlers;
}

/**
 * Safe access to join state - returns undefined if outside provider
 */
export function useJoinStateSafe(): JoinState | undefined {
  const ctx = useContext(ShotSettingsContext);
  if (!ctx) return undefined;
  return ctx.joinState;
}

/**
 * Safe access to dimension settings - returns undefined if outside provider
 */
export function useDimensionsSafe(): DimensionState | undefined {
  const ctx = useContext(ShotSettingsContext);
  if (!ctx) return undefined;
  return ctx.dimensions;
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

// Re-export for convenience
export { ShotSettingsContext };
