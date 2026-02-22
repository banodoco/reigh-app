import type { GenerationMetadata } from '@/types/generationMetadata';
import type { GenerationParams } from '@/types/generationParams';

/**
 * Base type for all generation data used across galleries/lightboxes/timeline.
 *
 * IMPORTANT ID FIELDS:
 * - `id` is the shot_generations.id (unique per entry in a shot)
 * - `generation_id` is the generations.id (the underlying generation record)
 */
export interface GenerationRow {
  id: string; // shot_generations.id - unique per entry in shot
  generation_id?: string; // generations.id - the actual generation record
  imageUrl?: string; // Image preview URL
  thumbUrl?: string;
  thumbnail_url?: string | null; // DB column name (alias for thumbUrl)
  location?: string | null;
  type?: string | null;
  contentType?: string; // MIME type for proper download file extensions
  createdAt?: string;
  metadata?: GenerationMetadata | Record<string, unknown>; // Typed metadata with legacy compatibility
  isOptimistic?: boolean;
  shotImageEntryId?: string; // Legacy alias for id from shot_generations
  shot_generation_id?: string; // Legacy snake_case alias for shotImageEntryId
  name?: string | null; // Optional variant name
  timeline_frame?: number | null; // Position in timeline (from shot_generations table)
  starred?: boolean;
  derivedCount?: number;
  hasUnviewedVariants?: boolean;
  unviewedVariantCount?: number;
  based_on?: string | null; // Source generation ID for lineage tracking
  params?: GenerationParams; // JSON generation params (prompt/settings/etc.)
  created_at?: string; // DB column name
  parent_generation_id?: string | null;
  variant_name?: string;
  is_child?: boolean;
  child_order?: number | null;
  // FK reference to shot_generations for video-to-timeline slot matching
  pair_shot_generation_id?: string | null;
  // FK to the primary variant record (generation_variants.id)
  primary_variant_id?: string | null;
  // Task that created this generation (for task details panel in lightbox)
  source_task_id?: string | null;
}
