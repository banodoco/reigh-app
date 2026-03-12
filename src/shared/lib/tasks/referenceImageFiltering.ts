import { ReferenceMode, ReferenceSettingsInput } from './families/imageGeneration/types';

/**
 * Filter reference settings based on the selected reference mode.
 * This ensures only relevant settings are passed to the backend based on what mode is active.
 */
export function filterReferenceSettingsByMode(
  referenceMode: ReferenceMode | undefined,
  settings: ReferenceSettingsInput,
): Partial<ReferenceSettingsInput> {
  if (!referenceMode || referenceMode === 'custom') {
    return settings;
  }

  const filtered: Partial<ReferenceSettingsInput> = {};

  switch (referenceMode) {
    case 'style':
      if (settings.style_reference_strength !== undefined) {
        filtered.style_reference_strength = settings.style_reference_strength;
      }
      break;
    case 'subject':
      filtered.style_reference_strength = 1.1;
      filtered.subject_strength = 0.5;
      if (settings.subject_description !== undefined && settings.subject_description.trim()) {
        filtered.subject_description = settings.subject_description;
      }
      break;
    case 'style-character':
      if (settings.style_reference_strength !== undefined) {
        filtered.style_reference_strength = settings.style_reference_strength;
      }
      if (settings.subject_strength !== undefined) {
        filtered.subject_strength = settings.subject_strength;
      }
      if (settings.subject_description !== undefined && settings.subject_description.trim()) {
        filtered.subject_description = settings.subject_description;
      }
      break;
    case 'scene':
      filtered.style_reference_strength = 1.1;
      filtered.in_this_scene = true;
      filtered.in_this_scene_strength = 0.5;
      break;
  }

  return filtered;
}
