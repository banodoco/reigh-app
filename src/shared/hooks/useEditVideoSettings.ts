/**
 * useEditVideoSettings - Hook for managing Edit Video tool settings
 *
 * Uses useAutoSaveSettings with Edit Video specific defaults.
 * This hook was moved from tools/edit-video/hooks/ to shared/
 * because it's used by shared/components/MediaLightbox/hooks/useVideoEditing.ts.
 */

import { useAutoSaveSettings } from '@/shared/hooks/useAutoSaveSettings';
import { PhaseConfig } from '@/shared/types/phaseConfig';
import { BUILTIN_VACE_DEFAULT_ID } from '@/shared/lib/vaceDefaults';

/**
 * Edit Video settings type
 */
export interface EditVideoSettings {
  contextFrameCount: number;
  gapFrameCount: number;
  replaceMode: boolean;
  keepBridgingImages: boolean;
  model: string;
  numInferenceSteps: number;
  guidanceScale: number;
  seed: number;
  negativePrompt: string;
  priority: number;
  prompt: string;
  randomSeed: boolean;
  enhancePrompt: boolean;
  // Motion settings (Basic/Advanced mode with presets)
  motionMode: 'basic' | 'advanced';
  phaseConfig: PhaseConfig | undefined;
  selectedPhasePresetId: string | null;
  // Selected video info
  selectedVideoUrl: string | undefined;
  selectedVideoPosterUrl: string | undefined;
  selectedVideoGenerationId: string | undefined;
  // Portion selection (in seconds)
  portionStartTime: number;
  portionEndTime: number;
  // LoRAs (for basic mode - additional loras on top of preset)
  loras: Array<{ id: string; strength: number }>;
  hasEverSetLoras: boolean;
}

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
  enhancePrompt: false,
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
