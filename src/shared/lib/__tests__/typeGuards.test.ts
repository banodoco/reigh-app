import { describe, it, expect } from 'vitest';
import { hasVideoExtension, isVideoGeneration, isVideoShotGenerations, isVideoAny, isPositioned } from '../typeGuards';
import type { GenerationRow } from '@/domains/generation/types';

describe('hasVideoExtension', () => {
  it('returns false for null/undefined', () => {
    expect(hasVideoExtension(null)).toBe(false);
    expect(hasVideoExtension(undefined)).toBe(false);
  });

  it('detects .mp4', () => {
    expect(hasVideoExtension('video.mp4')).toBe(true);
  });

  it('detects .webm', () => {
    expect(hasVideoExtension('video.webm')).toBe(true);
  });

  it('detects .mov', () => {
    expect(hasVideoExtension('video.mov')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(hasVideoExtension('video.MP4')).toBe(true);
    expect(hasVideoExtension('video.Mp4')).toBe(true);
  });

  it('returns false for image extensions', () => {
    expect(hasVideoExtension('photo.jpg')).toBe(false);
    expect(hasVideoExtension('photo.png')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasVideoExtension('')).toBe(false);
  });
});

describe('isVideoGeneration', () => {
  const makeGen = (overrides: Partial<GenerationRow> = {}): GenerationRow => ({
    id: 'gen-1',
    ...overrides,
  });

  it('detects video type', () => {
    expect(isVideoGeneration(makeGen({ type: 'video' }))).toBe(true);
  });

  it('detects video_travel_output type', () => {
    expect(isVideoGeneration(makeGen({ type: 'video_travel_output' }))).toBe(true);
  });

  it('detects video by location extension', () => {
    expect(isVideoGeneration(makeGen({ location: '/path/to/file.mp4' }))).toBe(true);
  });

  it('detects video by imageUrl extension', () => {
    expect(isVideoGeneration(makeGen({ imageUrl: '/path/to/file.webm' }))).toBe(true);
  });

  it('returns false for image type', () => {
    expect(isVideoGeneration(makeGen({ type: 'image', location: '/path/to/file.png' }))).toBe(false);
  });
});

describe('isVideoShotGenerations', () => {
  it('returns false when generations is null', () => {
    expect(isVideoShotGenerations({ generations: null })).toBe(false);
  });

  it('returns false when generations is undefined', () => {
    expect(isVideoShotGenerations({})).toBe(false);
  });

  it('detects video type in nested generations', () => {
    expect(isVideoShotGenerations({ generations: { type: 'video' } })).toBe(true);
  });

  it('detects video_travel_output in nested generations', () => {
    expect(isVideoShotGenerations({ generations: { type: 'video_travel_output' } })).toBe(true);
  });

  it('detects video by location extension in nested generations', () => {
    expect(isVideoShotGenerations({ generations: { location: '/file.mp4' } })).toBe(true);
  });

  it('returns false for image in nested generations', () => {
    expect(isVideoShotGenerations({ generations: { type: 'image', location: '/file.png' } })).toBe(false);
  });
});

describe('isVideoAny', () => {
  it('detects video by type field', () => {
    expect(isVideoAny({ type: 'video' })).toBe(true);
    expect(isVideoAny({ type: 'video_travel_output' })).toBe(true);
  });

  it('detects video by location extension', () => {
    expect(isVideoAny({ location: '/file.mp4' })).toBe(true);
  });

  it('detects video by imageUrl extension', () => {
    expect(isVideoAny({ imageUrl: '/file.webm' })).toBe(true);
  });

  it('detects video by url extension', () => {
    expect(isVideoAny({ url: '/file.mov' })).toBe(true);
  });

  it('detects video by thumbUrl extension', () => {
    expect(isVideoAny({ thumbUrl: '/file.mp4' })).toBe(true);
  });

  it('detects video in nested .generation', () => {
    expect(isVideoAny({ generation: { type: 'video' } })).toBe(true);
    expect(isVideoAny({ generation: { location: '/file.mp4' } })).toBe(true);
  });

  it('detects video in nested .generations', () => {
    expect(isVideoAny({ generations: { type: 'video' } })).toBe(true);
    expect(isVideoAny({ generations: { location: '/file.mp4' } })).toBe(true);
  });

  it('returns false for non-video items', () => {
    expect(isVideoAny({ type: 'image', location: '/file.png' })).toBe(false);
    expect(isVideoAny({})).toBe(false);
  });
});

describe('isPositioned', () => {
  it('returns false for null timeline_frame', () => {
    expect(isPositioned({ timeline_frame: null })).toBe(false);
  });

  it('returns false for undefined timeline_frame', () => {
    expect(isPositioned({})).toBe(false);
  });

  it('returns false for -1 sentinel', () => {
    expect(isPositioned({ timeline_frame: -1 })).toBe(false);
  });

  it('returns true for 0', () => {
    expect(isPositioned({ timeline_frame: 0 })).toBe(true);
  });

  it('returns true for positive values', () => {
    expect(isPositioned({ timeline_frame: 50 })).toBe(true);
  });
});
