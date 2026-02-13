import { describe, it, expect } from 'vitest';
import { transformExternalGeneration } from '../external-generation-utils';

describe('transformExternalGeneration', () => {
  const baseData = {
    id: 'gen-123',
    location: 'https://example.com/image.png',
    thumbnail_url: 'https://example.com/thumb.png',
    type: 'image',
    created_at: '2025-01-01T00:00:00Z',
    params: { prompt: 'a cat' },
    starred: true,
    based_on: 'gen-parent',
  };

  it('transforms basic generation data correctly', () => {
    const result = transformExternalGeneration(baseData, []);

    expect(result.id).toBe('gen-123');
    expect(result.generation_id).toBe('gen-123');
    expect(result.shotImageEntryId).toBe('gen-123');
    expect(result.imageUrl).toBe('https://example.com/image.png');
    expect(result.thumbUrl).toBe('https://example.com/thumb.png');
    expect(result.location).toBe('https://example.com/image.png');
    expect(result.type).toBe('image');
    expect(result.createdAt).toBe('2025-01-01T00:00:00Z');
    expect(result.starred).toBe(true);
    expect(result.based_on).toBe('gen-parent');
  });

  it('uses location as thumbUrl fallback when thumbnail_url is null', () => {
    const data = { ...baseData, thumbnail_url: null };
    const result = transformExternalGeneration(data, []);
    expect(result.thumbUrl).toBe('https://example.com/image.png');
  });

  it('includes shot association data when shot_generations exist', () => {
    const shotGens = [
      { shot_id: 'shot-1', timeline_frame: 42 },
    ];

    const result = transformExternalGeneration(baseData, shotGens);

    expect(result.timeline_frame).toBe(42);
    expect((result as Record<string, unknown>).shot_id).toBe('shot-1');
    expect((result as Record<string, unknown>).position).toBe(42);
    expect((result as Record<string, unknown>).all_shot_associations).toEqual([
      { shot_id: 'shot-1', timeline_frame: 42, position: 42 },
    ]);
  });

  it('handles multiple shot associations', () => {
    const shotGens = [
      { shot_id: 'shot-1', timeline_frame: 10 },
      { shot_id: 'shot-2', timeline_frame: 20 },
    ];

    const result = transformExternalGeneration(baseData, shotGens);

    // Uses first shot_generation for primary fields
    expect(result.timeline_frame).toBe(10);
    expect((result as Record<string, unknown>).all_shot_associations).toHaveLength(2);
  });

  it('handles null timeline_frame in shot_generations', () => {
    const shotGens = [{ shot_id: 'shot-1', timeline_frame: null }];
    const result = transformExternalGeneration(baseData, shotGens);
    expect(result.timeline_frame).toBeNull();
  });

  it('defaults starred to false when null', () => {
    const data = { ...baseData, starred: null };
    const result = transformExternalGeneration(data, []);
    expect(result.starred).toBe(false);
  });

  it('handles null params by setting empty objects', () => {
    const data = { ...baseData, params: null };
    const result = transformExternalGeneration(data, []);
    expect(result.metadata).toEqual({});
    expect(result.params).toEqual({});
  });

  it('sets metadata from params when params is a valid object', () => {
    const result = transformExternalGeneration(baseData, []);
    expect(result.metadata).toEqual({ prompt: 'a cat' });
  });

  it('handles array params gracefully (sets metadata to empty object)', () => {
    const data = { ...baseData, params: ['not', 'an', 'object'] as unknown as Record<string, unknown> };
    const result = transformExternalGeneration(data, []);
    expect(result.metadata).toEqual({});
  });

  it('does not include shot_id and position when no shot_generations', () => {
    const result = transformExternalGeneration(baseData, []);
    // These keys should not be spread onto the result
    expect(result).not.toHaveProperty('shot_id');
    expect(result).not.toHaveProperty('position');
  });
});
