/**
 * Shared tool identifiers and route paths — single source of truth.
 *
 * These live in shared/ so both shared/ hooks/components and tools/
 * can import them without circular dependencies.
 */

/** Tool IDs used as settings keys, params.tool_type values, and query key prefixes. */
export const TOOL_IDS = {
  TRAVEL_BETWEEN_IMAGES: 'travel-between-images',
  IMAGE_GENERATION: 'image-generation',
  JOIN_CLIPS: 'join-clips',
  EDIT_VIDEO: 'edit-video',
  EDIT_IMAGES: 'edit-images',
  CHARACTER_ANIMATE: 'character-animate',
  TRAINING_DATA_HELPER: 'training-data-helper',
} as const;

export const TOOL_ROUTES = {
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
