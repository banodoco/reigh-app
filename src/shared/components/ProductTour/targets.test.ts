import { describe, expect, it } from 'vitest';
import { TOUR_SELECTORS, TOUR_TARGETS } from './targets';

describe('product tour targets', () => {
  it('defines stable target ids', () => {
    expect(TOUR_TARGETS.GENERATIONS_PANE_TAB).toBe('generations-pane-tab');
    expect(TOUR_TARGETS.TIMELINE).toBe('timeline');
    expect(TOUR_TARGETS.MEDIA_GALLERY_ITEM).toBe('media-gallery-item');
  });

  it('maps selectors to data-tour attributes', () => {
    expect(TOUR_SELECTORS.body).toBe('body');
    expect(TOUR_SELECTORS.generationsPaneTab).toBe('[data-tour="generations-pane-tab"]');
    expect(TOUR_SELECTORS.timeline).toBe('[data-tour="timeline"]');
    expect(TOUR_SELECTORS.mediaGalleryItem).toBe('[data-tour="media-gallery-item"]');
  });
});
