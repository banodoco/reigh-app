import { TOOL_IDS } from '@/shared/lib/toolIds';

export const editImagesSettings = {
  id: TOOL_IDS.EDIT_IMAGES,
  scope: ['project'] as const,
  defaults: {
    // No specific settings defaults needed yet
  },
};

// Type is inferred from defaults, not exported since unused
