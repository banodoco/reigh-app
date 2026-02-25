import { VACE_GENERATION_DEFAULTS } from '@/shared/lib/vaceDefaults';
import { TOOL_IDS } from '@/shared/lib/toolIds';

interface EditVideoDefaultsExtension {
  contextFrameCount: number;
  gapFrameCount: number;
  selectedVideoUrl?: string;
  selectedVideoPosterUrl?: string;
  selectedVideoGenerationId?: string;
  portionStartTime: number;
  portionEndTime: number;
  loras: Array<{ id: string; strength: number }>;
  hasEverSetLoras: boolean;
}

type EditVideoSettingsDefaults = typeof VACE_GENERATION_DEFAULTS & EditVideoDefaultsExtension;

export const editVideoSettings = {
  id: TOOL_IDS.EDIT_VIDEO,
  scope: ['project'] as const,
  defaults: {
    ...VACE_GENERATION_DEFAULTS,
    contextFrameCount: 8,
    gapFrameCount: 12,
    selectedVideoUrl: undefined,
    selectedVideoPosterUrl: undefined,
    selectedVideoGenerationId: undefined,
    portionStartTime: 0,
    portionEndTime: 0,
    loras: [],
    hasEverSetLoras: false,
  } satisfies EditVideoSettingsDefaults,
};

export type EditVideoSettings = EditVideoSettingsDefaults;
