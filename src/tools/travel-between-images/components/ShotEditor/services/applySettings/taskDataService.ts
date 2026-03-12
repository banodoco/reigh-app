import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { buildTaskPayloadSnapshot } from '@/shared/lib/tasks/taskPayloadSnapshot';
import { buildTravelStructureSource, readResolvedTravelStructure } from '@/shared/lib/tasks/travelContractData';
import {
  collectTravelStructureLegacyUsage,
  enforceTravelStructureLegacyPolicy,
} from '@/shared/lib/tasks/travelBetweenImages/legacyStructureVideo';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type {
  ExtractedSettings,
  ExtractedStructureVideoSettings,
  FetchTaskResult,
  TaskData,
} from './types';

export const fetchTask = async (taskId: string): Promise<FetchTaskResult> => {
  try {
    const { data, error } = await supabase().from('tasks')
      .select('*')
      .eq('id', taskId)
      .maybeSingle();

    // .maybeSingle() returns {data: null, error: null} for missing rows,
    // so only genuine DB errors reach here.
    if (error) {
      throw error;
    }

    if (!data) {
      return { status: 'missing' };
    }

    const params = (data.params || {}) as Record<string, unknown>;
    const orchestrator = (params.orchestrator_details || params.full_orchestrator_payload || {}) as Record<string, unknown>;

    return {
      status: 'found',
      taskData: { params, orchestrator },
    };
  } catch (queryError) {
    normalizeAndPresentError(queryError, {
      context: 'ApplySettings.fetchTask',
      showToast: false,
      logData: { taskId },
    });
    throw queryError;
  }
};

function extractStructureSettings(taskData: TaskData): ExtractedStructureVideoSettings {
  const snapshot = buildTaskPayloadSnapshot(taskData.params);
  const structureSource = buildTravelStructureSource(snapshot);
  const legacyUsage = collectTravelStructureLegacyUsage(structureSource);

  enforceTravelStructureLegacyPolicy(
    legacyUsage,
    {
      context: 'applySettings.extractSettings',
      enforcement: 'warn',
    },
  );

  const resolvedStructure = readResolvedTravelStructure(snapshot);

  return {
    presentInTask:
      resolvedStructure.present
      || legacyUsage.topLevelFields.length > 0
      || legacyUsage.structureVideoFields.length > 0,
    ...(resolvedStructure.structureGuidance
      ? { structureGuidance: resolvedStructure.structureGuidance }
      : {}),
    ...(resolvedStructure.structureVideos.length > 0
      ? { structureVideos: resolvedStructure.structureVideos }
      : {}),
  };
}

export const extractSettings = (taskData: TaskData): ExtractedSettings => {
  // Cast to permissive record for dynamic property access from Supabase JSON
  const params = taskData.params as Record<string, unknown>;
  const orchestrator = taskData.orchestrator as Record<string, unknown>;
  const structure = extractStructureSettings(taskData);

  // Extract all settings with fallbacks
  return {
    prompts: {
      prompt: (
        (orchestrator.base_prompts_expanded?.[0] && orchestrator.base_prompts_expanded[0].trim()) ||
        (orchestrator.base_prompt && orchestrator.base_prompt.trim()) ||
        (params.prompt && params.prompt.trim()) ||
        undefined
      ),
      prompts: orchestrator.base_prompts_expanded as string[] | undefined,
      negativePrompt: (orchestrator.negative_prompts_expanded as string[] | undefined)?.[0] ?? (params.negative_prompt as string | undefined),
      negativePrompts: orchestrator.negative_prompts_expanded as string[] | undefined,
    },
    generation: {
      steps: (orchestrator.steps ?? params.num_inference_steps) as number | undefined,
      frames: (
        (orchestrator.segment_frames_expanded as number[] | undefined)?.[0] ??
        (params.segment_frames_expanded as number | undefined)
      ),
      segmentFramesExpanded: (orchestrator.segment_frames_expanded ?? params.segment_frames_expanded) as number[] | undefined,
      context: (
        (orchestrator.frame_overlap_expanded as number[] | undefined)?.[0] ??
        (params.frame_overlap_expanded as number | undefined)
      ),
      model: (params.model_name ?? orchestrator.model_name) as string | undefined,
    },
    images: {
      inputImages: (() => {
        const cleanUrl = (url: string): string => {
          if (typeof url !== 'string') return url;
          return url.replace(/^["']|["']$/g, '');
        };

        if (Array.isArray(params.input_images) && params.input_images.length > 0) {
          return params.input_images.map(cleanUrl);
        }
        if (orchestrator.input_image_paths_resolved && Array.isArray(orchestrator.input_image_paths_resolved)) {
          return (orchestrator.input_image_paths_resolved as string[]).map(cleanUrl);
        }
        if (Array.isArray(params.input_image_paths_resolved)) {
          return (params.input_image_paths_resolved as string[]).map(cleanUrl);
        }
        return undefined;
      })(),
    },
    modes: {
      generationMode: (orchestrator.generation_mode ?? params.generation_mode) as 'batch' | 'timeline' | 'by-pair' | undefined,
      generationTypeMode: (orchestrator.model_type ?? params.model_type) as 'i2v' | 'vace' | undefined,
      advancedMode: (orchestrator.advanced_mode ?? params.advanced_mode) as boolean | undefined,
      motionMode: (orchestrator.motion_mode ?? params.motion_mode) as 'basic' | 'presets' | 'advanced' | undefined,
    },
    advanced: {
      phaseConfig: (orchestrator.phase_config ?? params.phase_config) as ExtractedSettings['advanced']['phaseConfig'],
      selectedPhasePresetId: (orchestrator.selected_phase_preset_id ?? params.selected_phase_preset_id) as string | null | undefined,
      turboMode: (orchestrator.turbo_mode ?? params.turbo_mode) as boolean | undefined,
      enhancePrompt: (orchestrator.enhance_prompt ?? params.enhance_prompt) as boolean | undefined,
    },
    textAddons: {
      textBeforePrompts: (orchestrator.text_before_prompts ?? params.text_before_prompts) as string | undefined,
      textAfterPrompts: (orchestrator.text_after_prompts ?? params.text_after_prompts) as string | undefined,
    },
    motion: {
      amountOfMotion: (orchestrator.amount_of_motion ?? params.amount_of_motion) as number | undefined,
    },
    loras: {
      loras: (() => {
        const loraData = (orchestrator.loras ?? orchestrator.additional_loras ?? params.loras ?? params.additional_loras) as
          | Array<{ path: string; strength: number }>
          | Record<string, number>
          | undefined;
        if (!loraData) return undefined;

        if (Array.isArray(loraData)) return loraData;

        return Object.entries(loraData).map(([path, strength]) => ({
          path,
          strength,
        }));
      })(),
    },
    structure,
  };
};
