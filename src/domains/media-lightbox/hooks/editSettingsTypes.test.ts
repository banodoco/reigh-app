import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ADVANCED_SETTINGS,
  DEFAULT_EDIT_SETTINGS,
  DEFAULT_ENHANCE_SETTINGS,
  DEFAULT_LAST_USED,
  SYNCED_SETTING_KEYS,
} from '../model/editSettingsTypes';

describe('editSettingsTypes', () => {
  it('keeps stable defaults for advanced and enhance settings', () => {
    expect(DEFAULT_ADVANCED_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_ADVANCED_SETTINGS.num_inference_steps).toBe(12);
    expect(DEFAULT_ENHANCE_SETTINGS.enableUpscale).toBe(true);
    expect(DEFAULT_ENHANCE_SETTINGS.outputQuality).toBe('maximum');
  });

  it('includes synced keys in default settings objects', () => {
    for (const key of SYNCED_SETTING_KEYS) {
      expect(DEFAULT_EDIT_SETTINGS).toHaveProperty(key);
      expect(DEFAULT_LAST_USED).toHaveProperty(key);
    }
  });
});
