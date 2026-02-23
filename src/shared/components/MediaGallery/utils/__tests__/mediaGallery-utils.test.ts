import { describe, it, expect } from 'vitest';
import { deriveGalleryInputImages } from '../mediaGallery-utils';

describe('deriveGalleryInputImages', () => {
  it('returns empty array for null task', () => {
    expect(deriveGalleryInputImages(null)).toEqual([]);
  });

  it('returns empty array for undefined task', () => {
    expect(deriveGalleryInputImages(undefined)).toEqual([]);
  });

  it('returns empty array for task with no params', () => {
    expect(deriveGalleryInputImages({})).toEqual([]);
  });

  it('extracts from params.input_images', () => {
    const task = {
      params: {
        input_images: ['https://example.com/img1.png', 'https://example.com/img2.png'],
      },
    };
    expect(deriveGalleryInputImages(task)).toEqual([
      'https://example.com/img1.png',
      'https://example.com/img2.png',
    ]);
  });

  it('strips surrounding quotes from URLs', () => {
    const task = {
      params: {
        input_images: ['"https://example.com/img1.png"', "'https://example.com/img2.png'"],
      },
    };
    expect(deriveGalleryInputImages(task)).toEqual([
      'https://example.com/img1.png',
      'https://example.com/img2.png',
    ]);
  });

  it('extracts from full_orchestrator_payload.input_image_paths_resolved', () => {
    const task = {
      params: {
        full_orchestrator_payload: {
          input_image_paths_resolved: ['https://example.com/resolved.png'],
        },
      },
    };
    expect(deriveGalleryInputImages(task)).toEqual(['https://example.com/resolved.png']);
  });

  it('extracts from top-level params.input_image_paths_resolved', () => {
    const task = {
      params: {
        input_image_paths_resolved: ['https://example.com/top-level.png'],
      },
    };
    expect(deriveGalleryInputImages(task)).toEqual(['https://example.com/top-level.png']);
  });

  it('prefers input_images over other sources', () => {
    const task = {
      params: {
        input_images: ['https://example.com/preferred.png'],
        input_image_paths_resolved: ['https://example.com/fallback.png'],
      },
    };
    expect(deriveGalleryInputImages(task)).toEqual(['https://example.com/preferred.png']);
  });

  it('returns empty array when no recognized image fields exist', () => {
    const task = {
      params: {
        prompt: 'a cat',
        seed: 42,
      },
    };
    expect(deriveGalleryInputImages(task)).toEqual([]);
  });
});
