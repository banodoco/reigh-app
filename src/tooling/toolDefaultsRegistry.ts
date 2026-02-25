import { videoTravelSettings } from '@/tools/travel-between-images/settings';
import { imageGenerationSettings } from '@/tools/image-generation/settings';
import { characterAnimateSettings } from '@/tools/character-animate/settings';
import { joinClipsSettings } from '@/shared/lib/joinClipsDefaults';
import { editImagesSettings } from '@/tools/edit-images/settings';
import { editVideoSettings } from '@/shared/settings/config/editVideoDefaults';
import { trainingDataHelperSettings } from '@/tools/training-data-helper/settings';
import { userPreferencesSettings } from '@/shared/settings/userPreferences';

const TOOL_SETTINGS_WITH_DEFAULTS = [
  videoTravelSettings,
  imageGenerationSettings,
  characterAnimateSettings,
  joinClipsSettings,
  editImagesSettings,
  editVideoSettings,
  trainingDataHelperSettings,
  userPreferencesSettings,
] as const;

export const toolDefaultsRegistry: Record<string, unknown> = Object.fromEntries(
  TOOL_SETTINGS_WITH_DEFAULTS.map((toolSettings) => [toolSettings.id, toolSettings.defaults])
);
