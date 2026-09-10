import type { GenerationRow } from '@/domains/generation/types';
import type { StrokeOverlayHandle } from '../../components/StrokeOverlay';
import type { EditAdvancedSettings, QwenEditModel } from './types';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { createImageInpaintTask } from '@/shared/lib/tasks/imageEditing/imageInpaint';
import { buildMaskedEditTaskParams } from '@/shared/lib/tasks/imageEditing/buildMaskedEditTaskParams';

type TaskType = 'inpaint' | 'annotate';

interface CreateInpaintingTaskWorkflowParams {
  taskType: TaskType;
  media: GenerationRow;
  selectedProjectId: string;
  shotId?: string;
  toolTypeOverride?: string;
  loras?: Array<{ url: string; strength: number }>;
  activeVariantId?: string | null;
  activeVariantLocation?: string | null;
  createAsGeneration?: boolean;
  advancedSettings?: EditAdvancedSettings;
  qwenEditModel?: QwenEditModel;
  inpaintPrompt: string;
  inpaintNumGenerations: number;
  actualGenerationId: string;
  strokeOverlay: StrokeOverlayHandle;
}

export async function createInpaintingTaskWorkflow({
  taskType,
  media,
  selectedProjectId,
  shotId,
  toolTypeOverride,
  loras,
  activeVariantId,
  activeVariantLocation,
  createAsGeneration,
  advancedSettings,
  qwenEditModel,
  inpaintPrompt,
  inpaintNumGenerations,
  actualGenerationId,
  strokeOverlay,
}: CreateInpaintingTaskWorkflowParams): Promise<string> {
  if (!selectedProjectId) {
    throw new Error('Missing project for masked edit task');
  }
  const sourceUrl = activeVariantLocation || media.imageUrl || media.location;
  if (!sourceUrl) {
    throw new Error('Masked edit source image is unavailable');
  }
  const maskUrl = strokeOverlay.exportMask();
  if (!maskUrl) {
    throw new Error('Masked edit overlay did not produce a mask');
  }
  if (createAsGeneration) {
    throw new Error('The bounded mask edit capability only settles generation variants');
  }
  if (loras?.length) {
    throw new Error('The bounded mask edit capability does not support LoRA routing');
  }
  if (advancedSettings?.enabled) {
    throw new Error('The bounded mask edit capability does not support hires-fix routing');
  }
  const actualId = actualGenerationId || getGenerationId(media);
  if (!actualId) {
    throw new Error('Missing generation id for masked edit lineage');
  }

  return createImageInpaintTask(
    buildMaskedEditTaskParams({
      projectId: selectedProjectId,
      imageUrl: sourceUrl,
      maskUrl,
      prompt: inpaintPrompt.trim(),
      numGenerations: inpaintNumGenerations,
      generationId: actualId,
      shotId,
      toolType: toolTypeOverride,
      sourceVariantId: activeVariantId || undefined,
      createAsGeneration: false,
      editKind: taskType === 'annotate' ? 'annotated_edit' : 'inpaint',
      qwenEditModel,
    }),
  ).then(result => result.task_id);
}
