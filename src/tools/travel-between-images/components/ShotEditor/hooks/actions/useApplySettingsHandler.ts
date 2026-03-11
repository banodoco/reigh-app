/**
 * Stable Apply Settings Handler Hook
 *
 * Provides a stable callback for applying settings from tasks without
 * recreating on every render.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as ApplySettingsService from '../../services/applySettingsService';
import type { GenerationRow, Shot } from '@/domains/generation/types';
import type { LoraModel } from '@/domains/lora/types/lora';
import { enqueueGenerationsInvalidation } from '@/shared/hooks/invalidation/useGenerationInvalidation';
import type { AddImageToShotVariables } from '@/shared/hooks/shots/addImageToShotHelpers';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface ApplySettingsHandlerCore {
  projectId: string;
  selectedShot: Shot | undefined;
  simpleFilteredImages: GenerationRow[];
}

interface ApplySettingsHandlerRestore {
  availableLoras: LoraModel[];
  loraManager: ApplySettingsService.ApplyLoraContext['loraManager'];
  steerableMotionSettings: ApplySettingsService.ApplyModelContext['steerableMotionSettings'];
  onSteerableMotionSettingsChange: ApplySettingsService.ApplyModelContext['onSteerableMotionSettingsChange'];
  onBatchVideoPromptChange: ApplySettingsService.ApplyPromptContext['onBatchVideoPromptChange'];
  onBatchVideoFramesChange: ApplySettingsService.ApplyGenerationContext['onBatchVideoFramesChange'];
  onBatchVideoStepsChange: ApplySettingsService.ApplyGenerationContext['onBatchVideoStepsChange'];
  onGenerationModeChange: ApplySettingsService.ApplyModeContext['onGenerationModeChange'];
  onAdvancedModeChange: ApplySettingsService.ApplyModeContext['onAdvancedModeChange'];
  onMotionModeChange?: ApplySettingsService.ApplyModeContext['onMotionModeChange'];
  onGenerationTypeModeChange?: ApplySettingsService.ApplyModeContext['onGenerationTypeModeChange'];
  onPhaseConfigChange: ApplySettingsService.ApplyAdvancedContext['onPhaseConfigChange'];
  onPhasePresetSelect?: ApplySettingsService.ApplyAdvancedContext['onPhasePresetSelect'];
  onPhasePresetRemove?: ApplySettingsService.ApplyAdvancedContext['onPhasePresetRemove'];
  onTurboModeChange?: ApplySettingsService.ApplyAdvancedContext['onTurboModeChange'];
  onEnhancePromptChange?: ApplySettingsService.ApplyAdvancedContext['onEnhancePromptChange'];
  onTextBeforePromptsChange?: ApplySettingsService.ApplyTextAddonContext['onTextBeforePromptsChange'];
  onTextAfterPromptsChange?: ApplySettingsService.ApplyTextAddonContext['onTextAfterPromptsChange'];
  onAmountOfMotionChange?: ApplySettingsService.ApplyMotionContext['onAmountOfMotionChange'];
  onStructureVideoInputChange: ApplySettingsService.ApplyStructureVideoContext['onStructureVideoInputChange'];
  updatePairPromptsByIndex?: ApplySettingsService.ApplyPromptContext['updatePairPromptsByIndex'];
}

interface ApplySettingsHandlerMutations {
  addImageToShotMutation: {
    mutateAsync: (params: AddImageToShotVariables) => Promise<unknown>;
  };
  removeImageFromShotMutation: {
    mutateAsync: (params: {
      shotId: string;
      shotGenerationId: string;
      projectId: string;
      shiftItems?: { id: string; newFrame: number }[];
    }) => Promise<unknown>;
  };
  loadPositions: (opts?: { silent?: boolean; reason?: string }) => void | Promise<void>;
}

interface ApplySettingsHandlerInput {
  core: ApplySettingsHandlerCore;
  restore: ApplySettingsHandlerRestore;
  mutations: ApplySettingsHandlerMutations;
}

function buildApplyContexts(handlerState: ApplySettingsHandlerInput) {
  return {
    model: {
      steerableMotionSettings: handlerState.restore.steerableMotionSettings,
      onSteerableMotionSettingsChange: handlerState.restore.onSteerableMotionSettingsChange,
    } satisfies ApplySettingsService.ApplyModelContext,
    prompts: {
      onBatchVideoPromptChange: handlerState.restore.onBatchVideoPromptChange,
      onSteerableMotionSettingsChange: handlerState.restore.onSteerableMotionSettingsChange,
      updatePairPromptsByIndex: handlerState.restore.updatePairPromptsByIndex,
    } satisfies ApplySettingsService.ApplyPromptContext,
    generation: {
      onBatchVideoFramesChange: handlerState.restore.onBatchVideoFramesChange,
      onBatchVideoStepsChange: handlerState.restore.onBatchVideoStepsChange,
    } satisfies ApplySettingsService.ApplyGenerationContext,
    modes: {
      onGenerationModeChange: handlerState.restore.onGenerationModeChange,
      onAdvancedModeChange: handlerState.restore.onAdvancedModeChange,
      onMotionModeChange: handlerState.restore.onMotionModeChange,
      onGenerationTypeModeChange: handlerState.restore.onGenerationTypeModeChange,
    } satisfies ApplySettingsService.ApplyModeContext,
    advanced: {
      onPhaseConfigChange: handlerState.restore.onPhaseConfigChange,
      onPhasePresetSelect: handlerState.restore.onPhasePresetSelect,
      onPhasePresetRemove: handlerState.restore.onPhasePresetRemove,
      onTurboModeChange: handlerState.restore.onTurboModeChange,
      onEnhancePromptChange: handlerState.restore.onEnhancePromptChange,
    } satisfies ApplySettingsService.ApplyAdvancedContext,
    textAddons: {
      onTextBeforePromptsChange: handlerState.restore.onTextBeforePromptsChange,
      onTextAfterPromptsChange: handlerState.restore.onTextAfterPromptsChange,
    } satisfies ApplySettingsService.ApplyTextAddonContext,
    motion: {
      onAmountOfMotionChange: handlerState.restore.onAmountOfMotionChange,
    } satisfies ApplySettingsService.ApplyMotionContext,
    loras: {
      loraManager: handlerState.restore.loraManager,
      availableLoras: handlerState.restore.availableLoras,
    } satisfies ApplySettingsService.ApplyLoraContext,
    structureVideo: {
      onStructureVideoInputChange: handlerState.restore.onStructureVideoInputChange,
    } satisfies ApplySettingsService.ApplyStructureVideoContext,
  };
}

async function fetchTaskData(taskId: string) {
  return ApplySettingsService.fetchTask(taskId);
}

async function applySettingsFromTask(
  taskId: string,
  replaceImages: boolean,
  inputImages: string[],
  handlerState: ApplySettingsHandlerInput,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const taskData = await fetchTaskData(taskId);
  if (!taskData) {
    normalizeAndPresentError(new Error('Task not found'), {
      context: 'useApplySettingsHandler',
      toastTitle: 'Failed to apply settings from task',
      showToast: false,
      logData: { taskId },
    });
    return;
  }

  const settings = ApplySettingsService.extractSettings(taskData);
  const applyContexts = buildApplyContexts(handlerState);

  await ApplySettingsService.replaceImagesIfRequested(
    settings.generation,
    settings.images,
    replaceImages,
    inputImages,
    handlerState.core.selectedShot ?? null,
    handlerState.core.projectId,
    handlerState.core.simpleFilteredImages,
    handlerState.mutations.addImageToShotMutation,
    handlerState.mutations.removeImageFromShotMutation,
  );

  await ApplySettingsService.applyModelSettings(settings.generation, applyContexts.model);
  await ApplySettingsService.applyPromptSettings(settings.prompts, applyContexts.prompts);
  await ApplySettingsService.applyGenerationSettings(settings.generation, applyContexts.generation);
  await ApplySettingsService.applyModeSettings(settings.modes, applyContexts.modes);
  await ApplySettingsService.applyAdvancedModeSettings(settings.advanced, applyContexts.advanced);
  await ApplySettingsService.applyTextPromptAddons(settings.textAddons, applyContexts.textAddons);
  await ApplySettingsService.applyMotionSettings(
    { ...settings.motion, advancedMode: settings.modes.advancedMode },
    applyContexts.motion,
  );
  await ApplySettingsService.applyLoRAs(
    { ...settings.loras, advancedMode: settings.modes.advancedMode },
    applyContexts.loras,
  );
  await ApplySettingsService.applyStructureVideo(settings.structure, applyContexts.structureVideo);

  if (handlerState.core.selectedShot?.id) {
    enqueueGenerationsInvalidation(queryClient, handlerState.core.selectedShot.id, {
      reason: 'apply-settings-force-reload',
      scope: 'all',
      delayMs: 200,
    });
  }

  await new Promise((resolve) => setTimeout(resolve, 200));
  await Promise.resolve(handlerState.mutations.loadPositions({ silent: true }));
}

export function useApplySettingsHandler(handlerState: ApplySettingsHandlerInput) {
  const queryClient = useQueryClient();
  const handlerStateRef = useRef(handlerState);

  useEffect(() => {
    handlerStateRef.current = handlerState;
  }, [handlerState]);

  return useCallback(async (taskId: string, replaceImages: boolean, inputImages: string[]) => {
    const latestHandlerState = handlerStateRef.current;
    const hasMissingIds = latestHandlerState.core.simpleFilteredImages.some((img) => !img.id);
    if (hasMissingIds && replaceImages) {
      normalizeAndPresentError(new Error('Loading shot data... please try again in a moment.'), {
        context: 'useApplySettingsHandler',
        toastTitle: 'Loading shot data',
        showToast: true,
      });
      return;
    }

    try {
      await applySettingsFromTask(taskId, replaceImages, inputImages, latestHandlerState, queryClient);
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useApplySettingsHandler',
        toastTitle: 'Failed to apply settings from task',
      });
    }
  }, [queryClient]);
}
