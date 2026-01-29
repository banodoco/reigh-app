import { useAutoSaveSettings } from '@/shared/hooks/useAutoSaveSettings';
import { EditVideoSettings, BUILTIN_VACE_DEFAULT_ID } from '../settings';

const DEFAULT_EDIT_VIDEO_SETTINGS: EditVideoSettings = {
  contextFrameCount: 16,
  gapFrameCount: 12,
  replaceMode: true,
  keepBridgingImages: false,
  model: 'wan_2_2_vace_lightning_baseline_2_2_2',
  numInferenceSteps: 6,
  guidanceScale: 3.0,
  seed: -1,
  negativePrompt: '',
  priority: 0,
  prompt: '',
  randomSeed: true,
  enhancePrompt: true,
  // Motion settings
  motionMode: 'basic',
  phaseConfig: undefined,
  selectedPhasePresetId: BUILTIN_VACE_DEFAULT_ID,
  // Selected video info
  selectedVideoUrl: undefined,
  selectedVideoPosterUrl: undefined,
  selectedVideoGenerationId: undefined,
  portionStartTime: 0,
  portionEndTime: 0,
  loras: [],
  hasEverSetLoras: false,
};

/**
 * Hook for managing Edit Video tool settings at the project level
 * Uses useAutoSaveSettings with Edit Video specific defaults
 */
export function useEditVideoSettings(projectId: string | null | undefined) {
  return useAutoSaveSettings<EditVideoSettings>({
    toolId: 'edit-video',
    scope: 'project',
    projectId,
    defaults: DEFAULT_EDIT_VIDEO_SETTINGS,
    enabled: !!projectId,
    debug: false,
    debugTag: '[EditVideo]',
  });
}

