import type { Project } from '@/types/project';
import type { UseAudioReturn } from './hooks/video/useAudio';
import type { UseStructureVideoReturn } from './hooks/video/useStructureVideo';
import { useShotSettingsContext } from './ShotSettingsContext.provider';
import type {
  DimensionState,
  GenerationHandlers,
  GenerationModeState,
  JoinState,
  ShotCoreState,
  ShotImageHandlers,
  ShotImagesState,
  ShotLoraState,
  ShotManagementState,
} from './ShotSettingsContext.types';
import type { ShotEditorActions } from './state/useShotEditorState';
import type { ShotEditorState } from './state/types';
import type { StructureVideoHandlers } from './ShotSettingsContext.types';

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

export function useShotUI(): { state: ShotEditorState; actions: ShotEditorActions } {
  const { state, actions } = useShotSettingsContext();
  return { state, actions };
}

export function useShotLoras(): ShotLoraState {
  const { loraManager, availableLoras } = useShotSettingsContext();
  return { loraManager, availableLoras };
}

export function useShotImages(): ShotImagesState {
  const { allShotImages, timelineImages, unpositionedImages, contextImages, videoOutputs, simpleFilteredImages } = useShotSettingsContext();
  return { allShotImages, timelineImages, unpositionedImages, contextImages, videoOutputs, simpleFilteredImages };
}

export function useShotStructureVideo(): UseStructureVideoReturn {
  const { structureVideo } = useShotSettingsContext();
  return structureVideo;
}

export function useShotAudio(): UseAudioReturn {
  const { audio } = useShotSettingsContext();
  return audio;
}

export function useShotImageHandlers(): ShotImageHandlers {
  const { imageHandlers } = useShotSettingsContext();
  return imageHandlers;
}

export function useShotManagement(): ShotManagementState {
  const { shotManagement } = useShotSettingsContext();
  return shotManagement;
}

export function useGenerationMode(): GenerationModeState {
  const { generationMode } = useShotSettingsContext();
  return generationMode;
}

export function useGenerationHandlers(): GenerationHandlers {
  const { generationHandlers } = useShotSettingsContext();
  return generationHandlers;
}

export function useStructureVideoHandlers(): StructureVideoHandlers {
  const { structureVideoHandlers } = useShotSettingsContext();
  return structureVideoHandlers;
}

export function useJoinState(): JoinState {
  const { joinState } = useShotSettingsContext();
  return joinState;
}

export function useDimensions(): DimensionState {
  const { dimensions } = useShotSettingsContext();
  return dimensions;
}
