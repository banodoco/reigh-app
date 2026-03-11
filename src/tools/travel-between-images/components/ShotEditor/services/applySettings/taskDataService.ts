import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_STRUCTURE_VIDEO,
  type StructureGuidanceConfig,
  type StructureVideoConfigWithMetadata,
} from '@/shared/lib/tasks/travelBetweenImages';
import {
  normalizeStructureGuidance,
} from '@/shared/lib/tasks/structureGuidance';
import {
  collectTravelStructureLegacyUsage,
  enforceTravelStructureLegacyPolicy,
} from '@/shared/lib/tasks/travelBetweenImages/legacyStructureVideo';
import type { VideoMetadata } from '@/shared/lib/media/videoUploader';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type {
  ExtractedSettings,
  ExtractedStructureVideoSettings,
  TaskData,
} from './types';

export const fetchTask = async (taskId: string): Promise<TaskData | null> => {
  try {
    const { data, error } = await supabase().from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (error || !data) {
      normalizeAndPresentError(error ?? new Error('No task data returned'), {
        context: 'ApplySettings.fetchTask',
        showToast: false,
        logData: { taskId },
      });
      return null;
    }

    const params = (data.params || {}) as Record<string, unknown>;
    const orchestrator = (params.orchestrator_details || params.full_orchestrator_payload || {}) as Record<string, unknown>;

    return { params, orchestrator };
  } catch (queryError) {
    normalizeAndPresentError(queryError, {
      context: 'ApplySettings.fetchTask',
      showToast: false,
      logData: { taskId },
    });
    return null;
  }
};

function extractStructureSettings(taskData: TaskData): ExtractedStructureVideoSettings {
  const params = taskData.params as Record<string, unknown>;
  const orchestrator = taskData.orchestrator as Record<string, unknown>;
  const structureGuidance = (orchestrator.structure_guidance ?? params.structure_guidance) as Record<string, unknown> | undefined;
  const rawStructureVideos = (
    orchestrator.structure_videos ??
    params.structure_videos ??
    structureGuidance?.videos
  ) as Array<Record<string, unknown>> | undefined;
  const presentInTask =
    Boolean(structureGuidance)
    || Array.isArray(rawStructureVideos)
    || 'structure_video_path' in orchestrator
    || 'structure_video_path' in params;

  enforceTravelStructureLegacyPolicy(
    collectTravelStructureLegacyUsage({
      ...params,
      ...orchestrator,
      structure_videos: rawStructureVideos,
    }),
    {
      context: 'applySettings.extractSettings',
      enforcement: 'warn',
    },
  );

  const normalizedStructureGuidance = normalizeStructureGuidance({
    structureGuidance,
    structureVideos: rawStructureVideos,
    structureVideoPath: orchestrator.structure_video_path ?? params.structure_video_path,
    structureVideoTreatment: orchestrator.structure_video_treatment ?? params.structure_video_treatment,
    structureVideoType: orchestrator.structure_video_type
      ?? orchestrator.structure_type
      ?? params.structure_video_type
      ?? params.structure_type,
    structureVideoMotionStrength: orchestrator.structure_video_motion_strength ?? params.structure_video_motion_strength,
    structureVideoCannyIntensity: orchestrator.structure_canny_intensity ?? params.structure_canny_intensity,
    structureVideoDepthContrast: orchestrator.structure_depth_contrast ?? params.structure_depth_contrast,
    uni3cStartPercent: orchestrator.uni3c_start_percent ?? params.uni3c_start_percent,
    uni3cEndPercent: orchestrator.uni3c_end_percent ?? params.uni3c_end_percent,
    useUni3c: orchestrator.use_uni3c ?? params.use_uni3c,
    defaultVideoTreatment: DEFAULT_STRUCTURE_VIDEO.treatment,
    defaultUni3cEndPercent: DEFAULT_STRUCTURE_VIDEO.uni3c_end_percent,
  }) as StructureGuidanceConfig | undefined;

  const guidanceVideos = Array.isArray(normalizedStructureGuidance?.videos)
    ? normalizedStructureGuidance.videos
    : [];
  const structureVideos = (guidanceVideos.length > 0 ? guidanceVideos : (rawStructureVideos ?? []))
    .filter((video): video is Record<string, unknown> => typeof video?.path === 'string' && video.path.length > 0)
    .map((video, index): StructureVideoConfigWithMetadata => {
      const rawVideo = rawStructureVideos?.[index];
      return {
        path: video.path as string,
        start_frame: typeof video.start_frame === 'number' ? video.start_frame : 0,
        end_frame: typeof video.end_frame === 'number' ? video.end_frame : 0,
        treatment: video.treatment === 'clip' ? 'clip' : 'adjust',
        ...(rawVideo?.metadata ? { metadata: rawVideo.metadata as VideoMetadata } : {}),
        ...(typeof rawVideo?.resource_id === 'string' ? { resource_id: rawVideo.resource_id } : {}),
      };
    });

  return {
    presentInTask,
    ...(normalizedStructureGuidance ? { structureGuidance: normalizedStructureGuidance } : {}),
    ...(structureVideos.length > 0 ? { structureVideos } : {}),
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
