// Edit Video Tool Settings
// For regenerating portions of videos using AI

import { VACE_GENERATION_DEFAULTS } from '@/shared/lib/vaceDefaults';

export const editVideoSettings = {
  id: 'edit-video',
  scope: ['project'] as const,
  defaults: {
    ...VACE_GENERATION_DEFAULTS,
    // Edit-video-specific frame counts
    contextFrameCount: 8,
    gapFrameCount: 12,
    // Selected video info
    selectedVideoUrl: undefined as string | undefined,
    selectedVideoPosterUrl: undefined as string | undefined,
    selectedVideoGenerationId: undefined as string | undefined,
    // Portion selection (in seconds)
    portionStartTime: 0,
    portionEndTime: 0,
    // LoRAs (for basic mode - additional loras on top of preset)
    loras: [] as Array<{ id: string; strength: number }>,
    hasEverSetLoras: false as boolean,
  },
};

// TypeScript type for settings
export type EditVideoSettings = typeof editVideoSettings.defaults;

