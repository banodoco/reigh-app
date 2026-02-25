import { describe, expect, it } from 'vitest';
import {
  LEGACY_PROJECT_IMAGE_SETTINGS_SUNSET,
  enforceLegacyProjectImageSettingsSunset,
  getLegacyProjectImageSettingsFields,
  type ProjectImageSettingsInput,
} from './legacyProjectImageSettings';

describe('legacyProjectImageSettings sunset enforcement', () => {
  it('returns no legacy fields for null settings', () => {
    expect(getLegacyProjectImageSettingsFields(null)).toEqual([]);
  });

  it('allows legacy fields before sunset date', () => {
    const settings = {
      selectedReferenceId: 'ref-1',
    } as ProjectImageSettingsInput;

    expect(() => enforceLegacyProjectImageSettingsSunset(settings, new Date('2026-02-24T00:00:00.000Z'))).not.toThrow();
  });

  it('throws when legacy fields remain after sunset date', () => {
    const settings = {
      selectedReferenceId: 'ref-1',
      styleReferenceStrength: 0.5,
    } as ProjectImageSettingsInput;

    expect(() =>
      enforceLegacyProjectImageSettingsSunset(settings, new Date('2026-06-01T00:00:00.000Z'))
    ).toThrow(LEGACY_PROJECT_IMAGE_SETTINGS_SUNSET.removeBy);
  });
});
