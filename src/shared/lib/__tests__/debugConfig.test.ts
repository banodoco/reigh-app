import { describe, it, expect, beforeEach } from 'vitest';
import { debugConfig } from '../debugConfig';

describe('debugConfig', () => {
  beforeEach(() => {
    // Reset to a known state before each test
    debugConfig.disableAll();
  });

  describe('isEnabled / enable / disable', () => {
    it('returns false for disabled categories', () => {
      expect(debugConfig.isEnabled('reactProfiler')).toBe(false);
      expect(debugConfig.isEnabled('dragDebug')).toBe(false);
    });

    it('enables a specific category', () => {
      debugConfig.enable('dragDebug');
      expect(debugConfig.isEnabled('dragDebug')).toBe(true);
    });

    it('disables a specific category', () => {
      debugConfig.enable('dragDebug');
      debugConfig.disable('dragDebug');
      expect(debugConfig.isEnabled('dragDebug')).toBe(false);
    });

    it('enable does not affect other categories', () => {
      debugConfig.enable('videoDebug');
      expect(debugConfig.isEnabled('videoDebug')).toBe(true);
      expect(debugConfig.isEnabled('dragDebug')).toBe(false);
    });
  });

  describe('enableAll / disableAll', () => {
    it('enableAll turns on all categories', () => {
      debugConfig.enableAll();

      const config = debugConfig.getConfig();
      for (const key of Object.keys(config)) {
        expect(config[key as keyof typeof config]).toBe(true);
      }
    });

    it('disableAll turns off all categories', () => {
      debugConfig.enableAll();
      debugConfig.disableAll();

      const config = debugConfig.getConfig();
      for (const key of Object.keys(config)) {
        expect(config[key as keyof typeof config]).toBe(false);
      }
    });
  });

  describe('setQuietMode', () => {
    it('disables noisy categories', () => {
      debugConfig.enableAll();
      debugConfig.setQuietMode();

      expect(debugConfig.isEnabled('reactProfiler')).toBe(false);
      expect(debugConfig.isEnabled('renderLogging')).toBe(false);
      expect(debugConfig.isEnabled('progressiveImage')).toBe(false);
      expect(debugConfig.isEnabled('imageLoading')).toBe(false);
      expect(debugConfig.isEnabled('shotImageDebug')).toBe(false);
      expect(debugConfig.isEnabled('autoplayDebugger')).toBe(false);
      expect(debugConfig.isEnabled('dragDebug')).toBe(false);
      expect(debugConfig.isEnabled('skeletonDebug')).toBe(false);
      expect(debugConfig.isEnabled('videoDebug')).toBe(false);
    });

    it('preserves categories not listed in quiet mode (e.g. realtimeDebug)', () => {
      debugConfig.enableAll();
      debugConfig.setQuietMode();

      // realtimeDebug and reconnectionDebug are NOT overridden in setQuietMode
      expect(debugConfig.isEnabled('realtimeDebug')).toBe(true);
      expect(debugConfig.isEnabled('reconnectionDebug')).toBe(true);
      expect(debugConfig.isEnabled('devMode')).toBe(true);
    });
  });

  describe('setDevelopmentMode', () => {
    it('enables development-useful categories', () => {
      debugConfig.disableAll();
      debugConfig.setDevelopmentMode();

      expect(debugConfig.isEnabled('renderLogging')).toBe(true);
      expect(debugConfig.isEnabled('imageLoading')).toBe(true);
      expect(debugConfig.isEnabled('shotImageDebug')).toBe(true);
      expect(debugConfig.isEnabled('tasksPaneDebug')).toBe(true);
      expect(debugConfig.isEnabled('dragDebug')).toBe(true);
      expect(debugConfig.isEnabled('skeletonDebug')).toBe(true);
      expect(debugConfig.isEnabled('videoDebug')).toBe(true);
    });

    it('keeps noisy categories disabled in dev mode', () => {
      debugConfig.disableAll();
      debugConfig.setDevelopmentMode();

      expect(debugConfig.isEnabled('reactProfiler')).toBe(false);
      expect(debugConfig.isEnabled('progressiveImage')).toBe(false);
      expect(debugConfig.isEnabled('autoplayDebugger')).toBe(false);
      expect(debugConfig.isEnabled('galleryPollingDebug')).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('returns a copy of the current config', () => {
      debugConfig.enable('videoDebug');
      const config = debugConfig.getConfig();

      expect(config.videoDebug).toBe(true);

      // Mutating the returned object should not affect internal state
      config.videoDebug = false;
      expect(debugConfig.isEnabled('videoDebug')).toBe(true);
    });

    it('returns all known keys', () => {
      const config = debugConfig.getConfig();
      const expectedKeys = [
        'reactProfiler',
        'renderLogging',
        'progressiveImage',
        'imageLoading',
        'shotImageDebug',
        'autoplayDebugger',
        'tasksPaneDebug',
        'galleryPollingDebug',
        'dragDebug',
        'skeletonDebug',
        'videoDebug',
        'realtimeDebug',
        'reconnectionDebug',
        'devMode',
      ];

      for (const key of expectedKeys) {
        expect(config).toHaveProperty(key);
      }
    });
  });

  describe('status', () => {
    it('logs config state to console without throwing', () => {
      // Just verify it doesn't throw
      expect(() => debugConfig.status()).not.toThrow();
    });
  });
});
