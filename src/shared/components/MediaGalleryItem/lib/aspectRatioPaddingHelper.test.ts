import { describe, expect, it } from 'vitest';
import type { GeneratedImageWithMetadata } from '@/shared/components/MediaGallery/types';
import { resolveAspectRatioPadding } from './aspectRatioPaddingHelper';

function buildImage(overrides: Partial<GeneratedImageWithMetadata> = {}): GeneratedImageWithMetadata {
  return {
    id: 'image-1',
    url: 'https://example.com/image-1.png',
    ...overrides,
  };
}

describe('resolveAspectRatioPadding', () => {
  it('uses project aspect ratio when provided and applies clamp bounds', () => {
    const image = buildImage();

    expect(resolveAspectRatioPadding(image, '16:9')).toBe('60%');
    expect(resolveAspectRatioPadding(image, '9:21')).toBe('200%');
  });

  it('falls back to metadata width/height when project aspect ratio is invalid', () => {
    const image = buildImage({
      metadata: {
        width: 200,
        height: 260,
      },
    });

    expect(resolveAspectRatioPadding(image, 'invalid')).toBe('130%');
  });

  it('parses resolution from orchestrator metadata when width/height are missing', () => {
    const image = buildImage({
      metadata: {
        originalParams: {
          orchestrator_details: {
            resolution: '100x150',
          },
        },
      },
    });

    expect(resolveAspectRatioPadding(image)).toBe('150%');
  });

  it('returns 100% when no valid ratio or resolution data exists', () => {
    const withInvalidResolution = buildImage({
      metadata: {
        originalParams: {
          orchestrator_details: {
            resolution: 'bad-data',
          },
        },
      },
    });

    expect(resolveAspectRatioPadding(withInvalidResolution, 'not-a-ratio')).toBe('100%');
    expect(resolveAspectRatioPadding(buildImage())).toBe('100%');
  });
});
