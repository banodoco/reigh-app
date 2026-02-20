import type { GeneratedImageWithMetadata, DisplayableMetadata } from "../MediaGallery/types";
import type { AddToShotHandler } from '@/shared/types/imageHandlers';

export interface MediaGalleryItemProps {
  image: GeneratedImageWithMetadata;
  index: number;
  isDeleting?: string | boolean | null;
  onDelete?: (id: string) => void;
  onApplySettings?: (metadata: DisplayableMetadata) => void;
  onOpenLightbox: (image: GeneratedImageWithMetadata, autoEnterEditMode?: boolean) => void;
  onAddToLastShot?: AddToShotHandler;
  onAddToLastShotWithoutPosition?: AddToShotHandler;
  onDownloadImage: (rawUrl: string, filename: string, imageId?: string, isVideo?: boolean, originalContentType?: string) => void;
  onToggleStar?: (id: string, starred: boolean) => void;
  selectedShotIdLocal: string;
  simplifiedShotOptions: { id: string; name: string }[];
  showTickForImageId: string | null;
  onShowTick: (imageId: string) => void;
  showTickForSecondaryImageId?: string | null;
  onShowSecondaryTick?: (imageId: string) => void;
  optimisticUnpositionedIds?: Set<string>;
  optimisticPositionedIds?: Set<string>;
  optimisticDeletedIds?: Set<string>;
  onOptimisticUnpositioned?: (imageId: string, shotId: string) => void;
  onOptimisticPositioned?: (imageId: string, shotId: string) => void;
  addingToShotImageId: string | null;
  setAddingToShotImageId: (id: string | null) => void;
  addingToShotWithoutPositionImageId?: string | null;
  setAddingToShotWithoutPositionImageId?: (id: string | null) => void;
  downloadingImageId: string | null;
  isMobile: boolean;
  mobileActiveImageId: string | null;
  mobilePopoverOpenImageId: string | null;
  onMobileTap: (image: GeneratedImageWithMetadata) => void;
  setMobilePopoverOpenImageId: (id: string | null) => void;
  setSelectedShotIdLocal: (id: string) => void;
  setLastAffectedShotId: (id: string) => void;
  // TODO: type properly — React Query mutation with complex generic types
  toggleStarMutation: { mutate: (vars: { id: string; starred: boolean }, options?: { onSettled?: () => void }) => void };
  // Progressive loading props
  shouldLoad?: boolean;
  isPriority?: boolean;
  isGalleryLoading?: boolean;
  // Shot creation props
  onCreateShot?: (shotName: string, files: File[]) => Promise<void>;
  /** ID of the shot currently being viewed (hides navigation buttons) */
  currentViewingShotId?: string;
  // Project dimensions
  projectAspectRatio?: string;
  showShare?: boolean;
  showDelete?: boolean;
  showDownload?: boolean;
  showEdit?: boolean;
  showStar?: boolean;
  showAddToShot?: boolean;
  enableSingleClick?: boolean;
  onImageClick?: (image: GeneratedImageWithMetadata) => void;
  /** When true, videos are rendered as static thumbnail images instead of HoverScrubVideo for better performance */
  videosAsThumbnails?: boolean;
  /** Optional data-tour attribute for product tour targeting */
  dataTour?: string;
  /** Callback when the image has fully loaded and is visible */
  onImageLoaded?: (imageId: string) => void;
}

// Re-export types that are used by sub-components
export type { GeneratedImageWithMetadata, DisplayableMetadata } from "../MediaGallery/types";
