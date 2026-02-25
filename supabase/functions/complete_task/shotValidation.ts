/**
 * Shot validation and cleanup for complete_task
 * Validates shot_id references and removes invalid ones from task params
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// ===== TYPES =====

interface ShotValidationResult {
  needsUpdate: boolean;
  updatedParams: Record<string, unknown>;
}

// ===== SHOT VALIDATION =====

/**
 * Extract shot_id from task params based on tool_type
 */
function extractShotIdByToolType(params: unknown, toolType: string | null): unknown {
  if (toolType === 'travel-between-images') {
    // For travel-between-images tasks, try multiple possible locations
    return params?.orchestration_contract?.shot_id ||
           params?.originalParams?.orchestrator_details?.shot_id ||
           params?.orchestrator_details?.shot_id ||
           params?.full_orchestrator_payload?.shot_id;
  } else if (toolType === 'image-generation') {
    // For image generation tasks, shot_id is typically at top level
    return params?.orchestration_contract?.shot_id || params?.shot_id;
  } else {
    // Fallback for other task types - try common locations
    return params?.orchestration_contract?.shot_id ||
           params?.shot_id ||
           params?.orchestrator_details?.shot_id;
  }
}

/**
 * Remove invalid shot_id from params based on tool_type
 * @returns Updated params with shot_id removed from appropriate locations
 */
function removeShotIdByToolType(params: Record<string, unknown>, toolType: string | null): Record<string, unknown> {
  const updatedParams = JSON.parse(JSON.stringify(params)); // Deep clone

  if (toolType === 'travel-between-images') {
    // Clean up all possible locations for travel-between-images tasks
    if (updatedParams.orchestration_contract) {
      delete updatedParams.orchestration_contract.shot_id;
    }
    if (updatedParams.originalParams?.orchestrator_details) {
      delete updatedParams.originalParams.orchestrator_details.shot_id;
    }
    if (updatedParams.orchestrator_details) {
      delete updatedParams.orchestrator_details.shot_id;
    }
    if (updatedParams.full_orchestrator_payload) {
      delete updatedParams.full_orchestrator_payload.shot_id;
    }
  } else if (toolType === 'image-generation') {
    if (updatedParams.orchestration_contract) {
      delete updatedParams.orchestration_contract.shot_id;
    }
    delete updatedParams.shot_id;
  } else {
    // Fallback cleanup for other task types
    if (updatedParams.orchestration_contract) {
      delete updatedParams.orchestration_contract.shot_id;
    }
    delete updatedParams.shot_id;
    if (updatedParams.orchestrator_details) {
      delete updatedParams.orchestrator_details.shot_id;
    }
  }

  return updatedParams;
}

/**
 * Convert shot_id from various formats to string
 * Handles JSONB objects that may wrap the UUID
 */
function normalizeToString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  } else if (typeof value === 'object' && value !== null) {
    // If it's wrapped in an object, try to extract the actual UUID
    return String(value.id || value.uuid || value);
  } else {
    return String(value);
  }
}

/**
 * Validate UUID format
 */
function isValidUuid(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Validate shot references and clean up invalid ones from task params
 * 
 * @param supabase - Supabase client
 * @param params - Task params to validate
 * @param toolType - The resolved tool_type for this task
 * @returns Updated params if changes needed, or original params if valid
 */
export async function validateAndCleanupShotId(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  toolType: string | null
): Promise<ShotValidationResult> {
  // Extract shot_id based on tool_type
  const extractedShotId = extractShotIdByToolType(params, toolType);

  if (!extractedShotId) {
    // No shot_id to validate
    return { needsUpdate: false, updatedParams: params };
  }

  // Normalize to string (handles JSONB objects)
  const shotIdString = normalizeToString(extractedShotId);

  // Validate UUID format
  if (!isValidUuid(shotIdString)) {
    return {
      needsUpdate: true,
      updatedParams: removeShotIdByToolType(params, toolType)
    };
  }

  // Check if shot exists in database
  const { data: shotData, error: shotError } = await supabase
    .from("shots")
    .select("id")
    .eq("id", shotIdString)
    .single();

  if (shotError || !shotData) {
    return {
      needsUpdate: true,
      updatedParams: removeShotIdByToolType(params, toolType)
    };
  }

  return { needsUpdate: false, updatedParams: params };
}
