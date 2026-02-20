import { describe, expect, it } from 'vitest';
import * as MediaGalleryIndex from './index';

describe('MediaGallery index exports', () => {
  it('exports the MediaGallery entrypoint', () => {
    expect(MediaGalleryIndex).toBeDefined();
    expect(MediaGalleryIndex.MediaGallery).toBeDefined();
  });
});
