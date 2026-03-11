/**
 * Parameter helpers for complete_task.
 *
 * This module now owns thumbnail/content-type concerns and re-exports
 * extraction + generation helpers from focused modules.
 */

import {
  extractAddInPositionParam,
  extractBasedOnParam,
  extractShotIdParam,
} from '../../../src/shared/lib/tasks/taskParamContract.ts';

export function extractBasedOn(params: unknown): string | null {
  return extractBasedOnParam(params);
}

export function extractShotAndPosition(params: unknown): { shotId?: string, addInPosition: boolean } {
  const shotId = extractShotIdParam(params) || undefined;
  const addInPosition = extractAddInPositionParam(params);
  return { shotId, addInPosition };
}

export {
  buildGenerationParams,
  resolveBasedOn,
} from './paramsGeneration.ts';

// ===== THUMBNAIL PATH CONFIGURATION =====

/**
 * Configuration for where thumbnail_url should be stored based on task_type
 */
const THUMBNAIL_PATH_CONFIG: Record<string, { path: string[]; extras?: Record<string, unknown> }> = {
  travel_stitch: {
    path: ['full_orchestrator_payload', 'thumbnail_url'],
    extras: { accelerated: false }, // Always hardcode accelerated=false for travel_stitch
  },
  wan_2_2_i2v: {
    path: ['orchestrator_details', 'thumbnail_url'],
  },
  single_image: {
    path: ['thumbnail_url'],
  },
  default: {
    path: ['thumbnail_url'],
  },
};

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
