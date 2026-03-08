import type { GalleryConfig, GalleryFilterState } from './types';

const MOBILE_ITEMS_PER_PAGE = 20;
const DESKTOP_ITEMS_PER_PAGE = 12;

export const VIDEO_ONLY_GALLERY_FILTERS: Partial<GalleryFilterState> = {
  mediaType: 'video',
  toolTypeFilter: true,
  shotFilter: 'all',
};

export function getVideoGalleryItemsPerPage(isMobile: boolean): number {
  return isMobile ? MOBILE_ITEMS_PER_PAGE : DESKTOP_ITEMS_PER_PAGE;
}

export function buildVideoResultsGalleryConfig(
  itemCount: number,
  isMobile: boolean,
  overrides: Partial<GalleryConfig> = {}
): Partial<GalleryConfig> {
  const itemsPerPage = getVideoGalleryItemsPerPage(isMobile);
  return {
    reducedSpacing: true,
    hidePagination: itemCount <= itemsPerPage,
    ...overrides,
  };
}
