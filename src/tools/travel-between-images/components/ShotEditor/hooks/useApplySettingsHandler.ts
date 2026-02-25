/**
 * Stable Apply Settings Handler Hook
 * 
 * Provides a stable callback for applying settings from tasks that doesn't recreate
 * on every render, preventing unnecessary VideoItem re-renders.
 * 
 * Uses the ref pattern internally to access latest values without dependency issues.
 */

import { useCallback, useRef, useEffect } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { useQueryClient } from '@tanstack/react-query';
import * as ApplySettingsService from '../services/applySettingsService';
import { GenerationRow, Shot } from '@/domains/generation/types';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import type { SteerableMotionSettings } from '@/shared/types/steerableMotion';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import { invalidateGenerationsSync } from '@/shared/hooks/invalidation/useGenerationInvalidation';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import type { AddImageToShotVariables } from '@/shared/hooks/shots/addImageToShotHelpers';
import type { PresetMetadata } from '@/shared/types/presetMetadata';

interface ApplySettingsHandlerState {
  // IDs
  projectId: string;
  selectedShotId: string;
  
  // Data
  simpleFilteredImages: GenerationRow[];
  selectedShot: Shot | undefined;
  availableLoras: LoraModel[];
  
  // State callbacks (from props)
  onBatchVideoPromptChange: (prompt: string) => void;
  onSteerableMotionSettingsChange: (settings: Partial<SteerableMotionSettings>) => void;
  onBatchVideoFramesChange: (frames: number) => void;
  onBatchVideoStepsChange: (steps: number) => void;
  onDimensionSourceChange?: (source: 'project' | 'firstImage' | 'custom') => void;
  onCustomWidthChange?: (width?: number) => void;
  onCustomHeightChange?: (height?: number) => void;
  onGenerationModeChange: (mode: 'batch' | 'timeline' | 'by-pair') => void;
  onAdvancedModeChange: (advanced: boolean) => void;
  onMotionModeChange: (mode: 'basic' | 'advanced') => void;
  onGenerationTypeModeChange: (mode: 'i2v' | 'vace') => void;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onPhasePresetSelect: (presetId: string, config: PhaseConfig, presetMetadata?: PresetMetadata) => void;
  onPhasePresetRemove: () => void;
  onTurboModeChange: (turbo: boolean) => void;
  onEnhancePromptChange: (enhance: boolean) => void;
  onAmountOfMotionChange: (motion: number) => void;
  onTextBeforePromptsChange: (text: string) => void;
  onTextAfterPromptsChange: (text: string) => void;
  onStructureVideoInputChange: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string,
  ) => void;
  
  // Current values
  generationMode: 'batch' | 'timeline' | 'by-pair';
  generationTypeMode: 'i2v' | 'vace';
  advancedMode: boolean;
  motionMode: 'basic' | 'advanced';
  turboMode: boolean;
  enhancePrompt: boolean;
  amountOfMotion: number;
  textBeforePrompts: string;
  textAfterPrompts: string;
  batchVideoSteps: number;
  batchVideoFrames: number;
  steerableMotionSettings: SteerableMotionSettings;
  
  // Managers/Mutations
  loraManager: {
    setSelectedLoras?: (
      loras: Array<{ id: string; name: string; path: string; strength: number; [key: string]: unknown }>
    ) => void;
    handleAddLora: (lora: LoraModel, showToast: boolean, strength: number) => void;
  };
  addImageToShotMutation: { mutateAsync: (params: AddImageToShotVariables) => Promise<unknown> };
  removeImageFromShotMutation: {
    mutateAsync: (params: {
      shotId: string;
      shotGenerationId: string;
      projectId: string;
      shiftItems?: { id: string; newFrame: number }[];
    }) => Promise<unknown>;
  };
  updatePairPromptsByIndex: (pairIndex: number, prompt: string, negativePrompt: string) => Promise<void>;
  loadPositions: (opts?: { silent?: boolean; reason?: string }) => void | Promise<void>;
}

function buildServiceApplyContext(handlerState: ApplySettingsHandlerState): ApplySettingsService.ApplyContext {
  return {
    currentGenerationMode: handlerState.generationMode,
    currentAdvancedMode: handlerState.advancedMode,
    onBatchVideoPromptChange: handlerState.onBatchVideoPromptChange,
    onSteerableMotionSettingsChange: handlerState.onSteerableMotionSettingsChange,
    onBatchVideoFramesChange: handlerState.onBatchVideoFramesChange,
    onBatchVideoStepsChange: handlerState.onBatchVideoStepsChange,
    onGenerationModeChange: handlerState.onGenerationModeChange,
    onAdvancedModeChange: handlerState.onAdvancedModeChange,
    onMotionModeChange: handlerState.onMotionModeChange,
    onGenerationTypeModeChange: handlerState.onGenerationTypeModeChange,
    onPhaseConfigChange: handlerState.onPhaseConfigChange,
    onPhasePresetSelect: handlerState.onPhasePresetSelect,
    onPhasePresetRemove: handlerState.onPhasePresetRemove,
    onTurboModeChange: handlerState.onTurboModeChange,
    onEnhancePromptChange: handlerState.onEnhancePromptChange,
    onTextBeforePromptsChange: handlerState.onTextBeforePromptsChange,
    onTextAfterPromptsChange: handlerState.onTextAfterPromptsChange,
    onAmountOfMotionChange: handlerState.onAmountOfMotionChange,
    onStructureVideoInputChange: handlerState.onStructureVideoInputChange,
    loraManager: handlerState.loraManager as ApplySettingsService.ApplyContext['loraManager'],
    availableLoras: handlerState.availableLoras,
    updatePairPromptsByIndex: handlerState.updatePairPromptsByIndex,
    steerableMotionSettings: handlerState.steerableMotionSettings,
    batchVideoFrames: handlerState.batchVideoFrames,
    batchVideoSteps: handlerState.batchVideoSteps,
    textBeforePrompts: handlerState.textBeforePrompts,
    textAfterPrompts: handlerState.textAfterPrompts,
    turboMode: handlerState.turboMode,
    enhancePrompt: handlerState.enhancePrompt,
    amountOfMotion: handlerState.amountOfMotion,
    motionMode: handlerState.motionMode,
    generationTypeMode: handlerState.generationTypeMode,
  };
}

async function fetchTaskData(taskId: string) {
  try {
    return await ApplySettingsService.fetchTask(taskId);
  } catch (fetchError) {
    console.error('[ApplySettings] fetchTask failed:', fetchError);
    throw fetchError;
  }
}

async function applySettingsFromTask(
  taskId: string,
  replaceImages: boolean,
  inputImages: string[],
  handlerState: ApplySettingsHandlerState,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const taskData = await fetchTaskData(taskId);
  if (!taskData) {
    console.error('[ApplySettings] Task not found');
    return;
  }

  const settings = ApplySettingsService.extractSettings(taskData);
  const serviceApplyContext = buildServiceApplyContext(handlerState);

  await ApplySettingsService.replaceImagesIfRequested(
    settings,
    replaceImages,
    inputImages,
    handlerState.selectedShot ?? null,
    handlerState.projectId,
    handlerState.simpleFilteredImages,
    handlerState.addImageToShotMutation,
    handlerState.removeImageFromShotMutation,
  );

  await ApplySettingsService.applyModelSettings(settings, serviceApplyContext);
  await ApplySettingsService.applyPromptSettings(settings, serviceApplyContext);
  await ApplySettingsService.applyGenerationSettings(settings, serviceApplyContext);
  await ApplySettingsService.applyModeSettings(settings, serviceApplyContext);
  await ApplySettingsService.applyAdvancedModeSettings(settings, serviceApplyContext);
  await ApplySettingsService.applyTextPromptAddons(settings, serviceApplyContext);
  await ApplySettingsService.applyMotionSettings(settings, serviceApplyContext);
  await ApplySettingsService.applyLoRAs(settings, serviceApplyContext);
  await ApplySettingsService.applyStructureVideo(settings, serviceApplyContext, taskData);
  await ApplySettingsService.applyFramePositionsToExistingImages(
    settings,
    handlerState.selectedShot ?? null,
    handlerState.simpleFilteredImages,
  );

  if (handlerState.selectedShot?.id) {
    invalidateGenerationsSync(queryClient, handlerState.selectedShot.id, {
      reason: 'apply-settings-force-reload',
      scope: 'all',
      delayMs: 200,
    });
  }

  await new Promise(resolve => setTimeout(resolve, 200));
  await Promise.resolve(handlerState.loadPositions({ silent: true }));
}

export function useApplySettingsHandler(handlerState: ApplySettingsHandlerState) {
  const queryClient = useQueryClient();

  // Store all handler state values in a ref that updates silently
  const handlerStateRef = useRef(handlerState);
  
  // Update ref on every render (cheap, doesn't cause re-renders)
  useEffect(() => {
    handlerStateRef.current = handlerState;
  }, [handlerState]);
  
  // Return stable callback that reads from ref
  return useCallback(async (taskId: string, replaceImages: boolean, inputImages: string[]) => {
    const latestHandlerState = handlerStateRef.current;
    const hasMissingIds = latestHandlerState.simpleFilteredImages.some(img => !img.id);
    if (hasMissingIds && replaceImages) {
      toast.error('Loading shot data... please try again in a moment.');
      return;
    }

    try {
      await applySettingsFromTask(taskId, replaceImages, inputImages, latestHandlerState, queryClient);
    } catch (error) {
      console.error('[ApplySettings] Failed to apply settings:', error);
      toast.error('Failed to apply settings from task');
      return;
    }
  }, [queryClient]); // stable identity
}
