/** Canonical tool IDs used for `params.tool_type` and tool-scoped settings. */
export const TOOL_IDS = {
  TRAVEL_BETWEEN_IMAGES: 'travel-between-images',
  IMAGE_GENERATION: 'image-generation',
  JOIN_CLIPS: 'join-clips',
  EDIT_VIDEO: 'edit-video',
  EDIT_IMAGES: 'edit-images',
  CHARACTER_ANIMATE: 'character-animate',
  TRAINING_DATA_HELPER: 'training-data-helper',
} as const;

export type ToolIdKey = keyof typeof TOOL_IDS;
export type ToolId = (typeof TOOL_IDS)[ToolIdKey];

const TOOL_ID_SET = new Set<ToolId>(Object.values(TOOL_IDS));

export function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && TOOL_ID_SET.has(value as ToolId);
}
