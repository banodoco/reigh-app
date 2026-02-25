import { TOOL_IDS } from '@/shared/lib/toolIds';

/**
 * Explicit mapping where tool IDs are intentionally valid settings IDs.
 * Keeping this mapping separate from tool identity avoids accidental coupling.
 */
export const TOOL_SETTINGS_IDS = {
  TRAVEL_BETWEEN_IMAGES: TOOL_IDS.TRAVEL_BETWEEN_IMAGES,
  IMAGE_GENERATION: TOOL_IDS.IMAGE_GENERATION,
  JOIN_CLIPS: TOOL_IDS.JOIN_CLIPS,
  EDIT_VIDEO: TOOL_IDS.EDIT_VIDEO,
  EDIT_IMAGES: TOOL_IDS.EDIT_IMAGES,
  CHARACTER_ANIMATE: TOOL_IDS.CHARACTER_ANIMATE,
  TRAINING_DATA_HELPER: TOOL_IDS.TRAINING_DATA_HELPER,
} as const;

/**
 * Known settings keys routed through `useToolSettings`.
 * Keep this list in sync with settings consumers to catch typos early.
 */
export const SETTINGS_IDS = {
  ...TOOL_SETTINGS_IDS,
  USER_PREFERENCES: 'user-preferences',
  USER_UI_STATE: 'ui',
  PROJECT_IMAGE_SETTINGS: 'project-image-settings',
  PROJECT_LORAS: 'project-loras',
  TRAVEL_UI_STATE: 'travel-ui-state',
  TRAVEL_SELECTED_OUTPUT: 'travel-selected-output',
  TRAVEL_AUDIO: 'travel-audio',
  JOIN_SEGMENTS: 'join-segments',
  SHOTS_PANE_UI_STATE: 'shots-pane-ui-state',
  IMAGE_GEN_PROMPTS: 'image-gen-prompts',
  IMAGE_GEN_PAGE_PREFS: 'image-gen-page-prefs',
  UPLOAD: 'upload',
  TRAVEL_STRUCTURE_VIDEO: 'travel-structure-video',
  GENERATIONS_PANE: 'generations-pane',
  LAST_AFFECTED_SHOT: 'last-affected-shot',
  LIGHTBOX_EDIT: 'lightbox-edit',
  EDIT_IMAGES_UI: 'edit-images-ui',
  EDIT_VIDEO_UI: 'edit-video-ui',
} as const;

export type SettingsId = (typeof SETTINGS_IDS)[keyof typeof SETTINGS_IDS];

const SETTINGS_ID_SET = new Set<SettingsId>(Object.values(SETTINGS_IDS));

export function isKnownSettingsId(value: unknown): value is SettingsId {
  return typeof value === 'string' && SETTINGS_ID_SET.has(value as SettingsId);
}
