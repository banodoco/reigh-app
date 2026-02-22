import { describe, it, expect } from 'vitest';
import { readShotSettings, readSegmentOverrides, writeSegmentOverrides } from '../settingsMigration';
import { DEFAULT_SHOT_VIDEO_SETTINGS } from '@/shared/types/segmentSettings';

describe('readShotSettings', () => {
  it('returns defaults for null/undefined', () => {
    const result = readShotSettings(null);
    expect(result.prompt).toBe(DEFAULT_SHOT_VIDEO_SETTINGS.prompt);
    expect(result.motionMode).toBe(DEFAULT_SHOT_VIDEO_SETTINGS.motionMode);
    expect(result.amountOfMotion).toBe(DEFAULT_SHOT_VIDEO_SETTINGS.amountOfMotion);
  });

  it('reads prompt and negativePrompt', () => {
    const result = readShotSettings({ prompt: 'a cat', negativePrompt: 'blurry' });
    expect(result.prompt).toBe('a cat');
    expect(result.negativePrompt).toBe('blurry');
  });

  it('reads motion settings', () => {
    const result = readShotSettings({ motionMode: 'advanced', amountOfMotion: 75 });
    expect(result.motionMode).toBe('advanced');
    expect(result.amountOfMotion).toBe(75);
  });

  it('normalizes legacy 0-1 motion amounts to 0-100', () => {
    const result = readShotSettings({ amountOfMotion: 0.5 });
    expect(result.amountOfMotion).toBe(50);
  });

  it('preserves 0-100 scale motion amounts', () => {
    const result = readShotSettings({ amountOfMotion: 80 });
    expect(result.amountOfMotion).toBe(80);
  });

  it('migrates LoRA format', () => {
    const result = readShotSettings({
      loras: [
        { id: 'lora-1', name: 'LoRA 1', path: '/path', strength: 0.8 },
      ],
    });
    expect(result.loras).toHaveLength(1);
    expect(result.loras![0].id).toBe('lora-1');
    expect(result.loras![0].strength).toBe(0.8);
  });

  it('returns empty loras array for null', () => {
    const result = readShotSettings({ loras: null });
    expect(result.loras).toEqual([]);
  });

  it('reads batch-specific settings', () => {
    const result = readShotSettings({
      batchVideoFrames: 81,
      textBeforePrompts: 'prefix:',
      enhancePrompt: true,
    });
    expect(result.batchVideoFrames).toBe(81);
    expect(result.textBeforePrompts).toBe('prefix:');
    expect(result.enhancePrompt).toBe(true);
  });

  it('reads seed settings', () => {
    const result = readShotSettings({ randomSeed: false, seed: 42 });
    expect(result.randomSeed).toBe(false);
    expect(result.seed).toBe(42);
  });
});

describe('readSegmentOverrides', () => {
  it('returns empty overrides for null/undefined', () => {
    expect(readSegmentOverrides(null)).toEqual({});
    expect(readSegmentOverrides(undefined)).toEqual({});
  });

  it('reads prompt from segmentOverrides', () => {
    const result = readSegmentOverrides({
      segmentOverrides: { prompt: 'segment prompt' },
    });
    expect(result.prompt).toBe('segment prompt');
  });

  it('preserves empty strings (explicit empty vs no override)', () => {
    const result = readSegmentOverrides({
      segmentOverrides: { prompt: '' },
    });
    expect(result.prompt).toBe('');
  });

  it('reads motion settings with normalization', () => {
    const result = readSegmentOverrides({
      segmentOverrides: { amountOfMotion: 0.7 },
    });
    expect(result.amountOfMotion).toBe(70); // 0.7 * 100
  });

  it('reads LoRA overrides with migration', () => {
    const result = readSegmentOverrides({
      segmentOverrides: {
        loras: [{ id: 'l1', name: 'n1', path: 'p1', strength: 0.5 }],
      },
    });
    expect(result.loras).toHaveLength(1);
    expect(result.loras![0].strength).toBe(0.5);
  });

  it('preserves empty loras array (explicit no loras)', () => {
    const result = readSegmentOverrides({
      segmentOverrides: { loras: [] },
    });
    expect(result.loras).toEqual([]);
  });

  it('ignores non-array loras', () => {
    const result = readSegmentOverrides({
      segmentOverrides: { loras: 'not-an-array' },
    });
    expect(result.loras).toBeUndefined();
  });

  it('only includes fields present in segmentOverrides', () => {
    const result = readSegmentOverrides({
      segmentOverrides: { numFrames: 61 },
    });
    expect(result.numFrames).toBe(61);
    expect(result.prompt).toBeUndefined();
    expect(result.motionMode).toBeUndefined();
  });

  it('reads structure video overrides', () => {
    const result = readSegmentOverrides({
      segmentOverrides: {
        structureMotionStrength: 0.8,
        structureTreatment: 'adjust',
        structureUni3cEndPercent: 50,
      },
    });
    expect(result.structureMotionStrength).toBe(0.8);
    expect(result.structureTreatment).toBe('adjust');
    expect(result.structureUni3cEndPercent).toBe(50);
  });
});

describe('writeSegmentOverrides', () => {
  it('creates segmentOverrides on empty metadata', () => {
    const result = writeSegmentOverrides(null, { prompt: 'new prompt' });
    expect(result.segmentOverrides).toEqual({ prompt: 'new prompt' });
  });

  it('merges with existing overrides (does not replace)', () => {
    const result = writeSegmentOverrides(
      { segmentOverrides: { prompt: 'old', numFrames: 61 } },
      { prompt: 'new' },
    );
    expect((result.segmentOverrides as unknown).prompt).toBe('new');
    expect((result.segmentOverrides as unknown).numFrames).toBe(61); // preserved
  });

  it('preserves other metadata fields', () => {
    const result = writeSegmentOverrides(
      { otherField: 'keep me', segmentOverrides: {} },
      { prompt: 'test' },
    );
    expect(result.otherField).toBe('keep me');
  });

  it('removes segmentOverrides key when empty', () => {
    // Write empty overrides to a metadata with no existing overrides
    const result = writeSegmentOverrides({ other: 'data' }, {});
    expect(result.segmentOverrides).toBeUndefined();
  });

  it('handles all override field types', () => {
    const overrides = {
      prompt: 'p',
      negativePrompt: 'np',
      motionMode: 'basic' as const,
      amountOfMotion: 50,
      numFrames: 61,
      randomSeed: true,
      seed: 42,
      loras: [],
    };
    const result = writeSegmentOverrides(null, overrides);
    const so = result.segmentOverrides as unknown;
    expect(so.prompt).toBe('p');
    expect(so.negativePrompt).toBe('np');
    expect(so.motionMode).toBe('basic');
    expect(so.amountOfMotion).toBe(50);
    expect(so.numFrames).toBe(61);
    expect(so.randomSeed).toBe(true);
    expect(so.seed).toBe(42);
    expect(so.loras).toEqual([]);
  });
});
