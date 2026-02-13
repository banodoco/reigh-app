import { describe, it, expect } from 'vitest';
import { resolveGenerationMode, extractToolSettings } from '../settingsResolution';

describe('resolveGenerationMode', () => {
  it('returns "timeline" as default when no sources', () => {
    expect(resolveGenerationMode({})).toBe('timeline');
  });

  it('resolves from defaults', () => {
    expect(resolveGenerationMode({ defaults: { generationMode: 'batch' } })).toBe('batch');
  });

  it('resolves from user settings', () => {
    expect(resolveGenerationMode({ user: { generationMode: 'by-pair' } })).toBe('by-pair');
  });

  it('project overrides user', () => {
    expect(resolveGenerationMode({
      user: { generationMode: 'batch' },
      project: { generationMode: 'timeline' },
    })).toBe('timeline');
  });

  it('shot overrides project', () => {
    expect(resolveGenerationMode({
      project: { generationMode: 'batch' },
      shot: { generationMode: 'by-pair' },
    })).toBe('by-pair');
  });

  it('full priority chain: shot > project > user > defaults', () => {
    expect(resolveGenerationMode({
      defaults: { generationMode: 'batch' },
      user: { generationMode: 'timeline' },
      project: { generationMode: 'by-pair' },
      shot: { generationMode: 'batch' },
    })).toBe('batch');
  });

  it('skips undefined values in higher-priority sources', () => {
    expect(resolveGenerationMode({
      user: { generationMode: 'batch' },
      project: { someOtherSetting: 'value' },
    })).toBe('batch');
  });

  it('normalizes unknown values to "timeline"', () => {
    expect(resolveGenerationMode({
      defaults: { generationMode: 'unknown-mode' },
    })).toBe('timeline');
  });
});

describe('extractToolSettings', () => {
  it('extracts tool settings by ID', () => {
    const settings = { 'image-gen': { quality: 'high' }, 'video-gen': { fps: 30 } };
    expect(extractToolSettings(settings, 'image-gen')).toEqual({ quality: 'high' });
  });

  it('returns empty object for missing tool', () => {
    const settings = { 'image-gen': { quality: 'high' } };
    expect(extractToolSettings(settings, 'video-gen')).toEqual({});
  });

  it('returns empty object for null settings', () => {
    expect(extractToolSettings(null, 'any')).toEqual({});
  });

  it('returns empty object for undefined settings', () => {
    expect(extractToolSettings(undefined, 'any')).toEqual({});
  });
});
