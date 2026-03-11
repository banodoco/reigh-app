import { describe, it, expect } from 'vitest';
import { STORAGE_KEYS } from '../storage/storageKeys';

describe('STORAGE_KEYS', () => {
  describe('LAST_ACTIVE_SHOT_SETTINGS', () => {
    it('returns project-scoped key', () => {
      expect(STORAGE_KEYS.LAST_ACTIVE_SHOT_SETTINGS('proj-123')).toBe('last-active-shot-settings-proj-123');
    });

    it('handles empty string project ID', () => {
      expect(STORAGE_KEYS.LAST_ACTIVE_SHOT_SETTINGS('')).toBe('last-active-shot-settings-');
    });
  });

  describe('LAST_ACTIVE_UI_SETTINGS', () => {
    it('returns project-scoped key', () => {
      expect(STORAGE_KEYS.LAST_ACTIVE_UI_SETTINGS('proj-789')).toBe('last-active-ui-settings-proj-789');
    });
  });

  describe('global keys', () => {
    it('GLOBAL_LAST_ACTIVE_SHOT_SETTINGS is a static string', () => {
      expect(STORAGE_KEYS.GLOBAL_LAST_ACTIVE_SHOT_SETTINGS).toBe('global-last-active-shot-settings');
    });

  });

  describe('APPLY_PROJECT_DEFAULTS', () => {
    it('returns shot-scoped key', () => {
      expect(STORAGE_KEYS.APPLY_PROJECT_DEFAULTS('shot-abc')).toBe('apply-project-defaults-shot-abc');
    });
  });

  describe('join segments keys', () => {
    it('LAST_ACTIVE_JOIN_SEGMENTS_SETTINGS returns project-scoped key', () => {
      expect(STORAGE_KEYS.LAST_ACTIVE_JOIN_SEGMENTS_SETTINGS('proj-123')).toBe('last-active-join-segments-proj-123');
    });

    it('GLOBAL_LAST_ACTIVE_JOIN_SEGMENTS_SETTINGS is a static string', () => {
      expect(STORAGE_KEYS.GLOBAL_LAST_ACTIVE_JOIN_SEGMENTS_SETTINGS).toBe('global-last-active-join-segments');
    });

    it('APPLY_JOIN_SEGMENTS_DEFAULTS returns shot-scoped key', () => {
      expect(STORAGE_KEYS.APPLY_JOIN_SEGMENTS_DEFAULTS('shot-def')).toBe('apply-join-segments-defaults-shot-def');
    });
  });
});
