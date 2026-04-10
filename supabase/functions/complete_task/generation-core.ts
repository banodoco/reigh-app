/**
 * Core generation CRUD operations
 * Basic database operations for generations and variants
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

type ExistingGenerationLookupErrorCode =
  | 'existing_generation_lookup_failed'
  | 'existing_generation_lookup_duplicate';

export class ExistingGenerationLookupError extends Error {
  readonly code: ExistingGenerationLookupErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ExistingGenerationLookupErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ExistingGenerationLookupError';
    this.code = code;
    this.details = details;
  }
}

// ===== HELPERS =====

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Helper to safely extract value from array by index
 */
export function extractFromArray(arr: unknown[], index: number): unknown | undefined {
  if (Array.isArray(arr) && index >= 0 && index < arr.length) {
    return arr[index];
  }
  return undefined;
}

// ===== GENERATION LOOKUP =====

/**
 * Check for existing generation referencing this task_id
 */
export async function findExistingGeneration(supabase: SupabaseClient, taskId: string): Promise<unknown | null> {
  try {
    const { data, error } = await supabase
      .from('generations')
      .select('*')
      .contains('tasks', JSON.stringify([taskId]))
      .order('created_at', { ascending: false })
      .limit(2);

    if (error) {
      throw new ExistingGenerationLookupError(
        'existing_generation_lookup_failed',
        `Failed to lookup existing generation for task ${taskId}: ${error.message}`,
        {
          taskId,
          errorCode: error.code,
          errorMessage: error.message,
        },
      );
    }

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    if (data.length > 1) {
      const generationIds = data
        .map((row) => (typeof row === 'object' && row !== null && 'id' in row ? String((row as { id: unknown }).id) : null))
        .filter((id): id is string => Boolean(id));

      throw new ExistingGenerationLookupError(
        'existing_generation_lookup_duplicate',
        `Multiple existing generations found for task ${taskId}`,
        {
          taskId,
          generationIds,
        },
      );
    }

    return data[0];
  } catch (error) {
    if (error instanceof ExistingGenerationLookupError) {
      throw error;
    }
    throw new ExistingGenerationLookupError(
      'existing_generation_lookup_failed',
      `Exception while looking up existing generation for task ${taskId}`,
      {
        taskId,
        cause: String(error),
      },
    );
  }
}

/**
 * Find source generation by image URL (for magic edit tracking)
 */
export async function findSourceGenerationByImageUrl(supabase: SupabaseClient, imageUrl: string): Promise<string | null> {
  if (!imageUrl) return null;

  try {
    const { data, error } = await supabase
      .from('generations')
      .select('id')
      .eq('location', imageUrl)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Error finding source generation:', error);
      return null;
    }

    if (data) {
      return data.id;
    }

    return null;
  } catch (error) {
    console.warn('Exception finding source generation:', error);
    return null;
  }
}

// ===== GENERATION/VARIANT CREATION =====

/**
 * Insert generation record
 */
export async function insertGeneration(supabase: SupabaseClient, record: unknown): Promise<unknown> {
  const { data, error } = await supabase
    .from('generations')
    .insert(record)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert generation: ${error.message}`);
  }

  return data;
}

export async function derivePredecessorVariantId(
  supabase: SupabaseClient,
  params: Record<string, unknown> | null | undefined,
  parentGenerationId: string | null,
  childOrder: number | null,
): Promise<string | null> {
  const continuationConfig = asRecord(params?.continuation_config);
  const overlapFrames = asNumber(continuationConfig?.overlap_frames)
    ?? asNumber(params?.frame_overlap_from_previous);

  if (!overlapFrames || overlapFrames <= 0 || !parentGenerationId || childOrder === null || childOrder <= 0) {
    return null;
  }

  const { data: predecessor, error } = await supabase
    .from('generations')
    .select('primary_variant_id')
    .eq('parent_generation_id', parentGenerationId)
    .eq('child_order', childOrder - 1)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to derive predecessor variant: ${error.message}`);
  }

  return typeof predecessor?.primary_variant_id === 'string'
    ? predecessor.primary_variant_id
    : null;
}

/**
 * Create a generation variant
 * @param viewedAt - Optional: if provided, marks the variant as already viewed (for single-segment cases)
 */
export async function createVariant(
  supabase: SupabaseClient,
  generationId: string,
  location: string,
  thumbnailUrl: string | null,
  params: unknown,
  isPrimary: boolean,
  variantType: string | null,
  name?: string | null,
  viewedAt?: string | null
): Promise<{ id: string }> {
  const variantRecord: Record<string, unknown> = {
    generation_id: generationId,
    location,
    thumbnail_url: thumbnailUrl,
    params,
    is_primary: isPrimary,
    variant_type: variantType,
    name: name || null,
    created_at: new Date().toISOString()
  };

  // If viewedAt is provided, mark the variant as already viewed
  if (viewedAt) {
    variantRecord.viewed_at = viewedAt;
  }

  const { data, error } = await supabase
    .from('generation_variants')
    .insert(variantRecord)
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create variant: ${error.message}`);
  }

  return data;
}

/**
 * Link generation to shot using the existing RPC
 */
export async function linkGenerationToShot(
  supabase: SupabaseClient,
  shotId: string,
  generationId: string,
  addInPosition: boolean
): Promise<void> {
  try {
    const { error } = await supabase.rpc('add_generation_to_shot', {
      p_shot_id: shotId,
      p_generation_id: generationId,
      p_with_position: addInPosition
    });

    if (error) {
      const rpcError = asRecord(error);
      console.warn('Failed to link generation to shot via RPC', {
        shotId,
        generationId,
        errorCode: rpcError?.code ?? null,
        errorMessage: rpcError?.message ?? null,
        errorDetails: rpcError?.details ?? null,
      });
    }
  } catch (error) {
    console.warn('Exception linking generation to shot', {
      shotId,
      generationId,
      error,
    });
    return;
  }
}
