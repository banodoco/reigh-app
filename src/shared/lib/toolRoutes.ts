/** Route paths for tool navigation. */
export const TOOL_ROUTES = {
  TOOLS_HOME: '/tools',
  TRAVEL_BETWEEN_IMAGES: '/tools/travel-between-images',
  IMAGE_GENERATION: '/tools/image-generation',
  JOIN_CLIPS: '/tools/join-clips',
  EDIT_VIDEO: '/tools/edit-video',
  EDIT_IMAGES: '/tools/edit-images',
  CHARACTER_ANIMATE: '/tools/character-animate',
  TRAINING_DATA_HELPER: '/tools/training-data-helper',
} as const;

/** Build a shot-specific URL for the travel tool (navigates to a particular shot) */
export function travelShotUrl(shotId: string): string {
  return `${TOOL_ROUTES.TRAVEL_BETWEEN_IMAGES}#${shotId}`;
}

