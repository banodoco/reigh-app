/**
 * Shared Generation Data Transformers
 * 
 * SINGLE SOURCE OF TRUTH for transforming generation data from database to UI format.
 * 
 * This eliminates the need to manually update transformation logic in multiple places
 * when adding new fields. Instead, update once here and all consumers automatically
 * get the new field.
 * 
 * Architecture Benefits:
 * - DRY: No duplicated transformation logic across hooks/components
 * - Type Safety: Centralized TypeScript types ensure consistency
 * - Maintainability: Add new fields in one place instead of 5+
 * - Testability: Can unit test transformations in isolation
 * 
 * NOTE: upscaled_url has been removed - upscaled versions are now stored as
 * generation_variants with variant_type='upscaled' and become the primary variant,
 * so `location` already contains the best available URL.
 */

import { GeneratedImageWithMetadata } from '@/shared/components/MediaGallery';
import { GenerationRow, GenerationMetadata } from '@/types/shots';
import { supabase } from '@/integrations/supabase/client';
import { stripQueryParameters } from '@/shared/lib/utils';

/**
 * Result type for calculateDerivedCounts
 */
export interface DerivedCountsResult {
  /** Count of variants/derivatives per generation */
  derivedCounts: Record<string, number>;
  /** Whether each generation has any unviewed variants (viewed_at IS NULL) */
  hasUnviewedVariants: Record<string, boolean>;
  /** Count of unviewed variants per generation */
  unviewedVariantCounts: Record<string, number>;
}

/**
 * Calculate derivedCount for generations (how many variants/derivatives exist)
 * Also tracks whether any variants are unviewed (for NEW badge display)
 *
 * Queries both:
 * - generations table (based_on relationships)
 * - generation_variants table (edit variants)
 *
 * @param generationIds - Array of generation IDs to count variants for
 * @returns Object with derivedCounts and hasUnviewedVariants maps
 */
export async function calculateDerivedCounts(
  generationIds: string[]
): Promise<DerivedCountsResult> {
  const derivedCounts: Record<string, number> = {};
  const hasUnviewedVariants: Record<string, boolean> = {};
  const unviewedVariantCounts: Record<string, number> = {};

  if (generationIds.length === 0) {
    return { derivedCounts, hasUnviewedVariants, unviewedVariantCounts };
  }

  // Only count from generation_variants table (actual variants)
  // Note: We intentionally don't count based_on generations here - those are
  // separate images in the gallery, not variants of this image
  const { data: variantCountsData, error: variantCountsError } = await supabase
    .from('generation_variants')
    .select('generation_id, viewed_at')
    .in('generation_id', generationIds);

  if (!variantCountsError && variantCountsData) {
    variantCountsData.forEach((item: { generation_id: string; viewed_at: string | null }) => {
      const genId = item.generation_id;
      derivedCounts[genId] = (derivedCounts[genId] || 0) + 1;
      // If any variant has viewed_at === null, mark as having unviewed variants and count them
      if (item.viewed_at === null) {
        hasUnviewedVariants[genId] = true;
        unviewedVariantCounts[genId] = (unviewedVariantCounts[genId] || 0) + 1;
      }
    });
  }

  return { derivedCounts, hasUnviewedVariants, unviewedVariantCounts };
}

/**
 * Raw variant record from generation_variants table (before transformation)
 */
export interface RawVariant {
  id: string;
  generation_id: string;
  location: string;
  thumbnail_url?: string | null;
  params?: Record<string, unknown> | null;
  variant_type?: string | null;
  name?: string | null;
  created_at: string;
  /** Only present for derived-items queries */
  is_primary?: boolean;
  viewed_at?: string | null;
}

/**
 * Raw generation record from database (before transformation)
 */
export interface RawGeneration {
  id: string;
  location: string;
  thumbnail_url?: string | null;
  type?: string | null;
  created_at: string;
  updated_at?: string | null;
  params?: Record<string, unknown> | null;
  starred?: boolean | null;
  tasks?: string[] | string | null;
  based_on?: string | null;
  name?: string | null;
  derivedCount?: number; // Number of generations/variants based on this one
  hasUnviewedVariants?: boolean; // Whether any variants have viewed_at === null (for NEW badge)
  unviewedVariantCount?: number; // Count of unviewed variants
  // Parent/child relationship fields
  is_child?: boolean | null;
  parent_generation_id?: string | null;
  child_order?: number | null;
  // JSONB column mapping shot_id -> array of timeline_frames
  // Each generation can appear multiple times in the same shot (different positions)
  // Example: { "shot_id_123": [120, 420, null] } means 3 entries: at frame 120, 420, and one unpositioned
  shot_data?: Record<string, (number | null)[]>;
  // DEPRECATED: Old join format (for backwards compatibility)
  shot_generations?: Array<{
    shot_id: string;
    timeline_frame: number | null;
  }>;
}

/**
 * Raw shot_generation record from database (before transformation)
 */
export interface RawShotGeneration {
  id: string;
  shot_id: string;
  generation_id: string;
  timeline_frame: number | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  generation?: RawGeneration | RawGeneration[] | null;
  generations?: RawGeneration | RawGeneration[] | null;
}

/**
 * Options for transformation customization
 */
interface TransformOptions {
  /** Shot image entry ID (from shot_generations table) */
  shotImageEntryId?: string;
  /** Timeline frame position */
  timeline_frame?: number | null;
  /** Additional metadata to merge */
  metadata?: Record<string, unknown> | null;
  /** Shot ID for filtering */
  shotId?: string;
  /** Whether to include verbose logging */
  verbose?: boolean;
}

/**
 * Extract prompt from various nested param structures
 */
function extractPrompt(params: Record<string, unknown> | null | undefined): string {
  if (!params) return 'No prompt';

  const originalParams = params.originalParams as Record<string, unknown> | undefined;
  const orchestratorDetails = originalParams?.orchestrator_details as Record<string, unknown> | undefined;
  const metadataBlock = params.metadata as Record<string, unknown> | undefined;

  return (
    (orchestratorDetails?.prompt as string) ||
    (params.prompt as string) ||
    (metadataBlock?.prompt as string) ||
    'No prompt'
  );
}

/**
 * Extract thumbnail URL with fallback logic
 * Handles special case for travel-between-images videos where thumbnail might be in params
 */
function extractThumbnailUrl(item: RawGeneration, mainUrl: string): string {
  // Start with database thumbnail_url field
  let thumbnailUrl = item.thumbnail_url;
  
  // If no thumbnail in database, check params for travel-between-images videos
  if (!thumbnailUrl && item.params?.tool_type === 'travel-between-images') {
    const originalParams = item.params?.originalParams as Record<string, unknown> | undefined;
    const orchestratorDetails = originalParams?.orchestrator_details as Record<string, unknown> | undefined;
    const fullPayload = item.params?.full_orchestrator_payload as Record<string, unknown> | undefined;
    const originalFullPayload = originalParams?.full_orchestrator_payload as Record<string, unknown> | undefined;

    thumbnailUrl =
      (item.params?.thumbnailUrl as string) ||
      (orchestratorDetails?.thumbnail_url as string) ||
      (fullPayload?.thumbnail_url as string) ||
      (originalFullPayload?.thumbnail_url as string);
  }
  
  // Final fallback to main URL
  return thumbnailUrl || mainUrl;
}

/**
 * Extract task ID from tasks field (handles both array and single value)
 */
function extractTaskId(tasks: string[] | string | null | undefined): string | null {
  if (Array.isArray(tasks) && tasks.length > 0) {
    return tasks[0];
  }
  return null;
}

/**
 * Normalize timeline_frame to position (divide by 50)
 */
function normalizePosition(timelineFrame: number | null | undefined): number | null {
  if (timelineFrame === null || timelineFrame === undefined) return null;
  return Math.floor(timelineFrame / 50);
}

/**
 * Transform a raw generation record from database to UI format
 * 
 * This is the MAIN transformation function used by most hooks/components
 * 
 * @param item - Raw generation from database query
 * @param options - Optional customization (shot context, metadata, etc.)
 * @returns Transformed generation ready for UI display
 */
export function transformGeneration(
  item: RawGeneration,
  options: TransformOptions = {}
): GeneratedImageWithMetadata {
  const mainUrl = item.location;
  const thumbnailUrl = extractThumbnailUrl(item, mainUrl);
  const taskId = extractTaskId(item.tasks);
  const prompt = extractPrompt(item.params);
  
  // Extract content_type from params for proper download file extensions
  // Stored as 'image' or 'video', convert to MIME type
  const storedContentType = item.params?.content_type;
  const isVideo = item.type?.includes('video') || storedContentType === 'video' || false;
  let contentType: string | undefined;
  if (storedContentType === 'video') {
    // Default to mp4 for videos, can be overridden by URL extension
    contentType = 'video/mp4';
  } else if (storedContentType === 'image') {
    // Default to png for images, can be overridden by URL extension  
    contentType = 'image/png';
  }
  
  // Compute stable URL identities for caching/comparison
  // Supabase URLs have rotating tokens but the file path is stable
  const urlIdentity = stripQueryParameters(mainUrl);
  const thumbUrlIdentity = stripQueryParameters(thumbnailUrl);

  // Base transformation - fields common to all generations
  const baseItem: GeneratedImageWithMetadata = {
    id: item.id,
    url: mainUrl,
    thumbUrl: thumbnailUrl,
    urlIdentity,
    thumbUrlIdentity,
    prompt,
    metadata: {
      ...(item.params || {}),
      taskId, // Include task ID in metadata for MediaGalleryItem
      based_on: item.based_on, // Include based_on for lineage tracking
      ...(options.metadata || {}), // Merge any additional metadata
    },
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    isVideo,
    contentType, // For proper download file extensions
    starred: item.starred || false,
    based_on: item.based_on, // Top level for easy access
    position: null, // Will be set if shot context provided
    timeline_frame: null, // Will be set if shot context provided
    name: item.name || (item.params?.name as string | undefined) || undefined,
    derivedCount: item.derivedCount || 0, // Number of generations/variants based on this one
    hasUnviewedVariants: item.hasUnviewedVariants || false, // For NEW badge display
    unviewedVariantCount: item.unviewedVariantCount || 0, // Count for tooltip
    // Parent/child relationship fields
    is_child: item.is_child ?? undefined,
    parent_generation_id: item.parent_generation_id ?? undefined,
    child_order: item.child_order ?? undefined,
  };

  // Handle shot associations - prefer JSONB shot_data over JOIN shot_generations
  let shotGenerations: Array<{ shot_id: string; timeline_frame: number | null }> = [];
  
  // Convert JSONB shot_data to flat array format
  // shot_data format: { shot_id: [frame1, frame2, ...] } (array per shot)
  // Each generation can appear multiple times in a shot (different positions)
  if (item.shot_data && Object.keys(item.shot_data).length > 0) {
    for (const [shotId, frames] of Object.entries(item.shot_data)) {
      // shot_data should always be an array now, but handle legacy single-value format during migration
      // Also handle null/undefined values - the shot association still exists, just without a position
      const frameArray = Array.isArray(frames) ? frames : (frames !== null && frames !== undefined ? [frames] : [null]);
      for (const frame of frameArray) {
        shotGenerations.push({
          shot_id: shotId,
          timeline_frame: frame,
        });
      }
    }
  } 
  // Fall back to shot_generations join (OLD approach, for backwards compatibility)
  else if (item.shot_generations) {
    shotGenerations = item.shot_generations;
  }
  
  // If shot context is provided via options, use it
  if (options.shotImageEntryId || options.timeline_frame !== undefined) {
    return {
      ...baseItem,
      shotImageEntryId: options.shotImageEntryId,
      timeline_frame: options.timeline_frame ?? null,
      position: normalizePosition(options.timeline_frame),
    };
  }

  // Otherwise, process shot associations from query data
  if (shotGenerations.length > 0) {
    // Single shot optimization
    if (shotGenerations.length === 1) {
      const singleShot = shotGenerations[0];
      return {
        ...baseItem,
        shot_id: singleShot.shot_id,
        position: normalizePosition(singleShot.timeline_frame),
        timeline_frame: singleShot.timeline_frame,
      };
    }
    
    // Multiple shots: include all associations
    const allAssociations = shotGenerations.map(shotGen => ({
      shot_id: shotGen.shot_id,
      timeline_frame: shotGen.timeline_frame,
      position: normalizePosition(shotGen.timeline_frame),
    }));
    
    // When filtering by specific shot, use that shot as primary
    let primaryShot = shotGenerations[0];
    if (options.shotId) {
      const matchingShot = shotGenerations.find(shotGen => shotGen.shot_id === options.shotId);
      if (matchingShot) {
        primaryShot = matchingShot;
      }
    }

    return {
      ...baseItem,
      shot_id: primaryShot.shot_id,
      position: normalizePosition(primaryShot.timeline_frame),
      timeline_frame: primaryShot.timeline_frame,
      all_shot_associations: allAssociations,
    };
  }
  
  return baseItem;
}

/**
 * Transform a shot_generation record (with nested generation data)
 *
 * Used by hooks that query shot_generations table with JOIN to generations
 *
 * @param shotGen - Raw shot_generation from database
 * @param options - Optional customization
 * @returns Transformed generation with timeline context
 */
function transformShotGeneration(
  shotGen: RawShotGeneration,
  options: TransformOptions = {}
): GeneratedImageWithMetadata & { timeline_frame: number | null } {
  // Handle both 'generation' and 'generations' field names (Supabase inconsistency)
  let gen = shotGen.generation || shotGen.generations;
  
  // If it's an array, take the first item
  if (Array.isArray(gen)) {
    gen = gen[0];
  }
  
  if (!gen) {
    // Fallback for missing generation data
    return {
      id: shotGen.generation_id,
      url: '',
      thumbUrl: '',
      prompt: 'Missing generation data',
      metadata: {},
      createdAt: shotGen.created_at || new Date().toISOString(),
      isVideo: false,
      starred: false,
      shotImageEntryId: shotGen.id,
      timeline_frame: shotGen.timeline_frame,
      position: normalizePosition(shotGen.timeline_frame),
    };
  }
  
  // Transform using the base transformer with shot context
  const transformed = transformGeneration(gen, {
    ...options,
    shotImageEntryId: shotGen.id,
    timeline_frame: shotGen.timeline_frame,
    metadata: {
      ...shotGen.metadata,
      ...(options.metadata || {}),
    },
  });
  
  return {
    ...transformed,
    timeline_frame: shotGen.timeline_frame,
  };
}

/**
 * Transform for Timeline component's specific needs
 * Maps to GenerationRow format expected by Timeline
 */
export function transformForTimeline(
  shotGen: RawShotGeneration
): GenerationRow & { timeline_frame?: number } {
  const gen = shotGen.generation || shotGen.generations;
  const genData = Array.isArray(gen) ? gen[0] : gen;
  
  if (!genData) {
    return {
      // PRIMARY IDs: id = shot_generations.id (unique per entry), generation_id = actual generation
      id: shotGen.id,
      generation_id: shotGen.generation_id,
      // Deprecated (backwards compat)
      shotImageEntryId: shotGen.id,
      timeline_frame: shotGen.timeline_frame ?? undefined,
    };
  }
  
  return {
    // PRIMARY IDs: id = shot_generations.id (unique per entry), generation_id = actual generation
    id: shotGen.id,
    generation_id: shotGen.generation_id,
    // Deprecated (backwards compat)
    shotImageEntryId: shotGen.id,
    imageUrl: genData.location,
    thumbUrl: genData.location,
    location: genData.location,
    type: genData.type ?? undefined,
    createdAt: genData.created_at,
    timeline_frame: shotGen.timeline_frame ?? undefined,
    metadata: (shotGen.metadata as GenerationMetadata | undefined) ?? undefined,
    starred: genData.starred ?? false, // ⭐ Pass through starred status
    based_on: genData.based_on ?? undefined, // 🔗 Pass through based_on for lineage tracking
    derivedCount: genData.derivedCount ?? 0, // 🔢 Pass through variant count
  };
}

/**
 * Transform for useUnifiedGenerations (VideoOutputsGallery)
 * Returns format with taskId for task tracking
 */
function transformForUnifiedGenerations(
  shotGen: RawShotGeneration,
  includeTaskData: boolean = false
): GeneratedImageWithMetadata {
  const gen = shotGen.generation || shotGen.generations;
  const genData = Array.isArray(gen) ? gen[0] : gen;
  
  if (!genData) {
    return {
      // PRIMARY IDs
      id: shotGen.id, // shot_generations.id (unique per entry)
      generation_id: shotGen.generation_id,
      url: '',
      thumbUrl: '',
      prompt: 'No prompt',
      metadata: {},
      createdAt: shotGen.created_at || new Date().toISOString(),
      isVideo: false,
      starred: false,
      // Deprecated (backwards compat)
      shotImageEntryId: shotGen.id,
      position: normalizePosition(shotGen.timeline_frame),
      taskId: null,
    };
  }
  
  const baseTransform = transformGeneration(genData, {
    shotImageEntryId: shotGen.id,
    timeline_frame: shotGen.timeline_frame,
  });
  
  // Extract taskId if needed
  const taskId = includeTaskData && genData.tasks 
    ? (Array.isArray(genData.tasks) ? genData.tasks[0] : genData.tasks)
    : null;
  
  return {
    ...baseTransform,
    // PRIMARY IDs
    id: shotGen.id, // shot_generations.id (unique per entry)
    generation_id: shotGen.generation_id,
    // Deprecated (backwards compat)
    shotImageEntryId: shotGen.id,
    position: normalizePosition(shotGen.timeline_frame),
    taskId,
    name: genData.name || undefined,
  };
}

/**
 * Detect if a URL points to a video based on file extension.
 * Used for variants which lack a `type` column.
 */
function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
  return videoExtensions.some(ext => url.toLowerCase().includes(ext));
}

/**
 * Transform a raw variant record from generation_variants table to UI format.
 *
 * Mirrors `transformGeneration` but for variants, which have a different
 * schema (no `type` column, different metadata shape).
 *
 * @param variant - Raw variant from database query
 * @param options - Optional overrides (e.g. toolType fallback)
 * @returns Transformed variant ready for UI display
 */
export function transformVariant(
  variant: RawVariant,
  options?: { toolType?: string }
): GeneratedImageWithMetadata {
  const isVideo = isVideoUrl(variant.location);
  const variantParams = (variant.params ?? {}) as Record<string, unknown>;
  const storedContentType = variantParams.content_type as string | undefined;

  let contentType: string | undefined;
  if (storedContentType === 'video' || isVideo) {
    contentType = 'video/mp4';
  } else if (storedContentType === 'image' || !isVideo) {
    contentType = 'image/png';
  }

  return {
    id: variant.id,
    url: variant.location,
    thumbUrl: variant.thumbnail_url || variant.location,
    isVideo,
    contentType,
    createdAt: variant.created_at,
    starred: false, // Variants don't have starred flag
    metadata: {
      prompt: variantParams.prompt as string | undefined,
      variant_type: variant.variant_type,
      name: variant.name,
      generation_id: variant.generation_id,
      tool_type: (variantParams.tool_type as string) || options?.toolType,
      created_from: variantParams.created_from as string | undefined,
      source_task_id: variantParams.source_task_id as string | undefined,
      content_type: storedContentType,
    },
    shot_id: undefined,
    position: undefined,
    all_shot_associations: undefined,
  };
}

