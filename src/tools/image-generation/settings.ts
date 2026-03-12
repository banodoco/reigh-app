export type GenerationMode = 'wan-local' | 'qwen-image';

export interface PromptEntry {
  id: string;
  fullPrompt: string;
  shortPrompt?: string;
}

export interface ActiveLora {
  id: string;
  name: string;
  path: string;
  strength: number;
  previewImageUrl?: string;
}

export type PromptMode = 'managed' | 'automated';

import type { HiresFixConfig } from '@/shared/lib/imageGeneration/hiresFixConfig';

export type { HiresFixConfig };

interface ImageGenerationSettings {
  prompts?: PromptEntry[];
  imagesPerPrompt?: number;
  selectedLorasByMode?: Record<GenerationMode, ActiveLora[]>;
  selectedLoras?: ActiveLora[]; // Currently selected LoRAs
  depthStrength?: number;
  softEdgeStrength?: number;
  generationMode?: GenerationMode;
  beforeEachPromptText?: string; // Text to prepend (defaults empty, not inherited)
  afterEachPromptText?: string; // Text to append (defaults empty, not inherited)
  associatedShotId?: string | null; // Last associated shot
  promptMode?: PromptMode;
  masterPromptText?: string; // Legacy - kept for migration
  hiresFixConfig?: HiresFixConfig; // Two-pass hires fix settings
}

const defaultImageGenerationSettings: ImageGenerationSettings = {
  prompts: [
    {
      id: 'prompt-1',
      fullPrompt: 'A majestic cat astronaut exploring a vibrant nebula, artstation',
      shortPrompt: 'Cat Astronaut',
    },
  ],
  // Content fields (don't inherit to new projects) - explicit empty defaults
  // Note: beforeEachPromptText/afterEachPromptText are NOT persisted
  associatedShotId: null,

  // Configuration fields (can inherit to new projects)
  imagesPerPrompt: 1,
  selectedLorasByMode: {
    'wan-local': [],
    'qwen-image': [],
  },
  selectedLoras: [],
  depthStrength: 50,
  softEdgeStrength: 20,
  generationMode: 'wan-local',
  promptMode: 'automated',
  masterPromptText: '', // Legacy - kept for migration
  hiresFixConfig: {
    enabled: true,
    resolution_mode: 'project',
    resolution_scale: 1.5,
    base_steps: 8,
    hires_scale: 1.1,
    hires_steps: 8,
    hires_denoise: 0.55,
    lightning_lora_strength_phase_1: 0.9,
    lightning_lora_strength_phase_2: 0.5,
    phaseLoraStrengths: [],
  },
};

import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';

export const imageGenerationSettings = {
  id: TOOL_IDS.IMAGE_GENERATION,
  scope: ['project'] as const,
  defaults: defaultImageGenerationSettings,
}; 
