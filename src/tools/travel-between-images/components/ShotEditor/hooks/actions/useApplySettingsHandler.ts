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

export interface ApplySettingsHandlerContexts {
  model: ApplySettingsService.ApplyModelContext;
  prompts: ApplySettingsService.ApplyPromptContext;
  generation: ApplySettingsService.ApplyGenerationContext;
  modes: ApplySettingsService.ApplyModeContext;
  advanced: ApplySettingsService.ApplyAdvancedContext;
  textAddons: ApplySettingsService.ApplyTextAddonContext;
  motion: ApplySettingsService.ApplyMotionContext;
  loras: ApplySettingsService.ApplyLoraContext;
  structureVideo: ApplySettingsService.ApplyStructureVideoContext;
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
  contexts: ApplySettingsHandlerContexts;
  mutations: ApplySettingsHandlerMutations;
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
  const taskLookup = await fetchTaskData(taskId);
  if (taskLookup.status === 'missing') {
    normalizeAndPresentError(new Error('Task not found'), {
      context: 'useApplySettingsHandler',
      toastTitle: 'Failed to apply settings from task',
      showToast: false,
      logData: { taskId },
    });
    return;
  }

  const settings = ApplySettingsService.extractSettings(taskLookup.taskData);

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

  await ApplySettingsService.applyModelSettings(settings.generation, handlerState.contexts.model);
  await ApplySettingsService.applyPromptSettings(settings.prompts, handlerState.contexts.prompts);
  await ApplySettingsService.applyGenerationSettings(settings.generation, handlerState.contexts.generation);
  await ApplySettingsService.applyModeSettings(settings.modes, handlerState.contexts.modes);
  await ApplySettingsService.applyAdvancedModeSettings(settings.advanced, handlerState.contexts.advanced);
  await ApplySettingsService.applyTextPromptAddons(settings.textAddons, handlerState.contexts.textAddons);
  await ApplySettingsService.applyMotionSettings(
    { ...settings.motion, advancedMode: settings.modes.advancedMode },
    handlerState.contexts.motion,
  );
  await ApplySettingsService.applyLoRAs(
    { ...settings.loras, advancedMode: settings.modes.advancedMode },
    handlerState.contexts.loras,
  );
  await ApplySettingsService.applyStructureVideo(settings.structure, handlerState.contexts.structureVideo);

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
