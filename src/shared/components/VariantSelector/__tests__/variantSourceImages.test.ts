// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';
import { hasDifferentSourceImages } from '../variantSourceImages';

const baseVariant: GenerationVariant = {
  id: 'variant-1',
  generation_id: 'generation-1',
  location: 'generations/path.mp4',
  thumbnail_url: null,
  params: null,
  is_primary: false,
  starred: false,
  variant_type: null,
  name: null,
  created_at: '2026-02-16T00:00:00.000Z',
  viewed_at: null,
};

describe('hasDifferentSourceImages', () => {
  it('returns true when generation IDs differ', () => {
    const variant = {
      ...baseVariant,
      params: {
        start_image_generation_id: 'gen-a',
        input_image_paths_resolved: ['generations/a.png'],
      },
    };

    expect(
      hasDifferentSourceImages(variant, {
        startGenerationId: 'gen-b',
        startUrl: 'generations/a.png',
      }),
    ).toBe(true);
  });

  it('normalizes signed and public storage URLs for comparison', () => {
    const variant = {
      ...baseVariant,
      params: {
        input_image_paths_resolved: [
          'https://example.com/storage/v1/object/public/generations/a.png?token=one',
        ],
      },
    };

    expect(
      hasDifferentSourceImages(variant, {
        startUrl: 'https://example.com/storage/v1/object/sign/generations/a.png?token=two',
      }),
    ).toBe(false);
  });
});
