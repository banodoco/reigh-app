import type { Shot, GenerationRow } from "@/types/shots";

/**
 * Columns per row can be:
 * - 'auto': Calculate dynamically based on aspect ratio
 * - number: Fixed number of columns
 */
export type ColumnsPerRow = 'auto' | number;

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
  url: string;
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

export interface MediaGalleryProps {
  images: GeneratedImageWithMetadata[];
  onDelete?: (id: string) => void;
  isDeleting?: string | null;
  onApplySettings?: (metadata: DisplayableMetadata) => void;
  allShots: Shot[];
  lastShotId?: string;
  lastShotNameForTooltip?: string;
  onAddToLastShot?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToLastShotWithoutPosition?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  currentToolType?: string;
  initialFilterState?: boolean;
  currentViewingShotId?: string;
  offset?: number;
  totalCount?: number;
  whiteText?: boolean;
  /**
   * Number of columns per row.
   * - 'auto': Calculate dynamically based on project aspect ratio (default)
   * - number: Fixed number of columns
   */
  columnsPerRow?: ColumnsPerRow;
  itemsPerPage?: number;
  initialMediaTypeFilter?: 'all' | 'image' | 'video';
  onServerPageChange?: (page: number, fromBottom?: boolean) => void;
  serverPage?: number;
  showShotFilter?: boolean;
  initialShotFilter?: string;
  onShotFilterChange?: (shotId: string) => void;
  initialExcludePositioned?: boolean;
  onExcludePositionedChange?: (exclude: boolean) => void;
  showSearch?: boolean;
  initialSearchTerm?: string;
  onSearchChange?: (searchTerm: string) => void;
  onMediaTypeFilterChange?: (mediaType: 'all' | 'image' | 'video') => void;
  onToggleStar?: (id: string, starred: boolean) => void;
  initialStarredFilter?: boolean;
  onStarredFilterChange?: (starredOnly: boolean) => void;
  onToolTypeFilterChange?: (enabled: boolean) => void;
  initialToolTypeFilter?: boolean;
  currentToolTypeName?: string;
  formAssociatedShotId?: string | null;
  onSwitchToAssociatedShot?: (shotId: string) => void;
  reducedSpacing?: boolean;
  /** Additional className to apply to the gallery wrapper (can override default spacing) */
  className?: string;
  hidePagination?: boolean;
  hideTopFilters?: boolean;
  hideMediaTypeFilter?: boolean;
  /** @deprecated Use generationFilters instead - callbacks no longer needed */
  onPrefetchAdjacentPages?: (prevPage: number | null, nextPage: number | null) => void;
  enableAdjacentPagePreloading?: boolean;
  /** Filters for generation queries - enables automatic preloading */
  generationFilters?: Record<string, unknown>;
  onCreateShot?: (shotName: string, files: File[]) => Promise<void>;
  /** Called after delete to trigger data refetch. Should invalidate queries and refetch current page. */
  onBackfillRequest?: () => Promise<void>;
  showDelete?: boolean;
  showDownload?: boolean;
  showShare?: boolean;
  showEdit?: boolean;
  showStar?: boolean;
  showAddToShot?: boolean;
  enableSingleClick?: boolean;
  onImageClick?: (image: GeneratedImageWithMetadata) => void;
  hideBottomPagination?: boolean;
  /** When true, videos are rendered as static thumbnail images instead of HoverScrubVideo for better performance */
  videosAsThumbnails?: boolean;
  /** When true, hides the shot filter notifier message */
  hideShotNotifier?: boolean;
}

