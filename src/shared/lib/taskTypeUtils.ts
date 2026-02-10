/**
 * Centralized task type utilities
 *
 * This module provides a single source of truth for task type categorization.
 * Use these utilities instead of inline checks like `taskType?.includes('travel')`.
 *
 * Note: Some types like 'clip_join' are variant_types (stored on generation_variants),
 * not task_types (in task_types DB table). This utility handles both uniformly.
 */

// Join clips related types (includes variant_type 'clip_join')
const JOIN_CLIPS_TYPES = new Set([
  'join_clips_orchestrator',
  'join_clips_segment',
  'join_clips',
  'clip_join', // variant_type, not a task_type
]);

// Travel/video generation types
const TRAVEL_TYPES = new Set([
  'travel_orchestrator',
  'travel_segment',
  'individual_travel_segment',
]);

// Character animation types
const CHARACTER_ANIMATE_TYPES = new Set([
  'animate_character',
]);

/**
 * Check if a task type is a join clips type
 * Includes: join_clips_orchestrator, join_clips_segment, join_clips, clip_join
 */
export const isJoinClipsTaskType = (taskType: string | null | undefined): boolean => {
  if (!taskType) return false;
  return JOIN_CLIPS_TYPES.has(taskType);
};

/**
 * Check if a task type is a travel/video generation type
 * Includes: travel_orchestrator, travel_segment, individual_travel_segment
 */
export const isTravelTaskType = (taskType: string | null | undefined): boolean => {
  if (!taskType) return false;
  // Also check for partial match to handle any future travel types
  return TRAVEL_TYPES.has(taskType) || taskType.includes('travel');
};

/**
 * Check if a task type is a character animate type
 */
export const isCharacterAnimateTaskType = (taskType: string | null | undefined): boolean => {
  if (!taskType) return false;
  return CHARACTER_ANIMATE_TYPES.has(taskType);
};


/**
 * Parse task params, handling both string and object formats
 */
export const parseTaskParams = (params: string | Record<string, unknown> | null | undefined): Record<string, unknown> => {
  if (!params) return {};
  if (typeof params === 'string') {
    try {
      return JSON.parse(params);
    } catch {
      return {};
    }
  }
  return params;
};
