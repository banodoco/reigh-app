/**
 * Parameter extraction helpers for complete_task
 *
 * These functions extract values from deeply nested task params,
 * supporting multiple possible locations for each field.
 */

import { extractOrchestratorRef } from '../_shared/billing.ts';
import {
  extractAddInPositionParam,
  extractBasedOnParam,
  extractRunIdParam,
  extractShotIdParam,
} from '../../../src/shared/lib/tasks/taskParamContract.ts';

// ===== THUMBNAIL PATH CONFIGURATION =====

/**
 * Configuration for where thumbnail_url should be stored based on task_type
 */
const THUMBNAIL_PATH_CONFIG: Record<string, { path: string[]; extras?: Record<string, unknown> }> = {
  'travel_stitch': {
    path: ['full_orchestrator_payload', 'thumbnail_url'],
    extras: { accelerated: false } // Always hardcode accelerated=false for travel_stitch
  },
  'wan_2_2_i2v': {
    path: ['orchestrator_details', 'thumbnail_url']
  },
  'single_image': {
    path: ['thumbnail_url']
  },
  'default': {
    path: ['thumbnail_url']
  }
};

// ===== SPECIFIC EXTRACTORS =====

/**
 * Extract orchestrator_task_id from task params
 * Delegates to shared extractOrchestratorRef (single source of truth for path list)
 * and adds logging consistent with other complete_task extractors.
 */
export function extractOrchestratorTaskId(params: unknown, _logTag: string = 'OrchestratorExtract'): string | null {
  const value = extractOrchestratorRef(params);
  return value;
}

/**
 * Extract orchestrator run_id from task params
 * Used for finding sibling segment tasks
 */
export function extractOrchestratorRunId(params: unknown, _logTag: string = 'OrchestratorExtract'): string | null {
  return extractRunIdParam(params);
}

/**
 * Extract based_on from task params
 * Supports multiple param shapes for flexibility across different task types
 */
export function extractBasedOn(params: unknown): string | null {
  return extractBasedOnParam(params);
}

/**
 * Extract shot_id and add_in_position from task params
 * Supports multiple param shapes as per current DB trigger logic
 */
export function extractShotAndPosition(params: unknown): { shotId?: string, addInPosition: boolean } {
  const shotId = extractShotIdParam(params) || undefined;
  const addInPosition = extractAddInPositionParam(params);
  return { shotId, addInPosition };
}

/**
 * Set thumbnail URL in params at the correct location based on task_type
 * @returns Updated params object (does not mutate original)
 */
export function setThumbnailInParams(
  params: Record<string, unknown>,
  taskType: string,
  thumbnailUrl: string
): Record<string, unknown> {
  const config = THUMBNAIL_PATH_CONFIG[taskType] || THUMBNAIL_PATH_CONFIG.default;
  const updatedParams = JSON.parse(JSON.stringify(params || {})); // Deep clone

  // Navigate to parent path and ensure it exists
  let target = updatedParams;
  for (let i = 0; i < config.path.length - 1; i++) {
    const key = config.path[i];
    if (!target[key]) {
      target[key] = {};
    }
    target = target[key];
  }

  // Set the thumbnail URL
  const finalKey = config.path[config.path.length - 1];
  target[finalKey] = thumbnailUrl;

  // Set any extras (e.g., accelerated=false for travel_stitch)
  if (config.extras) {
    for (const [key, value] of Object.entries(config.extras)) {
      target[key] = value;
    }
  }

  return updatedParams;
}

// ===== UTILITY FUNCTIONS =====

/**
 * Get MIME content type from filename extension
 */
export function getContentType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Build generation params starting from normalized task params
 */
export function buildGenerationParams(
  baseParams: unknown,
  toolType: string,
  contentType?: string,
  shotId?: string,
  thumbnailUrl?: string,
  sourceTaskId?: string
): unknown {
  const generationParams = { ...baseParams };

  // Add tool_type to the params JSONB
  generationParams.tool_type = toolType;

  // Add source_task_id if provided
  // IMPORTANT: This is used by the auto_view_manual_upload_variant trigger
  // to distinguish task-created generations (which should show NEW badge)
  // from manual uploads (which should be auto-marked as viewed)
  if (sourceTaskId) {
    generationParams.source_task_id = sourceTaskId;
  }

  // Add content_type to params for download/display purposes
  if (contentType) {
    generationParams.content_type = contentType;
  }

  // Add shot_id if present and valid
  if (shotId) {
    generationParams.shotId = shotId;
  }

  // Add thumbnail_url to params if available
  if (thumbnailUrl) {
    generationParams.thumbnailUrl = thumbnailUrl;
  }

  return generationParams;
}
