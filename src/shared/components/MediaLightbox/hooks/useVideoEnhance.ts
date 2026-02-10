import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createVideoEnhanceTask,
  type VideoEnhanceTaskParams,
} from '@/shared/lib/tasks/videoEnhance';
import { handleError } from '@/shared/lib/errorHandler';
import { queryKeys } from '@/shared/lib/queryKeys';
import type { VideoEnhanceSettings } from './useGenerationEditSettings';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';

export interface UseVideoEnhanceProps {
  projectId: string | undefined;
  videoUrl: string | undefined;
  shotId?: string;
  /** Generation ID to create variant on (for based_on relationship) */
  generationId?: string;
  /** Active variant ID - track which variant was enhanced */
  activeVariantId?: string | null;
  /** Settings from persistence system */
  settings: VideoEnhanceSettings;
  /** Setter for updating settings */
  updateSettings: (updates: Partial<VideoEnhanceSettings>) => void;
}

export interface UseVideoEnhanceReturn {
  // Settings passed through for convenience
  settings: VideoEnhanceSettings;
  updateSetting: <K extends keyof VideoEnhanceSettings>(
    key: K,
    value: VideoEnhanceSettings[K]
  ) => void;

  // Validation
  isValid: boolean;
  canSubmit: boolean;

  // Actions
  handleGenerate: () => Promise<void>;

  // Status
  isGenerating: boolean;
  generateSuccess: boolean;
}

/**
 * Hook for managing video enhancement actions
 *
 * Settings are managed externally via the persistence system
 * This hook handles validation and task creation
 */
export function useVideoEnhance({
  projectId,
  videoUrl,
  shotId,
  generationId,
  activeVariantId,
  settings,
  updateSettings,
}: UseVideoEnhanceProps): UseVideoEnhanceReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateSuccess, setGenerateSuccess] = useState(false);
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();
  const queryClient = useQueryClient();

  // Adapter to match the expected interface
  const updateSetting = useCallback(<K extends keyof VideoEnhanceSettings>(
    key: K,
    value: VideoEnhanceSettings[K]
  ) => {
    updateSettings({ [key]: value });
    // Reset success state when settings change
    setGenerateSuccess(false);
  }, [updateSettings]);

  // Validation: at least one mode must be enabled
  const isValid = settings.enableInterpolation || settings.enableUpscale;

  // Can submit: valid settings + required data
  const canSubmit = isValid && !!projectId && !!videoUrl && !isGenerating;

  // Handle generate action
  const handleGenerate = useCallback(async () => {
    if (!canSubmit || !projectId || !videoUrl) {
      return;
    }

    setIsGenerating(true);
    setGenerateSuccess(false);

    const enhanceLabel = [
      settings.enableInterpolation && 'Interpolation',
      settings.enableUpscale && 'Upscale',
    ].filter(Boolean).join(' + ');
    const incomingTaskId = addIncomingTask({
      taskType: 'video_enhance',
      label: enhanceLabel || 'Video Enhance',
    });

    try {
      const params: VideoEnhanceTaskParams = {
        project_id: projectId,
        video_url: videoUrl,
        enable_interpolation: settings.enableInterpolation,
        enable_upscale: settings.enableUpscale,
        shot_id: shotId,
        based_on: generationId,
        source_variant_id: activeVariantId || undefined,
      };

      // Add interpolation params if enabled
      if (settings.enableInterpolation) {
        params.interpolation = {
          num_frames: settings.numFrames,
          use_calculated_fps: true, // Always maintain playback speed
        };
      }

      // Add upscale params if enabled
      if (settings.enableUpscale) {
        params.upscale = {
          upscale_factor: settings.upscaleFactor,
          color_fix: settings.colorFix,
          output_quality: settings.outputQuality,
        };
      }

      await createVideoEnhanceTask(params);
      setGenerateSuccess(true);

    } catch (error) {
      console.error('[useVideoEnhance] Error creating task:', error);
      handleError(error, { context: 'useVideoEnhance', toastTitle: 'Failed to create video enhancement task' });
    } finally {
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
      removeIncomingTask(incomingTaskId);
      setIsGenerating(false);
    }
  }, [
    canSubmit,
    projectId,
    videoUrl,
    shotId,
    generationId,
    activeVariantId,
    settings,
    addIncomingTask,
    removeIncomingTask,
    queryClient,
  ]);

  return {
    settings,
    updateSetting,
    isValid,
    canSubmit,
    handleGenerate,
    isGenerating,
    generateSuccess,
  };
}
