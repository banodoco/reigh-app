export interface GalleryFilterState {
  mediaType: 'all' | 'image' | 'video';
  shotFilter: string;
  excludePositioned: boolean;
  searchTerm: string;
  starredOnly: boolean;
  toolTypeFilter: boolean;
}

export const DEFAULT_GALLERY_FILTERS: GalleryFilterState = {
  mediaType: 'all',
  shotFilter: 'all',
  excludePositioned: true,
  searchTerm: '',
  starredOnly: false,
  toolTypeFilter: true,
};
