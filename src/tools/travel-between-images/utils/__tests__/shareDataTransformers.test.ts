import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/lib/mediaTypeHelpers', () => ({
  getGenerationId: (gen: unknown) => {
    if (!gen || typeof gen !== 'object') return null;
    const record = gen as Record<string, unknown>;
    if (typeof record.generation_id === 'string') return record.generation_id;
    if (typeof record.id === 'string') return record.id;
    return null;
  },
}));

import {
  transformGenerationToParentRow,
  calculateColumnsForDevice,
  extractStructureState,
} from '../shareDataTransformers';

describe('transformGenerationToParentRow', () => {
  it('returns null for null input', () => {
    expect(transformGenerationToParentRow(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(transformGenerationToParentRow(undefined)).toBeNull();
  });

  it('transforms generation with id', () => {
    const gen = { id: 'gen-1', location: '/path/video.mp4', created_at: '2025-01-01' };
    const result = transformGenerationToParentRow(gen);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('gen-1');
    expect(result!.type).toBe('video');
    expect(result!.location).toBe('/path/video.mp4');
  });

  it('uses generation_id when available', () => {
    const gen = { id: 'var-1', generation_id: 'gen-parent', location: '/path.mp4' };
    const result = transformGenerationToParentRow(gen);
    expect(result!.generation_id).toBe('gen-parent');
  });

  it('maps location to imageUrl', () => {
    const gen = { id: 'gen-1', location: '/video/path.mp4' };
    const result = transformGenerationToParentRow(gen);
    expect((result as { imageUrl?: string } | null)?.imageUrl).toBe('/video/path.mp4');
  });

  it('maps thumbUrl from thumbnail_url', () => {
    const gen = { id: 'gen-1', thumbnail_url: '/thumb.jpg' };
    const result = transformGenerationToParentRow(gen);
    expect((result as { thumbUrl?: string } | null)?.thumbUrl).toBe('/thumb.jpg');
  });

  it('normalizes created_at onto createdAt', () => {
    const gen = { id: 'gen-1', created_at: '2025-01-01T00:00:00Z' };
    const result = transformGenerationToParentRow(gen);
    expect(result?.createdAt).toBe('2025-01-01T00:00:00Z');
    expect(result).not.toHaveProperty('created_at');
  });
});

describe('calculateColumnsForDevice', () => {
  it('returns 2 for values <= 2', () => {
    expect(calculateColumnsForDevice(1)).toBe(2);
    expect(calculateColumnsForDevice(2)).toBe(2);
  });

  it('returns 3 for value 3', () => {
    expect(calculateColumnsForDevice(3)).toBe(3);
  });

  it('returns 4 for value 4', () => {
    expect(calculateColumnsForDevice(4)).toBe(4);
  });

  it('returns 6 for values >= 5', () => {
    expect(calculateColumnsForDevice(5)).toBe(6);
    expect(calculateColumnsForDevice(6)).toBe(6);
    expect(calculateColumnsForDevice(10)).toBe(6);
  });
});

describe('extractStructureState().structureVideos', () => {
  it('returns empty array for null settings', () => {
    expect(extractStructureState(null).structureVideos).toEqual([]);
  });

  it('returns empty array for undefined settings', () => {
    expect(extractStructureState(undefined).structureVideos).toEqual([]);
  });

  it('returns empty array for settings with no structure video data', () => {
    expect(extractStructureState({}).structureVideos).toEqual([]);
  });

  it('prefers array format (structureVideos) when present', () => {
    const settings = {
      structureVideos: [
        { path: '/v1.mp4', startFrame: 0, endFrame: 100, treatment: 'adjust', motionStrength: 1.0, structureType: 'uni3c', metadata: null },
      ],
      structureVideo: { path: '/legacy.mp4' },
    };

    const result = extractStructureState(settings).structureVideos;
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/v1.mp4');
  });

  it('falls back to single video format', () => {
    const settings = {
      structureVideo: {
        path: '/legacy.mp4',
        startFrame: 10,
        endFrame: 200,
        treatment: 'clip',
        motionStrength: 0.8,
        structureType: 'flow',
        metadata: { test: true },
      },
    };

    const result = extractStructureState(settings).structureVideos;
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/legacy.mp4');
    expect(result[0].start_frame).toBe(10);
    expect(result[0].end_frame).toBe(200);
    expect(result[0].treatment).toBe('clip');
  });

  it('uses defaults for missing single video fields', () => {
    const settings = {
      structureVideo: { path: '/v.mp4' },
    };

    const result = extractStructureState(settings).structureVideos;
    expect(result[0].start_frame).toBe(0);
    expect(result[0].end_frame).toBe(300);
    expect(result[0].treatment).toBe('adjust');
  });

  it('returns empty array when structureVideo has no path', () => {
    const settings = { structureVideo: { motionStrength: 1.0 } };
    expect(extractStructureState(settings).structureVideos).toEqual([]);
  });

  it('returns empty array when structureVideos is empty array', () => {
    const settings = { structureVideos: [] };
    expect(extractStructureState(settings).structureVideos).toEqual([]);
  });
});

describe('extractStructureState', () => {
  it('keeps canonical guidance alongside normalized share videos', () => {
    const result = extractStructureState({
      structureVideo: {
        path: '/legacy.mp4',
        motionStrength: 0.75,
        structureType: 'depth',
      },
    });

    expect(result.structureGuidance).toEqual(expect.objectContaining({
      target: 'vace',
      preprocessing: 'depth',
      strength: 0.75,
    }));
    expect(result.structureVideos[0]).toEqual(expect.objectContaining({
      path: '/legacy.mp4',
    }));
  });
});
