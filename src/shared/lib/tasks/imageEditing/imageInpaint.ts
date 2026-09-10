import {
  createTask,
  ingestProjectInput,
  ingestProjectInputFromUrl,
  resolveTaskCapability,
} from '@/shared/lib/taskCreation';
import { AstridLocalClient } from '@/integrations/astrid/client';
import { runtimeSha256IdSchema } from '@/tools/video-editor/data/bridgeContract';
import { TaskValidationError, type TaskCreationResult } from '@/shared/lib/taskCreation/types';
import type { MaskedEditKind, MaskedEditTaskParams } from './buildMaskedEditTaskParams';

type CreateImageInpaintTaskParams = MaskedEditTaskParams;

export const IMAGE_EDIT_CAPABILITY_ID = 'generation.generate_image_edit';
const SOURCE_MAX_BYTES = 512_000;
const BOUNDED_EDIT_SIZE = '1024x1024';
const SUPPORTED_QWEN_UI_MODEL = 'qwen-edit-2511';
const SUPPORTED_INPAINT_ASTRID_MODEL = 'qwen-image-edit-inpaint';
const DEFAULT_INPAINT_STRENGTH = 0.93;
type SupportedBoundedEditModel = typeof SUPPORTED_QWEN_UI_MODEL | 'flux-klein-4b' | 'flux-klein-9b';
// Only aliases with a verified Astrid catalog identity are admitted.  The
// UI-facing names never cross the task boundary.
const ASTRID_MODEL_BY_UI_ALIAS: Record<SupportedBoundedEditModel, 'qwen-image-edit-2511' | 'flux2-klein-4b' | 'flux2-klein-9b'> = {
  [SUPPORTED_QWEN_UI_MODEL]: 'qwen-image-edit-2511',
  'flux-klein-4b': 'flux2-klein-4b',
  'flux-klein-9b': 'flux2-klein-9b',
};

export interface BoundedImageEditTaskOptions {
  sourceUrl: string;
  prompt: string;
  count: number;
  qwenEditModel: string;
  basedOn?: string;
  sourceVariantId?: string | null;
}

async function resolveEditLineage(
  project: string,
  generationId: string,
  requestedVariantId?: string | null,
): Promise<{ generationId: string; expectedVersion: number; sourceVariantId: string; sourceObjectId: string }> {
  const detail = await new AstridLocalClient({ projectSlug: project }).gallery.get(generationId);
  const expectedVersion = detail.version;
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new TaskValidationError(
      'Astrid generation detail has no usable version for atomic edit settlement',
      'lineage',
    );
  }
  const sourceVariant = requestedVariantId
    ? detail.variants.find((variant) => variant.id === requestedVariantId)
    : detail.variants.find((variant) => variant.is_primary) ?? detail.variants[0];
  if (!sourceVariant) {
    throw new TaskValidationError(
      'Astrid generation has no source variant for atomic edit settlement',
      'lineage',
    );
  }
  const sourceObjectId = sourceVariant.object_id;
  if (typeof sourceObjectId !== 'string' || !runtimeSha256IdSchema.safeParse(sourceObjectId).success) {
    throw new TaskValidationError(
      'Astrid source variant does not expose a CAS object identity for atomic edit settlement',
      'lineage',
    );
  }
  return {
    generationId,
    expectedVersion,
    sourceVariantId: sourceVariant.id,
    sourceObjectId,
  };
}

/** Admit the currently published source-only Qwen edit profile. */
export async function createBoundedImageEditTask(
  project: string,
  options: BoundedImageEditTaskOptions,
): Promise<TaskCreationResult> {
  if (!(options.qwenEditModel in ASTRID_MODEL_BY_UI_ALIAS)) {
    throw new TaskValidationError(
      `Edit model ${options.qwenEditModel} is not represented by the published Astrid edit capability`,
      'qwenEditModel',
    );
  }
  if (!options.prompt.trim()) {
    throw new TaskValidationError('Image edit prompt must be non-empty', 'prompt');
  }
  if (options.count !== 1) {
    throw new TaskValidationError(
      'The published bounded edit profile admits exactly one output per task',
      'count',
    );
  }
  if (options.sourceVariantId && !options.basedOn) {
    throw new TaskValidationError(
      'sourceVariantId requires basedOn generation lineage',
      'lineage',
    );
  }

  const lineage = options.basedOn
    ? await resolveEditLineage(project, options.basedOn, options.sourceVariantId)
    : null;

  const capability = await resolveTaskCapability(project, IMAGE_EDIT_CAPABILITY_ID);
  if (capability.estimated_scratch_bytes <= 0 || capability.estimated_output_bytes <= 0) {
    throw new TaskValidationError(
      'Astrid edit capability has no nonzero storage estimate; producer admission is blocked',
      'storage_estimate',
    );
  }
  const source = await ingestProjectInputFromUrl(project, options.sourceUrl, {
    maxBytes: SOURCE_MAX_BYTES,
    requireImage: true,
  });
  if (!source.media_type.startsWith('image/')) {
    throw new TaskValidationError('Image edit source must be an image media type', 'sourceUrl');
  }
  if (lineage && source.object_id !== lineage.sourceObjectId) {
    throw new TaskValidationError(
      'Selected Astrid source variant does not match the admitted source bytes',
      'lineage',
    );
  }

  const result = await createTask({
    project,
    capability_id: IMAGE_EDIT_CAPABILITY_ID,
    capability_digest: capability.definition_digest,
    schema_version: '1',
    input_object_ids: [source.object_id],
    spec: {
      family: IMAGE_EDIT_CAPABILITY_ID,
      params: {
        model: ASTRID_MODEL_BY_UI_ALIAS[options.qwenEditModel as SupportedBoundedEditModel],
        mode: 'edit',
        execution: 'cloud',
        prompt: options.prompt.trim(),
        count: 1,
        size: BOUNDED_EDIT_SIZE,
        image_ref: {
          digest: source.object_id,
          filename: source.filename,
          media_type: source.media_type,
        },
      },
      output_policy: {},
    },
    storage_estimate: {
      scratch_bytes: capability.estimated_scratch_bytes,
      output_bytes: capability.estimated_output_bytes,
    },
    settlement_effect: lineage
      ? {
          effect_type: 'generation.variant.append',
          target_id: lineage.generationId,
          expected_version: lineage.expectedVersion,
          payload: {
            source_variant_id: lineage.sourceVariantId,
            source_object_id: source.object_id,
            variant_type: 'magic_edit',
            output_name: 'generated_images',
            output_ordinal: 0,
            primary_policy: 'preserve',
          },
        }
      : {},
  });
  return result;
}

async function ingestEditImage(
  project: string,
  locator: string,
  role: 'source' | 'mask',
): Promise<Awaited<ReturnType<typeof ingestProjectInputFromUrl>>> {
  if (!locator.startsWith('data:')) {
    return ingestProjectInputFromUrl(project, locator, {
      maxBytes: SOURCE_MAX_BYTES,
      requireImage: true,
    });
  }

  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z0-9+/=]+)$/i.exec(locator);
  if (!match) {
    throw new TaskValidationError(
      `${role === 'mask' ? 'Mask' : 'Source'} media data URL must be a supported base64 image`,
      role === 'mask' ? 'mask_url' : 'image_url',
    );
  }
  let binary: string;
  try {
    binary = atob(match[2]);
  } catch {
    throw new TaskValidationError(
      `${role === 'mask' ? 'Mask' : 'Source'} media data URL is malformed`,
      role === 'mask' ? 'mask_url' : 'image_url',
    );
  }
  if (binary.length > SOURCE_MAX_BYTES) {
    throw new TaskValidationError(
      `${role === 'mask' ? 'Mask' : 'Source'} media exceeds the ${SOURCE_MAX_BYTES}-byte ingest boundary`,
      role === 'mask' ? 'mask_url' : 'image_url',
    );
  }
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return ingestProjectInput(
    project,
    new Blob([bytes], { type: match[1].toLowerCase() }),
    {
      mediaType: match[1].toLowerCase(),
      originalName: role === 'mask' ? 'mask.png' : 'source.png',
    },
  );
}

function validateMaskedEditOptions(params: CreateImageInpaintTaskParams): {
  editKind: MaskedEditKind;
  strength: number;
} {
  if (params.qwen_edit_model && params.qwen_edit_model !== SUPPORTED_QWEN_UI_MODEL) {
    throw new TaskValidationError(
      `Qwen edit model ${params.qwen_edit_model} is not represented by the bounded mask edit capability`,
      'qwen_edit_model',
    );
  }
  if (params.num_generations !== 1) {
    throw new TaskValidationError(
      'The bounded mask edit profile admits exactly one output per task',
      'num_generations',
    );
  }
  if (!params.prompt.trim()) {
    throw new TaskValidationError('Masked image edit prompt must be non-empty', 'prompt');
  }
  if (params.create_as_generation || params.loras?.length || params.hires_fix) {
    throw new TaskValidationError(
      'The bounded mask edit profile does not support legacy generation, LoRA, or hires-fix routing',
      'capability_id',
    );
  }
  const editKind = params.edit_kind ?? 'inpaint';
  const strength = params.strength ?? DEFAULT_INPAINT_STRENGTH;
  if (
    typeof strength !== 'number'
    || !Number.isFinite(strength)
    || strength < 0
    || strength > 1
  ) {
    throw new TaskValidationError(
      'Masked image edit strength must be a finite number from 0 through 1',
      'strength',
    );
  }
  return { editKind, strength };
}

export async function createImageInpaintTask(
  params: CreateImageInpaintTaskParams,
): Promise<TaskCreationResult> {
  const { editKind, strength } = validateMaskedEditOptions(params);
  if (!params.image_url.trim() || !params.mask_url.trim()) {
    throw new TaskValidationError('Masked image edit requires source and mask media', 'input_object_ids');
  }
  if (params.source_variant_id && !params.generation_id) {
    throw new TaskValidationError(
      'source_variant_id requires generation_id lineage',
      'lineage',
    );
  }

  const lineage = params.generation_id
    ? await resolveEditLineage(params.project_id, params.generation_id, params.source_variant_id)
    : null;
  const capability = await resolveTaskCapability(params.project_id, IMAGE_EDIT_CAPABILITY_ID);
  if (capability.estimated_scratch_bytes <= 0 || capability.estimated_output_bytes <= 0) {
    throw new TaskValidationError(
      'Astrid mask edit capability has no nonzero storage estimate; producer admission is blocked',
      'storage_estimate',
    );
  }

  const [source, mask] = await Promise.all([
    ingestEditImage(params.project_id, params.image_url, 'source'),
    ingestEditImage(params.project_id, params.mask_url, 'mask'),
  ]);
  if (!source.media_type.startsWith('image/') || !mask.media_type.startsWith('image/')) {
    throw new TaskValidationError('Masked edit source and mask must be image media types', 'input_object_ids');
  }
  if (source.object_id === mask.object_id) {
    throw new TaskValidationError('Masked edit source and mask must be distinct CAS objects', 'input_object_ids');
  }
  if (lineage && source.object_id !== lineage.sourceObjectId) {
    throw new TaskValidationError(
      'Selected Astrid source variant does not match the admitted source bytes',
      'lineage',
    );
  }

  return createTask({
    project: params.project_id,
    capability_id: IMAGE_EDIT_CAPABILITY_ID,
    capability_digest: capability.definition_digest,
    schema_version: '1',
    input_object_ids: [source.object_id, mask.object_id],
    spec: {
      family: IMAGE_EDIT_CAPABILITY_ID,
      params: {
        model: SUPPORTED_INPAINT_ASTRID_MODEL,
        mode: 'inpaint',
        execution: 'cloud',
        prompt: params.prompt.trim(),
        count: 1,
        size: BOUNDED_EDIT_SIZE,
        strength,
        image_ref: {
          digest: source.object_id,
          filename: source.filename,
          media_type: source.media_type,
        },
        mask_ref: {
          digest: mask.object_id,
          filename: mask.filename,
          media_type: mask.media_type,
        },
      },
      output_policy: {},
    },
    storage_estimate: {
      scratch_bytes: capability.estimated_scratch_bytes,
      output_bytes: capability.estimated_output_bytes,
    },
    settlement_effect: lineage
      ? {
          effect_type: 'generation.variant.append',
          target_id: lineage.generationId,
          expected_version: lineage.expectedVersion,
          payload: {
            source_variant_id: lineage.sourceVariantId,
            source_object_id: source.object_id,
            variant_type: editKind,
            output_name: 'generated_images',
            output_ordinal: 0,
            primary_policy: 'preserve',
          },
        }
      : {},
  });
}
