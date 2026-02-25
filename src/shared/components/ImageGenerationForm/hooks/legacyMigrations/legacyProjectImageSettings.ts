import type { ActiveLora } from '@/shared/types/lora';
import type {
  ProjectImageSettings,
  TextToImageModel,
} from '../../types';

export const LEGACY_PROJECT_IMAGE_SETTINGS_SUNSET = {
  owner: 'image-generation',
  removeBy: '2026-05-31',
} as const;

const LEGACY_PROJECT_IMAGE_SETTINGS_FIELDS = [
  'selectedLorasByTextModel',
  'selectedReferenceId',
  'styleReferenceImage',
  'styleReferenceImageOriginal',
  'styleReferenceStrength',
  'subjectStrength',
  'subjectDescription',
  'inThisScene',
] as const;

const LEGACY_PROJECT_IMAGE_SETTINGS_REMOVE_BY_MS = Date.parse(
  `${LEGACY_PROJECT_IMAGE_SETTINGS_SUNSET.removeBy}T00:00:00.000Z`
);

type LegacyProjectImageSettingsField =
  (typeof LEGACY_PROJECT_IMAGE_SETTINGS_FIELDS)[number];

export interface LegacyProjectImageSettings extends Record<string, unknown> {
  selectedLorasByTextModel?: Record<TextToImageModel, ActiveLora[]>;
  selectedReferenceId?: string | null;
  styleReferenceImage?: string | null;
  styleReferenceImageOriginal?: string | null;
  styleReferenceStrength?: number;
  subjectStrength?: number;
  subjectDescription?: string;
  inThisScene?: boolean;
}

export type ProjectImageSettingsInput =
  ProjectImageSettings &
  Partial<LegacyProjectImageSettings>;

export function getLegacyProjectImageSettingsFields(
  settings: ProjectImageSettingsInput | null | undefined
): LegacyProjectImageSettingsField[] {
  if (!settings) {
    return [];
  }

  return LEGACY_PROJECT_IMAGE_SETTINGS_FIELDS.filter(
    (field) => settings[field] !== undefined
  );
}

export function enforceLegacyProjectImageSettingsSunset(
  settings: ProjectImageSettingsInput | null | undefined,
  now: Date = new Date()
): void {
  const activeLegacyFields = getLegacyProjectImageSettingsFields(settings);
  if (activeLegacyFields.length === 0) {
    return;
  }

  if (now.getTime() <= LEGACY_PROJECT_IMAGE_SETTINGS_REMOVE_BY_MS) {
    return;
  }

  throw new Error(
    `project-image-settings legacy fields are past sunset (${LEGACY_PROJECT_IMAGE_SETTINGS_SUNSET.removeBy}): ${activeLegacyFields.join(', ')}`
  );
}
