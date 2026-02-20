/**
 * Service for applying settings from a task to the current shot
 * Refactored from monolithic function for better maintainability and testability
 */

import { supabase } from '@/integrations/supabase/client';
import { extractVideoMetadataFromUrl, type VideoMetadata } from '@/shared/lib/videoUploader';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { LoraModel } from '@/shared/components/LoraSelectorModal/types';
import type { Shot } from '@/types/shots';
import type { GenerationRow } from '@/types/shots';
import type { AddImageToShotVariables } from '@/shared/hooks/shots/addImageToShotHelpers';

// ==================== Types ====================

interface TaskData {
  params: Record<string, any>;
  orchestrator: Record<string, any>;
}

interface ExtractedSettings {
  // Prompts
  prompt?: string;
  prompts?: string[];
  negativePrompt?: string;
  negativePrompts?: string[];
  
  // Generation settings
  steps?: number;
  frames?: number;  // Legacy: single value for uniform spacing
  segmentFramesExpanded?: number[];  // NEW: array of gaps between successive frames
  context?: number;
  model?: string;
  
  // Input images (for image replacement)
  inputImages?: string[];
  
  // Modes
  generationMode?: 'batch' | 'timeline' | 'by-pair';
  generationTypeMode?: 'i2v' | 'vace';  // I2V vs VACE mode
  advancedMode?: boolean;
  motionMode?: 'basic' | 'advanced';
  
  // Advanced mode settings
  phaseConfig?: PhaseConfig;
  selectedPhasePresetId?: string | null;
  turboMode?: boolean;
  enhancePrompt?: boolean;
  
  // Text addons
  textBeforePrompts?: string;
  textAfterPrompts?: string;
  
  // Motion
  amountOfMotion?: number;
  
  // LoRAs
  loras?: Array<{ path: string; strength: number }>;
  
  // Structure video
  structureVideos?: StructureVideoConfigWithMetadata[];
  structureVideoPath?: string | null;
  structureVideoTreatment?: 'adjust' | 'clip';
  structureVideoMotionStrength?: number;
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth';
}

interface ApplyResult {
  success: boolean;
  settingName: string;
  error?: string;
  details?: Record<string, unknown> | string;
}

export interface ApplyContext {
  // Current state
  currentGenerationMode: 'batch' | 'timeline' | 'by-pair';
  currentAdvancedMode: boolean;
  
  // Callbacks for applying settings
  onBatchVideoPromptChange: (prompt: string) => void;
  onSteerableMotionSettingsChange: (settings: { model_name?: string; negative_prompt?: string }) => void;
  onBatchVideoFramesChange: (frames: number) => void;
  onBatchVideoStepsChange: (steps: number) => void;
  onGenerationModeChange: (mode: 'batch' | 'timeline' | 'by-pair') => void;
  onAdvancedModeChange: (advanced: boolean) => void;
  onMotionModeChange?: (mode: 'basic' | 'advanced') => void;
  onGenerationTypeModeChange?: (mode: 'i2v' | 'vace') => void;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onPhasePresetSelect?: (presetId: string, config: PhaseConfig) => void;
  onPhasePresetRemove?: () => void;
  onTurboModeChange?: (turbo: boolean) => void;
  onEnhancePromptChange?: (enhance: boolean) => void;
  onTextBeforePromptsChange?: (text: string) => void;
  onTextAfterPromptsChange?: (text: string) => void;
  onAmountOfMotionChange?: (motion: number) => void;
  
  // Structure video
  onStructureVideoInputChange: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth'
  ) => void;
  
  // LoRAs
  loraManager: {
    setSelectedLoras?: (loras: Array<{ id: string; name: string; path: string; strength: number; [key: string]: unknown }>) => void;
    handleAddLora: (lora: LoraModel, showToast: boolean, strength: number) => void;
  };
  availableLoras: LoraModel[];
  
  // Pair prompts (for timeline mode)
  updatePairPromptsByIndex?: (index: number, prompt: string, negativePrompt: string) => Promise<void>;
  
  // Current values for comparison
  steerableMotionSettings: { model_name: string };
  batchVideoFrames: number;
  batchVideoSteps: number;
  textBeforePrompts?: string;
  textAfterPrompts?: string;
  turboMode?: boolean;
  enhancePrompt?: boolean;
  amountOfMotion?: number;
  motionMode?: 'basic' | 'advanced';
  generationTypeMode?: 'i2v' | 'vace';
}

// ==================== Fetch Task ====================

export const fetchTask = async (taskId: string): Promise<TaskData | null> => {
  
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();
    
    if (error || !data) {
      console.error('[ApplySettings] ❌ Failed to fetch task:', error);
      return null;
    }
    
    const params = (data.params || {}) as Record<string, unknown>;
    const orchestrator = (params.orchestrator_details || params.full_orchestrator_payload || {}) as Record<string, unknown>;
    
    return { params, orchestrator };
  } catch (queryError) {
    console.error('[ApplySettings] ❌ Exception fetching task:', queryError);
    return null;
  }
};

// ==================== Extract Settings ====================

export const extractSettings = (taskData: TaskData): ExtractedSettings => {
  // Cast to permissive record for dynamic property access from Supabase JSON
  const params = taskData.params as Record<string, any>;
  const orchestrator = taskData.orchestrator as Record<string, any>;

  const structureGuidance = (orchestrator.structure_guidance ?? params.structure_guidance) as Record<string, unknown> | undefined;
  const guidanceTarget = structureGuidance?.target as string | undefined;
  const guidancePreprocessing = structureGuidance?.preprocessing as string | undefined;
  const inferredStructureType: 'uni3c' | 'flow' | 'canny' | 'depth' =
    guidanceTarget === 'uni3c'
      ? 'uni3c'
      : guidancePreprocessing === 'canny'
        ? 'canny'
        : guidancePreprocessing === 'depth'
          ? 'depth'
          : 'flow';

  const rawStructureVideos = (
    orchestrator.structure_videos ??
    params.structure_videos ??
    structureGuidance?.videos
  ) as Array<Record<string, unknown>> | undefined;

  const structureVideos = Array.isArray(rawStructureVideos)
    ? rawStructureVideos
        .filter(video => typeof video.path === 'string' && video.path.length > 0)
        .map((video): StructureVideoConfigWithMetadata => ({
          path: video.path as string,
          start_frame: typeof video.start_frame === 'number' ? video.start_frame : 0,
          end_frame: typeof video.end_frame === 'number' ? video.end_frame : 0,
          treatment: video.treatment === 'clip' ? 'clip' : 'adjust',
          motion_strength: typeof video.motion_strength === 'number' ? video.motion_strength : 1.0,
          structure_type: (video.structure_type as 'uni3c' | 'flow' | 'canny' | 'depth' | undefined) ?? inferredStructureType,
          ...(typeof video.uni3c_end_percent === 'number' ? { uni3c_end_percent: video.uni3c_end_percent } : {}),
          ...(video.metadata ? { metadata: video.metadata as VideoMetadata } : {}),
        }))
    : undefined;

  const firstStructureVideo = structureVideos?.[0];
  
  // Extract all settings with fallbacks
  const extracted: ExtractedSettings = {
    // Prompts
    prompt: (
      (orchestrator.base_prompts_expanded?.[0] && orchestrator.base_prompts_expanded[0].trim()) ||
      (orchestrator.base_prompt && orchestrator.base_prompt.trim()) ||
      (params.prompt && params.prompt.trim()) ||
      undefined
    ),
    prompts: orchestrator.base_prompts_expanded,
    negativePrompt: orchestrator.negative_prompts_expanded?.[0] ?? params.negative_prompt,
    negativePrompts: orchestrator.negative_prompts_expanded,
    
    // Generation settings
    steps: orchestrator.steps ?? params.num_inference_steps,
    frames: orchestrator.segment_frames_expanded?.[0] ?? params.segment_frames_expanded, // Legacy: single value for backward compat
    segmentFramesExpanded: orchestrator.segment_frames_expanded ?? params.segment_frames_expanded, // NEW: full array of gaps
    context: orchestrator.frame_overlap_expanded?.[0] ?? params.frame_overlap_expanded,
    model: params.model_name ?? orchestrator.model_name,
    
    // Modes
    generationMode: orchestrator.generation_mode ?? params.generation_mode,
    // model_type is the existing field that stores I2V vs VACE mode
    generationTypeMode: orchestrator.model_type ?? params.model_type,
    advancedMode: orchestrator.advanced_mode ?? params.advanced_mode,
    motionMode: orchestrator.motion_mode ?? params.motion_mode,
    
    // Advanced mode settings
    phaseConfig: orchestrator.phase_config ?? params.phase_config,
    selectedPhasePresetId: orchestrator.selected_phase_preset_id ?? params.selected_phase_preset_id,
    turboMode: orchestrator.turbo_mode ?? params.turbo_mode,
    enhancePrompt: orchestrator.enhance_prompt ?? params.enhance_prompt,
    
    // Text addons
    textBeforePrompts: orchestrator.text_before_prompts ?? params.text_before_prompts,
    textAfterPrompts: orchestrator.text_after_prompts ?? params.text_after_prompts,
    
    // Motion
    amountOfMotion: orchestrator.amount_of_motion ?? params.amount_of_motion,
    
    // LoRAs - convert from object format to array format
    // Backend stores as { "url": strength, ... } but we need [{ path, strength }, ...]
    loras: (() => {
      const loraData = orchestrator.loras ?? orchestrator.additional_loras ?? params.loras ?? params.additional_loras;
      if (!loraData) return undefined;
      
      // If already array format, return as-is
      if (Array.isArray(loraData)) return loraData;
      
      // Convert object format to array format
      return Object.entries(loraData).map(([path, strength]) => ({
        path,
        strength: strength as number
      }));
    })(),
    
    // Structure video
    structureVideos,
    structureVideoPath: firstStructureVideo?.path ?? orchestrator.structure_video_path ?? params.structure_video_path,
    structureVideoTreatment: firstStructureVideo?.treatment ?? orchestrator.structure_video_treatment ?? params.structure_video_treatment,
    structureVideoMotionStrength: firstStructureVideo?.motion_strength ?? orchestrator.structure_video_motion_strength ?? params.structure_video_motion_strength,
    // Note: Backend uses both "structure_type" and "structure_video_type" - check both
    structureVideoType: firstStructureVideo?.structure_type ?? orchestrator.structure_video_type ?? orchestrator.structure_type ?? params.structure_video_type ?? params.structure_type ?? inferredStructureType,
    
    // Input images - extract from multiple possible locations
    inputImages: (() => {
      const cleanUrl = (url: string): string => {
        if (typeof url !== 'string') return url;
        return url.replace(/^["']|["']$/g, '');
      };
      
      if (Array.isArray(params.input_images) && params.input_images.length > 0) {
        return params.input_images.map(cleanUrl);
      }
      if (orchestrator.input_image_paths_resolved && Array.isArray(orchestrator.input_image_paths_resolved)) {
        return orchestrator.input_image_paths_resolved.map(cleanUrl);
      }
      if (Array.isArray(params.input_image_paths_resolved)) {
        return params.input_image_paths_resolved.map(cleanUrl);
      }
      return undefined;
    })(),
  };
  
  return extracted;
};

// ==================== Apply Functions ====================

export const applyModelSettings = (
  settings: ExtractedSettings,
  context: ApplyContext
): ApplyResult => {
  if (!settings.model || settings.model === context.steerableMotionSettings.model_name) {
    return { success: true, settingName: 'model', details: 'skipped - no change' };
  }
  
  context.onSteerableMotionSettingsChange({ model_name: settings.model });
  
  return { success: true, settingName: 'model', details: settings.model };
};

export const applyPromptSettings = async (
  settings: ExtractedSettings,
  context: ApplyContext
): Promise<ApplyResult> => {
  // Apply main prompt
  if (typeof settings.prompt === 'string' && settings.prompt.trim()) {
    context.onBatchVideoPromptChange(settings.prompt);
  }
  
  // Apply individual prompts to pair configs (regardless of current mode)
  if (settings.prompts && settings.prompts.length > 1 && context.updatePairPromptsByIndex) {
    
    const errors: string[] = [];
    
    for (let i = 0; i < settings.prompts.length; i++) {
      const pairPrompt = settings.prompts[i]?.trim();
      const pairNegativePrompt = settings.negativePrompts?.[i]?.trim() || '';
      
      if (pairPrompt) {
        try {
          await context.updatePairPromptsByIndex(i, pairPrompt, pairNegativePrompt);
        } catch (e) {
          console.error(`[ApplySettings] ❌ Failed to apply prompt for pair ${i}:`, e);
          errors.push(`Pair ${i}: ${e}`);
        }
      }
    }
    
    if (errors.length > 0) {
      return { success: false, settingName: 'prompts', error: errors.join('; ') };
    }
  }
  
  // Apply negative prompt
  if (settings.negativePrompt !== undefined) {
    context.onSteerableMotionSettingsChange({ negative_prompt: settings.negativePrompt || '' });
  }
  
  return { success: true, settingName: 'prompts' };
};

export const applyGenerationSettings = (
  settings: ExtractedSettings,
  context: ApplyContext
): ApplyResult => {
  // Apply frames
  if (typeof settings.frames === 'number' && !Number.isNaN(settings.frames)) {
    context.onBatchVideoFramesChange(settings.frames);
  }
  
  // Apply context
  // Context frames removed - now fixed at 10 frames
  
  // Apply steps
  if (typeof settings.steps === 'number' && !Number.isNaN(settings.steps)) {
    context.onBatchVideoStepsChange(settings.steps);
  }
  
  return { success: true, settingName: 'generation' };
};

export const applyModeSettings = (
  settings: ExtractedSettings,
  context: ApplyContext
): ApplyResult => {
  // Apply generation mode
  if (settings.generationMode && (settings.generationMode === 'batch' || settings.generationMode === 'timeline' || settings.generationMode === 'by-pair')) {
    context.onGenerationModeChange(settings.generationMode);
  }
  
  // Apply advanced mode
  if (settings.advancedMode !== undefined) {
    context.onAdvancedModeChange(settings.advancedMode);
  }
  
  // Apply motion mode
  if (settings.motionMode !== undefined && context.onMotionModeChange) {
    context.onMotionModeChange(settings.motionMode);
  }
  
  // Apply generation type mode (I2V vs VACE)
  if (settings.generationTypeMode !== undefined && context.onGenerationTypeModeChange) {
    context.onGenerationTypeModeChange(settings.generationTypeMode);
  }
  
  return { success: true, settingName: 'modes' };
};

export const applyAdvancedModeSettings = (
  settings: ExtractedSettings,
  context: ApplyContext
): ApplyResult => {
  // Helper to deep clone phase config to prevent shared references
  const deepClonePhaseConfig = (config: typeof settings.phaseConfig) => {
    if (!config) return undefined;
    return {
      ...config,
      steps_per_phase: [...config.steps_per_phase],
      phases: config.phases.map(phase => ({
        ...phase,
        loras: phase.loras.map(lora => ({ ...lora }))
      }))
    };
  };
  
  // Apply phase config
  if (settings.phaseConfig) {
    // DEEP CLONE: Prevent shared references when applying task settings
    const clonedConfig = deepClonePhaseConfig(settings.phaseConfig)!;
    context.onPhaseConfigChange(clonedConfig);
  }
  
  // Apply phase preset ID
  if (settings.selectedPhasePresetId !== undefined) {
    
    if (settings.selectedPhasePresetId && context.onPhasePresetSelect && settings.phaseConfig) {
      // Note: onPhasePresetSelect also deep clones, but we pass cloned config anyway for safety
      const clonedConfig = deepClonePhaseConfig(settings.phaseConfig)!;
      context.onPhasePresetSelect(settings.selectedPhasePresetId, clonedConfig);
    } else if (!settings.selectedPhasePresetId && context.onPhasePresetRemove) {
      context.onPhasePresetRemove();
    }
  }
  
  // Apply turbo mode
  if (settings.turboMode !== undefined && context.onTurboModeChange) {
    context.onTurboModeChange(settings.turboMode);
  }
  
  // Apply enhance prompt
  if (settings.enhancePrompt !== undefined && context.onEnhancePromptChange) {
    context.onEnhancePromptChange(settings.enhancePrompt);
  }
  
  return { success: true, settingName: 'advancedMode' };
};

export const applyTextPromptAddons = (
  settings: ExtractedSettings,
  context: ApplyContext
): ApplyResult => {
  // Apply text before prompts
  if (settings.textBeforePrompts !== undefined && context.onTextBeforePromptsChange) {
    context.onTextBeforePromptsChange(settings.textBeforePrompts);
  }
  
  // Apply text after prompts
  if (settings.textAfterPrompts !== undefined && context.onTextAfterPromptsChange) {
    context.onTextAfterPromptsChange(settings.textAfterPrompts);
  }
  
  return { success: true, settingName: 'textAddons' };
};

export const applyMotionSettings = (
  settings: ExtractedSettings,
  context: ApplyContext
): ApplyResult => {
  // Only apply if NOT in advanced mode
  if (settings.amountOfMotion !== undefined && !settings.advancedMode && context.onAmountOfMotionChange) {
    context.onAmountOfMotionChange(settings.amountOfMotion * 100);
  }
  
  return { success: true, settingName: 'motion' };
};

export const applyLoRAs = (
  settings: ExtractedSettings,
  context: ApplyContext
): Promise<ApplyResult> => {
  const loras = settings.loras;

  // Only apply if NOT in advanced mode
  if (loras === undefined || settings.advancedMode) {
    return Promise.resolve({ success: true, settingName: 'loras', details: 'skipped' });
  }
  
  if (loras.length > 0) {
    
    // Clear existing LoRAs first
    if (context.loraManager.setSelectedLoras) {
      context.loraManager.setSelectedLoras([]);
    }
    
    // Map paths to available LoRAs and restore them (with delay to ensure state is cleared)
    return new Promise((resolve) => {
      setTimeout(() => {
        let matchedCount = 0;
        
        loras.forEach((loraData) => {
          const matchingLora = context.availableLoras.find(lora => {
            const legacyDownloadLink = (lora as Record<string, any>)['Download Link'];
            const loraUrl = lora.huggingface_url ?? (typeof legacyDownloadLink === 'string' ? legacyDownloadLink : '');
            return loraUrl === loraData.path ||
                   loraUrl.endsWith(loraData.path) ||
                   loraData.path.endsWith(loraUrl.split('/').pop() || '');
          });
          
          if (matchingLora) {
            context.loraManager.handleAddLora(matchingLora, false, loraData.strength);
            matchedCount++;
          }
        });
        
        resolve({ success: true, settingName: 'loras', details: `${matchedCount}/${loras.length} matched` });
      }, 100); // Small delay to ensure state clears
    });
  } else {
    if (context.loraManager.setSelectedLoras) {
      context.loraManager.setSelectedLoras([]);
    }
    return Promise.resolve({ success: true, settingName: 'loras', details: 'cleared' });
  }
};

// ==================== Apply Structure Video ====================

export const applyStructureVideo = async (
  settings: ExtractedSettings,
  context: ApplyContext,
  taskData: TaskData
): Promise<ApplyResult> => {
  const hasStructureVideos = Array.isArray((taskData.orchestrator as Record<string, unknown>).structure_videos)
    || Array.isArray((taskData.params as Record<string, unknown>).structure_videos);
  const hasLegacyStructureVideo = 'structure_video_path' in taskData.orchestrator || 'structure_video_path' in taskData.params;
  const hasGuidanceVideos =
    Array.isArray(((taskData.orchestrator as Record<string, unknown>).structure_guidance as Record<string, unknown> | undefined)?.videos) ||
    Array.isArray(((taskData.params as Record<string, unknown>).structure_guidance as Record<string, unknown> | undefined)?.videos);
  const hasStructureVideoInTask = hasStructureVideos || hasLegacyStructureVideo || hasGuidanceVideos;
  
  if (!hasStructureVideoInTask) {
    return { success: true, settingName: 'structureVideo', details: 'skipped - not in task' };
  }
  
  const firstStructureVideo = settings.structureVideos?.[0];
  const structureVideoPath = firstStructureVideo?.path ?? settings.structureVideoPath;

  if (structureVideoPath) {
    
    if (!context.onStructureVideoInputChange) {
      console.error('[ApplySettings] ❌ onStructureVideoInputChange is not defined!');
      return { success: false, settingName: 'structureVideo', error: 'handler not defined' };
    }
    
    try {
      let metadata = null;
      try {
        metadata = firstStructureVideo?.metadata ?? await extractVideoMetadataFromUrl(structureVideoPath);
      } catch { /* intentionally ignored */ }
      
      context.onStructureVideoInputChange(
        structureVideoPath,
        metadata,
        firstStructureVideo?.treatment ?? (settings.structureVideoTreatment || 'adjust'),
        firstStructureVideo?.motion_strength ?? settings.structureVideoMotionStrength ?? 1.0,
        firstStructureVideo?.structure_type ?? (settings.structureVideoType || 'uni3c')
      );
      
      return { success: true, settingName: 'structureVideo' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ApplySettings] ❌ Error applying structure video:', error);
      return { success: false, settingName: 'structureVideo', error: errorMessage };
    }
  } else {
    if (context.onStructureVideoInputChange) {
      context.onStructureVideoInputChange(null, null, 'adjust', 1.0, 'uni3c');
    }
    return { success: true, settingName: 'structureVideo', details: 'cleared' };
  }
};

// ==================== Apply Frame Positions ====================

/**
 * Apply frame positions from segment_frames_expanded to existing images
 * This is used when settings are applied WITHOUT replacing images
 */
export const applyFramePositionsToExistingImages = async (
  settings: ExtractedSettings,
  selectedShot: Shot | null,
  simpleFilteredImages: GenerationRow[]
): Promise<ApplyResult> => {
  const segmentGaps = settings.segmentFramesExpanded;
  const hasSegmentGaps = Array.isArray(segmentGaps) && segmentGaps.length > 0;
  
  if (!hasSegmentGaps) {
    return { success: true, settingName: 'framePositions', details: 'no data' };
  }
  
  if (!selectedShot?.id) {
    return { success: true, settingName: 'framePositions', details: 'skipped - no shot' };
  }
  
  // Calculate cumulative positions from gaps
  const cumulativePositions: number[] = [0]; // First image always at frame 0
  for (let i = 0; i < segmentGaps.length; i++) {
    const prevPosition = cumulativePositions[cumulativePositions.length - 1];
    cumulativePositions.push(prevPosition + segmentGaps[i]);
  }
  
  try {
    // Update timeline_frame for each image
    const updates = simpleFilteredImages.map(async (img, index) => {
      // img.id is the shot_generations.id
      if (!img.id) {
        return null;
      }
      
      // Use cumulative position if available
      const newTimelineFrame = index < cumulativePositions.length 
        ? cumulativePositions[index]
        : cumulativePositions[cumulativePositions.length - 1] + (index - cumulativePositions.length + 1) * (segmentGaps[segmentGaps.length - 1] || 60);
      
      const { error } = await supabase
        .from('shot_generations')
        .update({ timeline_frame: newTimelineFrame })
        .eq('id', img.id); // img.id is shot_generations.id
      
      if (error) {
        console.error('[ApplySettings] ❌ Failed to update timeline_frame:', error);
        return null;
      }
      
      return { id: img.id, newTimelineFrame };
    });
    
    const results = await Promise.all(updates);
    const successCount = results.filter(r => r !== null).length;
    
    return {
      success: true,
      settingName: 'framePositions',
      details: { updated: successCount, total: simpleFilteredImages.length }
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error('[ApplySettings] ❌ Error applying frame positions:', e);
    return {
      success: false,
      settingName: 'framePositions',
      error: errorMessage
    };
  }
};

// ==================== Replace Images ====================

export const replaceImagesIfRequested = async (
  settings: ExtractedSettings,
  replaceImages: boolean,
  inputImages: string[],
  selectedShot: Shot | null,
  projectId: string,
  simpleFilteredImages: GenerationRow[],
  addImageToShotMutation: { mutateAsync: (params: AddImageToShotVariables) => Promise<unknown> },
  removeImageFromShotMutation: {
    mutateAsync: (params: {
      shotId: string;
      shotGenerationId: string;
      projectId: string;
      shiftItems?: { id: string; newFrame: number }[];
    }) => Promise<unknown>;
  }
): Promise<ApplyResult> => {
  if (!replaceImages) {
    // NEW: Apply frame positions to existing images even when not replacing
    return await applyFramePositionsToExistingImages(settings, selectedShot, simpleFilteredImages);
  }
  
  if (!selectedShot?.id || !projectId) {
    return { success: true, settingName: 'images', details: 'skipped - missing context' };
  }
  
  // Use inputImages from params if passed array is empty but settings has them
  const effectiveInputImages = (inputImages && inputImages.length > 0) 
    ? inputImages 
    : (settings.inputImages || []);
  
  if (effectiveInputImages.length === 0) {
    return { success: false, settingName: 'images', error: 'No input images available' };
  }
  
  try {
    // Remove existing non-video images (only those with id)
    const imagesToDelete = simpleFilteredImages.filter((img): img is GenerationRow & { id: string } => !!img.id);

    const deletions = imagesToDelete.map(img => removeImageFromShotMutation.mutateAsync({
      shotId: selectedShot.id,
      shotGenerationId: img.id, // img.id is shot_generations.id - narrowed by filter above
      projectId: projectId,
    }));
    
    if (deletions.length > 0) {
      await Promise.allSettled(deletions);
    }
    
    // Calculate timeline positions from segment_frames_expanded array
    // segment_frames_expanded contains GAPS between successive frames
    // e.g., [65, 37, 21] means: image0=0, image1=0+65=65, image2=65+37=102, image3=102+21=123
    const segmentGaps = settings.segmentFramesExpanded;
    const hasSegmentGaps = Array.isArray(segmentGaps) && segmentGaps.length > 0;
    
    // Calculate cumulative positions from gaps
    let cumulativePositions: number[] = [];
    if (hasSegmentGaps) {
      cumulativePositions = [0]; // First image always at frame 0
      for (let i = 0; i < segmentGaps.length; i++) {
        const prevPosition = cumulativePositions[cumulativePositions.length - 1];
        cumulativePositions.push(prevPosition + segmentGaps[i]);
      }
    }
    
    // Fallback to uniform spacing if no segment_frames_expanded
    const uniformSpacing = settings.frames || 60;
    
    // Look up generation IDs for all input image URLs
    const { data: generationLookup, error: lookupError } = await supabase
      .from('generations')
      .select('id, location, thumbnail_url')
      .in('location', effectiveInputImages);
    
    if (lookupError) {
      console.error('[ApplySettings] ❌ Failed to look up generations by URL:', lookupError);
      return { success: false, settingName: 'images', error: 'Failed to look up generation IDs for input images' };
    }
    
    // Create a map of URL -> generation data for quick lookup
    const urlToGeneration = new Map<string, { id: string; location: string; thumbnail_url: string | null }>();
    (generationLookup || []).forEach(gen => {
      if (typeof gen.location === 'string' && gen.location.length > 0) {
        urlToGeneration.set(gen.location, {
          id: gen.id,
          location: gen.location,
          thumbnail_url: gen.thumbnail_url,
        });
      }
    });
    
    // Add input images in order with calculated timeline_frame positions
    const additions = effectiveInputImages.map((url: string, index: number) => {
      // Use cumulative position if available, otherwise fall back to uniform spacing
      const timelineFrame = hasSegmentGaps && index < cumulativePositions.length
        ? cumulativePositions[index]
        : index * uniformSpacing;
      
      // Look up the generation for this URL
      const generation = urlToGeneration.get(url);
      
      if (!generation) {
        return Promise.resolve(); // Skip this image
      }
      
      return addImageToShotMutation.mutateAsync({
        shot_id: selectedShot.id,
        generation_id: generation.id,
        project_id: projectId,
        imageUrl: url,
        thumbUrl: generation.thumbnail_url || url,
        timelineFrame: timelineFrame,
      });
    });
    
    if (additions.length > 0) {
      await Promise.allSettled(additions);
    }
    
    return {
      success: true,
      settingName: 'images',
      details: { removed: imagesToDelete.length, added: effectiveInputImages.length }
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error('[ApplySettings] ❌ Error replacing images:', e);
    return {
      success: false,
      settingName: 'images',
      error: errorMessage
    };
  }
};
