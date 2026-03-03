import { describe, it, expect } from 'vitest';
import { mapShotGenerationToRow } from '../mappers';

describe('mapShotGenerationToRow', () => {
  it('returns null when no generation data exists', () => {
    const result = mapShotGenerationToRow({
      id: 'sg-1',
      timeline_frame: 0,
      metadata: null,
    });
    expect(result).toBeNull();
  });

  it('maps basic generation data correctly', () => {
    const result = mapShotGenerationToRow({
      id: 'sg-1',
      generation_id: 'gen-1',
      timeline_frame: 100,
      metadata: null,
      generations: {
        id: 'gen-1',
        location: 'https://example.com/image.png',
        thumbnail_url: 'https://example.com/thumb.png',
        type: 'image',
        created_at: '2025-01-01T00:00:00Z',
        starred: false,
        name: 'Test Image',
        based_on: null,
        params: { prompt: 'test' },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe('sg-1');
    expect(result!.generation_id).toBe('gen-1');
    expect(result!.location).toBe('https://example.com/image.png');
    expect(result!.thumbUrl).toBe('https://example.com/thumb.png');
    expect(result!.type).toBe('image');
    expect(result!.timeline_frame).toBe(100);
    expect(result!.starred).toBe(false);
    expect(result!.name).toBe('Test Image');
    expect(result!.based_on).toBeNull();
  });

  it('uses primary variant location when available', () => {
    const result = mapShotGenerationToRow({
      id: 'sg-1',
      generation_id: 'gen-1',
      timeline_frame: 50,
      metadata: null,
      generations: {
        id: 'gen-1',
        location: 'https://example.com/original.png',
        thumbnail_url: 'https://example.com/original-thumb.png',
        type: 'image',
        created_at: '2025-01-01T00:00:00Z',
        starred: false,
        name: null,
        based_on: null,
        params: null,
        primary_variant: {
          location: 'https://example.com/variant.png',
          thumbnail_url: 'https://example.com/variant-thumb.png',
        },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.location).toBe('https://example.com/variant.png');
    expect(result!.imageUrl).toBe('https://example.com/variant.png');
    expect(result!.thumbUrl).toBe('https://example.com/variant-thumb.png');
  });

  it('falls back to generation location when primary variant has no location', () => {
    const result = mapShotGenerationToRow({
      id: 'sg-1',
      generation_id: 'gen-1',
      timeline_frame: 0,
      metadata: null,
      generations: {
        id: 'gen-1',
        location: 'https://example.com/original.png',
        thumbnail_url: 'https://example.com/original-thumb.png',
        type: 'image',
        created_at: '2025-01-01T00:00:00Z',
        starred: false,
        name: null,
        based_on: null,
        params: null,
        primary_variant: {
          location: null,
          thumbnail_url: null,
        },
      },
    });

    expect(result!.location).toBe('https://example.com/original.png');
    expect(result!.thumbUrl).toBe('https://example.com/original-thumb.png');
  });

  it('handles the "generation" alias (singular) instead of "generations"', () => {
    const result = mapShotGenerationToRow({
      id: 'sg-1',
      timeline_frame: 0,
      metadata: null,
      generation: {
        id: 'gen-1',
        location: 'https://example.com/image.png',
        thumbnail_url: null,
        type: 'video',
        created_at: '2025-01-01T00:00:00Z',
        starred: true,
        name: null,
        based_on: 'gen-0',
        params: null,
      },
    });

    expect(result).not.toBeNull();
    expect(result!.generation_id).toBe('gen-1');
    expect(result!.type).toBe('video');
    expect(result!.starred).toBe(true);
    expect(result!.based_on).toBe('gen-0');
  });

  it('sets legacy compatibility fields', () => {
    const row = mapShotGenerationToRow({
      id: 'sg-1',
      generation_id: 'gen-1',
      timeline_frame: 100,
      metadata: null,
      generations: {
        id: 'gen-1',
        location: 'https://example.com/image.png',
        thumbnail_url: null,
        type: 'image',
        created_at: '2025-01-01T00:00:00Z',
        starred: false,
        name: null,
        based_on: null,
        params: null,
      },
    });

    expect(row!.shotImageEntryId).toBe('sg-1');
    expect(row!.shot_generation_id).toBe('sg-1');
  });

  it('computes position from timeline_frame', () => {
    const result = mapShotGenerationToRow({
      id: 'sg-1',
      timeline_frame: 200,
      metadata: null,
      generations: {
        id: 'gen-1',
        location: 'https://example.com/image.png',
        thumbnail_url: null,
        type: 'image',
        created_at: '2025-01-01T00:00:00Z',
        starred: false,
        name: null,
        based_on: null,
        params: null,
      },
    });

    // position = Math.floor(timeline_frame / 50) = Math.floor(200 / 50) = 4
    expect(result!.position).toBe(4);
  });

  it('sets position to undefined for null timeline_frame', () => {
    const result = mapShotGenerationToRow({
      id: 'sg-1',
      timeline_frame: null,
      metadata: null,
      generations: {
        id: 'gen-1',
        location: 'https://example.com/image.png',
        thumbnail_url: null,
        type: 'image',
        created_at: '2025-01-01T00:00:00Z',
        starred: false,
        name: null,
        based_on: null,
        params: null,
      },
    });

    expect(result!.position).toBeUndefined();
  });

  it('handles null params gracefully', () => {
    const result = mapShotGenerationToRow({
      id: 'sg-1',
      timeline_frame: 0,
      metadata: null,
      generations: {
        id: 'gen-1',
        location: null,
        thumbnail_url: null,
        type: null,
        created_at: '2025-01-01T00:00:00Z',
        starred: null,
        name: null,
        based_on: null,
        params: null,
      },
    });

    expect(result).not.toBeNull();
    expect(result!.location).toBeFalsy();
    expect(result!.type).toBe('image'); // default
    expect(result!.starred).toBe(false); // null coerced to false
    expect(result!.params).toEqual({});
  });

  it('includes metadata from shot_generations', () => {
    const metadata = { user_positioned: true, frame_spacing: 50 };
    const result = mapShotGenerationToRow({
      id: 'sg-1',
      timeline_frame: 0,
      metadata,
      generations: {
        id: 'gen-1',
        location: 'https://example.com/image.png',
        thumbnail_url: null,
        type: 'image',
        created_at: '2025-01-01T00:00:00Z',
        starred: false,
        name: null,
        based_on: null,
        params: null,
      },
    });

    expect(result!.metadata).toEqual(metadata);
  });

  it('uses location as thumbnail fallback when thumbnail_url is null', () => {
    const result = mapShotGenerationToRow({
      id: 'sg-1',
      timeline_frame: 0,
      metadata: null,
      generations: {
        id: 'gen-1',
        location: 'https://example.com/image.png',
        thumbnail_url: null,
        type: 'image',
        created_at: '2025-01-01T00:00:00Z',
        starred: false,
        name: null,
        based_on: null,
        params: null,
      },
    });

    expect(result!.thumbUrl).toBe('https://example.com/image.png');
  });

  it('includes primary_variant_id when present', () => {
    const result = mapShotGenerationToRow({
      id: 'sg-1',
      timeline_frame: 0,
      metadata: null,
      generations: {
        id: 'gen-1',
        location: 'https://example.com/image.png',
        thumbnail_url: null,
        type: 'image',
        created_at: '2025-01-01T00:00:00Z',
        starred: false,
        name: null,
        based_on: null,
        params: null,
        primary_variant_id: 'variant-123',
      },
    });

    expect(result!.primary_variant_id).toBe('variant-123');
  });
});
