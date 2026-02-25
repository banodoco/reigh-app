/**
 * Handles task generation for inpainting and annotated edits.
 * Exports mask from Konva, uploads to storage, and creates tasks.
 */

import { useCallback } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import type { GenerationRow } from '@/domains/generation/types';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { createImageInpaintTask } from '@/shared/lib/tasks/imageInpaint';
import { createAnnotatedImageEditTask } from '@/shared/lib/tasks/annotatedImageEdit';
import type { StrokeOverlayHandle } from '../../components/StrokeOverlay';
import type { BrushStroke, EditAdvancedSettings, QwenEditModel } from './types';

import { convertToHiresFixApiParams } from '../useGenerationEditSettings';
import { getGenerationId, getMediaUrl } from '@/shared/lib/mediaTypeHelpers';
import { useTaskPlaceholder } from '@/shared/hooks/useTaskPlaceholder';

/**
 * Task type configuration - captures the differences between inpaint and annotate modes
 */
type TaskType = 'inpaint' | 'annotate';

interface TaskTypeConfig {
  logPrefix: string;
  emptyStrokesError: string;
  overlayNotReadyError: string;
  fileNamePrefix: string;
  taskCreationError: string;
  createTask: typeof createImageInpaintTask | typeof createAnnotatedImageEditTask;
}

const TASK_CONFIGS: Record<TaskType, TaskTypeConfig> = {
  inpaint: {
    logPrefix: '[Inpaint]',
    emptyStrokesError: 'Please paint on the image first',
    overlayNotReadyError: 'Paint overlay not ready',
    fileNamePrefix: 'inpaint_mask',
    taskCreationError: 'Failed to create inpaint task',
    createTask: createImageInpaintTask,
  },
  annotate: {
    logPrefix: '[AnnotateEdit]',
    emptyStrokesError: 'Please draw an annotation rectangle',
    overlayNotReadyError: 'Annotation overlay not ready',
    fileNamePrefix: 'annotated_edit_mask',
    taskCreationError: 'Failed to create annotated edit task',
    createTask: createAnnotatedImageEditTask,
  },
};

interface UseTaskGenerationProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  shotId?: string;
  toolTypeOverride?: string;
  isVideo: boolean;
  loras?: Array<{ url: string; strength: number }>;
  activeVariantId?: string | null;
  activeVariantLocation?: string | null;
  createAsGeneration?: boolean;
  advancedSettings?: EditAdvancedSettings;
  qwenEditModel?: QwenEditModel;
  // State
  inpaintStrokes: BrushStroke[];
  annotationStrokes: BrushStroke[];
  inpaintPrompt: string;
  inpaintNumGenerations: number;
  // Refs
  strokeOverlayRef: React.RefObject<StrokeOverlayHandle>;
  // Callbacks
  handleExitInpaintMode: () => void;
  setIsGeneratingInpaint: (isGenerating: boolean) => void;
  setInpaintGenerateSuccess: (success: boolean) => void;
}

export function useTaskGeneration({
  media,
  selectedProjectId,
  shotId,
  toolTypeOverride,
  isVideo,
  loras,
  activeVariantId,
  activeVariantLocation,
  createAsGeneration,
  advancedSettings,
  qwenEditModel,
  inpaintStrokes,
  annotationStrokes,
  inpaintPrompt,
  inpaintNumGenerations,
  strokeOverlayRef,
  handleExitInpaintMode,
  setIsGeneratingInpaint,
  setInpaintGenerateSuccess,
}: UseTaskGenerationProps) {
  // Get actual generation ID (may differ from media.id for shot_generations)
  const actualGenerationId = getGenerationId(media);
  const run = useTaskPlaceholder();

  /**
   * Unified task generation function
   * Handles both inpaint and annotate modes with mode-specific configuration
   */
  const handleGenerateTask = useCallback(async (taskType: TaskType) => {
    const config = TASK_CONFIGS[taskType];
    const strokes = taskType === 'inpaint' ? inpaintStrokes : annotationStrokes;

    // Validation
    if (!selectedProjectId || isVideo) {
      toast.error(`Cannot generate ${taskType === 'inpaint' ? 'inpaint' : 'annotated edit'}`);
      return;
    }

    if (strokes.length === 0) {
      toast.error(config.emptyStrokesError);
      return;
    }

    if (!inpaintPrompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    if (!strokeOverlayRef.current) {
      toast.error(config.overlayNotReadyError);
      return;
    }

    const incomingTaskType = taskType === 'inpaint' ? 'image_inpaint' : 'annotated_image_edit';

    setIsGeneratingInpaint(true);
    try {
      await run({
        taskType: incomingTaskType,
        label: inpaintPrompt.trim() || 'Editing...',
        context: 'useTaskGeneration',
        toastTitle: config.taskCreationError,
        create: async () => {
          // Export mask directly from Konva
          const maskImageData = strokeOverlayRef.current!.exportMask({ pixelRatio: 1.5 });

          if (!maskImageData) {
            throw new Error('Failed to export mask from overlay');
          }

          // Upload mask to storage
          const maskFile = await fetch(maskImageData)
            .then(res => res.blob())
            .then(blob => new File([blob], `${config.fileNamePrefix}_${media.id}_${Date.now()}.png`, { type: 'image/png' }));

          const maskUrl = await uploadImageToStorage(maskFile);

          // Get source image URL
          const mediaUrl = getMediaUrl(media) || media.imageUrl;
          const sourceUrl = activeVariantLocation || mediaUrl;
          if (!sourceUrl) {
            throw new Error('Missing source media URL');
          }
          if (!actualGenerationId) {
            throw new Error('Missing generation id');
          }

          return config.createTask({
            project_id: selectedProjectId,
            image_url: sourceUrl,
            mask_url: maskUrl,
            prompt: inpaintPrompt,
            num_generations: inpaintNumGenerations,
            generation_id: actualGenerationId ?? undefined,
            shot_id: shotId,
            tool_type: toolTypeOverride,
            loras: loras,
            create_as_generation: createAsGeneration,
            source_variant_id: activeVariantId || undefined,
            hires_fix: convertToHiresFixApiParams(advancedSettings),
            qwen_edit_model: qwenEditModel,
          });
        },
        onSuccess: () => {
          // Show success state
          setInpaintGenerateSuccess(true);

          // Wait 1 second to show success, then exit
          setTimeout(() => {
            setInpaintGenerateSuccess(false);
            handleExitInpaintMode();
          }, 1000);
        },
      });
    } finally {
      setIsGeneratingInpaint(false);
    }
  }, [
    selectedProjectId, isVideo, inpaintStrokes, annotationStrokes, inpaintPrompt, inpaintNumGenerations,
    media, handleExitInpaintMode, shotId, toolTypeOverride, loras,
    activeVariantLocation, activeVariantId, createAsGeneration, advancedSettings,
    qwenEditModel, strokeOverlayRef, actualGenerationId,
    setIsGeneratingInpaint, setInpaintGenerateSuccess, run
  ]);

  // Stable callbacks that preserve the original API
  const handleGenerateInpaint = useCallback(() => {
    return handleGenerateTask('inpaint');
  }, [handleGenerateTask]);

  const handleGenerateAnnotatedEdit = useCallback(() => {
    return handleGenerateTask('annotate');
  }, [handleGenerateTask]);

  return {
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
  };
}
