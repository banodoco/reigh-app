export { PRIORITY } from './types';

// Legacy alias (used by useAdjacentPagePreloader)
export { PRIORITY as PRIORITY_VALUES } from './types';

export { preloadingService } from './service';

export {
  hasLoadedImage,
  markImageLoaded,
  setImageLoadStatus,
  clearLoadedImages,
  getImageElement,
} from './tracker';
