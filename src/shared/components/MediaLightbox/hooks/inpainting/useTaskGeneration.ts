/**
 * Handles task generation for inpainting and annotated edits.
 * Exports mask from Konva, uploads to storage, and creates tasks.
 */

import { useCallback } from 'react';
import { toast } from '@/shared/components/ui/sonner';
import { handleError } from '@/shared/lib/errorHandler';
import type { GenerationRow } from '@/types/shots';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { createImageInpaintTask } from '@/shared/lib/tasks/imageInpaint';
import { createAnnotatedImageEditTask } from '@/shared/lib/tasks/annotatedImageEdit';
import type { StrokeOverlayHandle } from '../../components/StrokeOverlay';
import type { BrushStroke, EditAdvancedSettings, QwenEditModel } from './types';

// Import the converter function
import { convertToHiresFixApiParams } from '../useGenerationEditSettings';
import { getGenerationId, getMediaUrl } from '@/shared/lib/mediaTypeHelpers';

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

  /**
   * Unified task generation function
   * Handles both inpaint and annotate modes with mode-specific configuration
   */
  const handleGenerateTask = useCallback(async (taskType: TaskType) => {
    const config = TASK_CONFIGS[taskType];
    const strokes = taskType === 'inpaint' ? inpaintStrokes : annotationStrokes;

    console.log(`${config.logPrefix} handleGenerate called`, {
      selectedProjectId: selectedProjectId?.substring(0, 8),
      strokesLength: strokes.length,
      hasStrokeOverlayRef: !!strokeOverlayRef.current,
    });

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

    setIsGeneratingInpaint(true);
    try {
      // Export mask directly from Konva
      const maskImageData = strokeOverlayRef.current.exportMask({ pixelRatio: 1.5 });

      if (!maskImageData) {
        throw new Error('Failed to export mask from overlay');
      }

      console.log(`${config.logPrefix} Mask exported from Konva`);

      // Upload mask to storage
      const maskFile = await fetch(maskImageData)
        .then(res => res.blob())
        .then(blob => new File([blob], `${config.fileNamePrefix}_${media.id}_${Date.now()}.png`, { type: 'image/png' }));

      const maskUrl = await uploadImageToStorage(maskFile);
      console.log(`${config.logPrefix} Mask uploaded:`, maskUrl);

      // Get source image URL
      const mediaUrl = getMediaUrl(media) || media.imageUrl;
      const sourceUrl = activeVariantLocation || mediaUrl;

      console.log(`${config.logPrefix} Creating task`, {
        generation_id: actualGenerationId.substring(0, 8),
        prompt: inpaintPrompt.substring(0, 30),
      });

      await config.createTask({
        project_id: selectedProjectId,
        image_url: sourceUrl,
        mask_url: maskUrl,
        prompt: inpaintPrompt,
        num_generations: inpaintNumGenerations,
        generation_id: actualGenerationId,
        shot_id: shotId,
        tool_type: toolTypeOverride,
        loras: loras,
        create_as_generation: createAsGeneration,
        source_variant_id: activeVariantId || undefined,
        hires_fix: convertToHiresFixApiParams(advancedSettings),
        qwen_edit_model: qwenEditModel,
      });

      console.log(`${config.logPrefix} Task created successfully`);

      // Show success state
      setInpaintGenerateSuccess(true);

      // Wait 1 second to show success, then exit
      setTimeout(() => {
        setInpaintGenerateSuccess(false);
        handleExitInpaintMode();
      }, 1000);

    } catch (error) {
      handleError(error, { context: 'useTaskGeneration', toastTitle: config.taskCreationError });
    } finally {
      setIsGeneratingInpaint(false);
    }
  }, [
    selectedProjectId, isVideo, inpaintStrokes, annotationStrokes, inpaintPrompt, inpaintNumGenerations,
    media, handleExitInpaintMode, shotId, toolTypeOverride, loras,
    activeVariantLocation, activeVariantId, createAsGeneration, advancedSettings,
    qwenEditModel, strokeOverlayRef, actualGenerationId,
    setIsGeneratingInpaint, setInpaintGenerateSuccess
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
