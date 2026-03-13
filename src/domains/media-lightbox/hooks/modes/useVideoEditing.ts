import { useState, useCallback, useRef } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { createTask } from '@/shared/lib/taskCreation';
import {
  flashSuccessForDuration,
  invalidateTaskAndProjectQueries,
} from '@/shared/lib/tasks/taskMutationFeedback';
import { VACE_GENERATION_DEFAULTS } from '@/shared/lib/vaceDefaults';
import { useEditVideoSettings } from '@/shared/settings/hooks/useEditVideoSettings';
import { useLoraManager } from '@/domains/lora/hooks/useLoraManager';
import { usePublicLoras } from '@/features/resources/hooks/useResources';
import { useTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import { useVideoEditingSelections } from './useVideoEditingSelections';
import { buildVideoEditOrchestratorDetails } from './videoEditingTaskPayload';

export type { UseVideoEditingProps, UseVideoEditingReturn } from './types';
import type { UseVideoEditingProps, UseVideoEditingReturn } from './types';

const VIDEO_EDIT_FPS = 16;

/**
 * Hook for managing video editing (portion regeneration) functionality.
 * Similar to useInpainting but for video portion selection and regeneration.
 */
export const useVideoEditing = ({
  media,
  selectedProjectId,
  projectAspectRatio,
  videoDuration,
  videoUrl,
  onExitVideoEditMode,
}: UseVideoEditingProps): UseVideoEditingReturn => {
  const queryClient = useQueryClient();
  const run = useTaskPlaceholder();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isVideoEditMode, setIsVideoEditMode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateSuccess, setGenerateSuccess] = useState(false);

  const editSettings = useEditVideoSettings(selectedProjectId);
  const { data: availableLoras } = usePublicLoras();
  const loraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId || undefined,
    persistenceScope: 'none', // Managed explicitly via editSettings.
  });

  const selectionsState = useVideoEditingSelections({
    mediaId: media?.id,
    videoDuration,
    defaultGapFrameCount: editSettings.settings.gapFrameCount,
    contextFrameCount: editSettings.settings.contextFrameCount,
  });

  const handleGenerate = useCallback(async () => {
    if (!selectionsState.validation.isValid) {
      toast.error('Please fix validation errors before generating');
      return;
    }
    if (!selectedProjectId || !videoUrl || !media) return;

    setIsGenerating(true);
    try {
      await run({
        taskType: 'edit_video_orchestrator',
        label: editSettings.settings.prompt?.substring(0, 50) || 'Video edit...',
        context: 'VideoEdit',
        toastTitle: 'Failed to create regeneration task',
        create: async () => {
          const globalPrompt = editSettings.settings.prompt || '';
          const globalGapFrameCount = editSettings.settings.gapFrameCount;
          const portionFrameRanges = selectionsState.selectionsToFrameRanges(
            VIDEO_EDIT_FPS,
            globalGapFrameCount,
            globalPrompt,
          );

          const lorasForTask = loraManager.selectedLoras
            .filter((lora): lora is typeof lora & { path: string } => Boolean(lora.path))
            .map(lora => ({ path: lora.path, strength: lora.strength }));

          const orchestratorDetails = buildVideoEditOrchestratorDetails({
            media,
            videoUrl,
            videoDuration,
            fps: VIDEO_EDIT_FPS,
            portionFrameRanges,
            projectAspectRatio,
            requestedContextFrameCount: editSettings.settings.contextFrameCount,
            globalGapFrameCount,
            globalPrompt,
            negativePrompt: editSettings.settings.negativePrompt || '',
            enhancePrompt: editSettings.settings.enhancePrompt,
            priority: editSettings.settings.priority || 0,
            model: editSettings.settings.model || VACE_GENERATION_DEFAULTS.model,
            seed: editSettings.settings.seed ?? -1,
            numInferenceSteps: editSettings.settings.numInferenceSteps || 6,
            guidanceScale: editSettings.settings.guidanceScale || 3,
            lorasForTask,
          });

          return createTask({
            project_id: selectedProjectId,
            task_type: 'edit_video_orchestrator',
            params: {
              orchestrator_details: orchestratorDetails,
              tool_type: TOOL_IDS.EDIT_VIDEO,
              parent_generation_id: getGenerationId(media),
            },
          });
        },
        onSuccess: () => {
          flashSuccessForDuration(setGenerateSuccess, 1500);
          invalidateTaskAndProjectQueries(queryClient, selectedProjectId);
        },
      });
    } finally {
      setIsGenerating(false);
    }
  }, [
    editSettings.settings,
    loraManager.selectedLoras,
    media,
    projectAspectRatio,
    queryClient,
    run,
    selectionsState,
    selectedProjectId,
    videoDuration,
    videoUrl,
  ]);

  const handleEnterVideoEditMode = useCallback(() => {
    setIsVideoEditMode(true);
  }, []);

  const handleExitVideoEditMode = useCallback(() => {
    setIsVideoEditMode(false);
    onExitVideoEditMode?.();
  }, [onExitVideoEditMode]);

  return {
    isVideoEditMode,
    setIsVideoEditMode,

    videoRef,

    selections: selectionsState.selections,
    activeSelectionId: selectionsState.activeSelectionId,
    handleUpdateSelection: selectionsState.handleUpdateSelection,
    handleAddSelection: selectionsState.handleAddSelection,
    handleRemoveSelection: selectionsState.handleRemoveSelection,
    setActiveSelectionId: selectionsState.setActiveSelectionId,
    handleUpdateSelectionSettings: selectionsState.handleUpdateSelectionSettings,

    isValid: selectionsState.validation.isValid,
    validationErrors: selectionsState.validation.errors,
    maxContextFrames: selectionsState.maxContextFrames,

    editSettings,

    loraManager,
    availableLoras,

    handleGenerate,
    isGenerating,
    generateSuccess,

    handleEnterVideoEditMode,
    handleExitVideoEditMode,
  };
};
