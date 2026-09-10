import { useState, useCallback } from 'react';
import { createVideoEnhanceTask } from '@/shared/lib/taskCreation';
import type { VideoEnhanceSettings } from './useGenerationEditSettings';
import { useTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';

export type { VideoEnhanceSettings } from './useGenerationEditSettings';

interface UseVideoEnhanceProps {
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

interface UseVideoEnhanceReturn {
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
  settings,
  updateSettings,
}: UseVideoEnhanceProps): UseVideoEnhanceReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateSuccess, setGenerateSuccess] = useState(false);
  const run = useTaskPlaceholder();

  // Adapter to match the expected interface
  const updateSetting = useCallback(<K extends keyof VideoEnhanceSettings>(
    key: K,
    value: VideoEnhanceSettings[K]
  ) => {
    updateSettings({ [key]: value });
    // Reset success state when settings change
    setGenerateSuccess(false);
  }, [updateSettings]);

  // Astrid currently admits only the bounded source-FPS/audio-preserving
  // upscale profile. Keep the UI from dispatching a request that the typed
  // producer must reject before CAS ingest.
  const isValid = (
    settings.enableUpscale
    && !settings.enableInterpolation
    && settings.numFrames === 1
    && !settings.colorFix
    && settings.outputQuality === 'maximum'
  );

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

    try {
      await run({
        taskType: 'video_enhance',
        label: enhanceLabel || 'Video Enhance',
        context: 'useVideoEnhance',
        toastTitle: 'Failed to create video enhancement task',
        create: () => {
          return createVideoEnhanceTask(projectId, {
            sourceUrl: videoUrl,
            enableInterpolation: settings.enableInterpolation,
            enableUpscale: settings.enableUpscale,
            numFrames: settings.numFrames,
            upscaleFactor: settings.upscaleFactor,
            colorFix: settings.colorFix,
            outputQuality: settings.outputQuality,
          });
        },
        onSuccess: () => {
          setGenerateSuccess(true);
        },
      });
    } finally {
      setIsGenerating(false);
    }
  }, [
    canSubmit,
    projectId,
    videoUrl,
    settings,
    run,
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
