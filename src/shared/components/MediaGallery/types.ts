import type { Shot } from "@/types/shots";
import type { AddToShotHandler } from '@/shared/types/imageHandlers';

/**
 * Columns per row can be:
 * - 'auto': Calculate dynamically based on aspect ratio
 * - number: Fixed number of columns
 */
type ColumnsPerRow = 'auto' | number;

// Define types here to avoid circular imports
export interface MetadataLora {
  id: string;
  name: string;
  path: string;
  strength: number;
  previewImageUrl?: string;
}

/** Orchestrator details nested within originalParams */
interface OrchestratorDetails {
  prompt?: string;
  negative_prompt?: string;
  model?: string;
  seed?: number;
  resolution?: string;
  additional_loras?: Record<string, number>;
}

/** Original params from task creation, nested within metadata */
interface OriginalParams {
  orchestrator_details?: OrchestratorDetails;
  model?: string;
  steps?: number;
  hires_scale?: number;
  hires_steps?: number;
  hires_denoise?: number;
  lightning_lora_strength_phase_1?: number;
  lightning_lora_strength_phase_2?: number;
  qwen_endpoint?: string;
  image?: string;
  style_reference_image?: string;
  style_reference_strength?: number;
  subject_strength?: number;
  scene_reference_strength?: number;
  resolution?: string;
}

export interface DisplayableMetadata extends Record<string, unknown> {
  generation_id?: string | null;
  prompt?: string;
  imagesPerPrompt?: number;
  seed?: number;
  width?: number;
  height?: number;
  content_type?: string;
  activeLoras?: MetadataLora[];
  depthStrength?: number;
  softEdgeStrength?: number;
  userProvidedImageUrl?: string | null;
  num_inference_steps?: number;
  guidance_scale?: number;
  scheduler?: string;
  tool_type?: string;
  original_image_filename?: string;
  original_frame_timestamp?: number;
  source_frames?: number;
  original_duration?: number;
  // Properties accessed in SharedMetadataDetails
  originalParams?: OriginalParams;
  model?: string;
  negative_prompt?: string;
  resolution?: string;
  steps?: number;
  hires_scale?: number;
  hires_steps?: number;
  hires_denoise?: number;
  lightning_lora_strength_phase_1?: number;
  lightning_lora_strength_phase_2?: number;
  qwen_endpoint?: string;
  image?: string;
  style_reference_image?: string;
  style_reference_strength?: number;
  subject_strength?: number;
  scene_reference_strength?: number;
}

export interface GeneratedImageWithMetadata {
  id: string;
  /**
   * Canonical generation identity when `id` is a shot-entry ID.
   * Prefer this in cross-shot and task lookup flows.
   */
  generation_id?: string;
  /** Shot entry identity for shot_generations rows. */
  shot_generation_id?: string;
  /** Alias used by some optimistic cache paths; kept for compatibility. */
  shotImageEntryId?: string;
  url: string;
  location?: string;
  thumbUrl?: string;
  /** Stable URL identity (URL without query params) for caching/comparison - tokens change but file doesn't */
  urlIdentity?: string;
  /** Stable thumbnail URL identity for caching/comparison */
  thumbUrlIdentity?: string;
  prompt?: string;
  seed?: number;
  metadata?: DisplayableMetadata;
  temp_local_path?: string;
  error?: string;
  file?: File;
  isVideo?: boolean;
  type?: string;
  contentType?: string; // MIME type for proper download file extensions (e.g., 'video/mp4', 'image/png')
  unsaved?: boolean;
  createdAt?: string;
  updatedAt?: string | null;
  starred?: boolean;
  shot_id?: string;
  position?: number | null;
  timeline_frame?: number | null;
  name?: string; // Variant name for the generation
  all_shot_associations?: Array<{ shot_id: string; position: number | null; timeline_frame?: number | null }>;
  based_on?: string | null; // ID of source generation for lineage tracking (magic edits, variations)
  derivedCount?: number; // Number of generations based on this one
  hasUnviewedVariants?: boolean; // Whether any variants have viewed_at === null (for NEW badge)
  unviewedVariantCount?: number; // Count of unviewed variants for tooltip
  // Parent/child relationship fields (for travel-between-images segments)
  is_child?: boolean;
  parent_generation_id?: string;
  child_order?: number;
}

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

/**
 * Boolean config flags for MediaGallery appearance and behavior.
 * Group these into a single `config` prop to reduce top-level prop count.
 * All fields are optional — defaults are applied via `DEFAULT_GALLERY_CONFIG`.
 */
export interface GalleryConfig {
  // Visibility flags — which action buttons to show on gallery items
  showDelete: boolean;
  showDownload: boolean;
  showShare: boolean;
  showEdit: boolean;
  showStar: boolean;
  showAddToShot: boolean;

  // UI mode flags
  /** When true, single click selects (instead of opening lightbox) */
  enableSingleClick: boolean;
  /** When true, videos render as static thumbnails instead of hover-scrub */
  videosAsThumbnails: boolean;
  /** White text mode for dark backgrounds */
  whiteText: boolean;
  /** Reduced spacing between gallery elements */
  reducedSpacing: boolean;
  /** Show shot filter dropdown in header */
  showShotFilter: boolean;
  /** Show search input in header */
  showSearch: boolean;

  // Hide flags — which sections to suppress
  hidePagination: boolean;
  hideTopFilters: boolean;
  hideMediaTypeFilter: boolean;
  hideBottomPagination: boolean;
  hideShotNotifier: boolean;
}

export const DEFAULT_GALLERY_CONFIG: GalleryConfig = {
  showDelete: true,
  showDownload: true,
  showShare: true,
  showEdit: false,
  showStar: true,
  showAddToShot: true,
  enableSingleClick: false,
  videosAsThumbnails: false,
  whiteText: false,
  reducedSpacing: false,
  showShotFilter: false,
  showSearch: false,
  hidePagination: false,
  hideTopFilters: false,
  hideMediaTypeFilter: false,
  hideBottomPagination: false,
  hideShotNotifier: false,
};

export interface MediaGalleryProps {
  images: GeneratedImageWithMetadata[];
  onDelete?: (id: string) => void;
  isDeleting?: string | boolean | null;
  onApplySettings?: (metadata: DisplayableMetadata | undefined) => void;
  allShots: Shot[];
  lastShotId?: string;
  lastShotNameForTooltip?: string;
  onAddToLastShot?: AddToShotHandler;
  onAddToLastShotWithoutPosition?: AddToShotHandler;
  currentToolType?: string;
  initialFilterState?: boolean;
  currentViewingShotId?: string;
  offset?: number;
  totalCount?: number;
  /**
   * Number of columns per row.
   * - 'auto': Calculate dynamically based on project aspect ratio (default)
   * - number: Fixed number of columns
   */
  columnsPerRow?: ColumnsPerRow;
  itemsPerPage?: number;
  /** Controlled filter state — parent owns the values */
  filters?: GalleryFilterState;
  /** Callback when any filter changes (controlled mode) */
  onFiltersChange?: (filters: GalleryFilterState) => void;
  /** Default filter overrides for uncontrolled mode */
  defaultFilters?: Partial<GalleryFilterState>;
  onServerPageChange?: (page: number, fromBottom?: boolean) => void;
  serverPage?: number;
  onToggleStar?: (id: string, starred: boolean) => void;
  currentToolTypeName?: string;
  formAssociatedShotId?: string | null;
  onSwitchToAssociatedShot?: (shotId: string) => void;
  /** Additional className to apply to the gallery wrapper (can override default spacing) */
  className?: string;
  /** @deprecated Use generationFilters instead - callbacks no longer needed */
  onPrefetchAdjacentPages?: (prevPage: number | null, nextPage: number | null) => void;
  enableAdjacentPagePreloading?: boolean;
  /** Filters for generation queries - enables automatic preloading */
  generationFilters?: Record<string, unknown>;
  onCreateShot?: (shotName: string, files: File[]) => Promise<void>;
  /** Called after delete to trigger data refetch. Should invalidate queries and refetch current page. */
  onBackfillRequest?: () => Promise<void>;
  onImageClick?: (image: GeneratedImageWithMetadata) => void;
  /**
   * Boolean config flags controlling gallery appearance and behavior.
   * All fields optional — unset fields use defaults from DEFAULT_GALLERY_CONFIG.
   */
  config?: Partial<GalleryConfig>;
}
