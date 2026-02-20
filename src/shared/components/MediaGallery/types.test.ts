import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GALLERY_CONFIG,
  DEFAULT_GALLERY_FILTERS,
} from './types';

describe('MediaGallery defaults', () => {
  it('starts with expected filter defaults', () => {
    expect(DEFAULT_GALLERY_FILTERS).toMatchObject({
      mediaType: 'all',
      shotFilter: 'all',
      excludePositioned: true,
      searchTerm: '',
      starredOnly: false,
      toolTypeFilter: true,
    });
  });

  it('enables the expected baseline gallery controls', () => {
    expect(DEFAULT_GALLERY_CONFIG.showDelete).toBe(true);
    expect(DEFAULT_GALLERY_CONFIG.showDownload).toBe(true);
    expect(DEFAULT_GALLERY_CONFIG.showShare).toBe(true);
    expect(DEFAULT_GALLERY_CONFIG.showStar).toBe(true);
    expect(DEFAULT_GALLERY_CONFIG.showAddToShot).toBe(true);
  });

  it('uses conservative UI mode defaults', () => {
    expect(DEFAULT_GALLERY_CONFIG.enableSingleClick).toBe(false);
    expect(DEFAULT_GALLERY_CONFIG.videosAsThumbnails).toBe(false);
    expect(DEFAULT_GALLERY_CONFIG.hidePagination).toBe(false);
  });
});
