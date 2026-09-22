import { describe, expect, it } from 'vitest';
import { resolveVariantThumbnailUrl } from '../variantThumbnail';

const generation = {
  location: '/api/runtime/v1/objects/sha256:primary',
  imageUrl: '/api/runtime/v1/objects/sha256:primary',
  thumbUrl: '/api/runtime/v1/objects/sha256:poster',
};

describe('resolveVariantThumbnailUrl', () => {
  it('uses a thumbnail explicitly attached to the active variant', () => {
    expect(resolveVariantThumbnailUrl({ is_primary: false, thumbnail_url: '/variant-poster' }, generation))
      .toBe('/variant-poster');
  });

  it('does not reuse the generation poster for a different nonprimary object', () => {
    expect(resolveVariantThumbnailUrl({ is_primary: false, location: '/api/runtime/v1/objects/sha256:alternate' }, generation))
      .toBeUndefined();
  });

  it('allows the generation poster when the active object is the generation source', () => {
    expect(resolveVariantThumbnailUrl({ is_primary: false, location: generation.location }, generation))
      .toBe(generation.thumbUrl);
  });
});
