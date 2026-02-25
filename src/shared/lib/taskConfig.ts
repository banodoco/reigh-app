/**
 * Centralized task configuration system
 * 
 * This module provides synchronous access to task type configuration.
 * Configuration is loaded from the database (task_types table) and cached globally.
 * Hardcoded fallbacks exist for backwards compatibility and offline scenarios.
 */

import { getTaskTypeConfigCache, isTaskTypeConfigCacheInitialized, type TaskTypeInfo } from '@/shared/hooks/useTaskType';
import {
  getTaskTypeConfigFallback,
  getTaskTypeFallbackEntries,
} from '@/shared/lib/taskTypeConfigFallback';

interface TaskTypeConfig {
  /** Whether this task type should be visible in the UI */
  isVisible: boolean;
  /** Display name for the task type (overrides the raw taskType) */
  displayName?: string;
  /** Whether this task type supports progress checking */
  supportsProgress?: boolean;
  /** Whether this task type can be manually cancelled by users */
  canCancel?: boolean;
  /** Category for grouping related task types */
  category?: 'generation' | 'processing' | 'orchestration' | 'utility';
  /** Description for documentation/debugging */
  description?: string;
}

/**
 * Convert database TaskTypeInfo to TaskTypeConfig format
 */
function dbConfigToTaskConfig(dbConfig: TaskTypeInfo): TaskTypeConfig {
  return {
    isVisible: dbConfig.is_visible ?? false,
    displayName: dbConfig.display_name,
    supportsProgress: dbConfig.supports_progress ?? false,
    canCancel: true, // Default all tasks to cancellable
    category: dbConfig.category as TaskTypeConfig['category'],
  };
}

/**
 * Get configuration for a specific task type
 * Checks the database cache first, falls back to hardcoded defaults
 */
function getTaskConfig(taskType: string): TaskTypeConfig {
  // Check database cache first (populated by useAllTaskTypesConfig hook)
  if (isTaskTypeConfigCacheInitialized()) {
    const cache = getTaskTypeConfigCache();
    const dbConfig = cache[taskType];
    if (dbConfig) {
      return dbConfigToTaskConfig(dbConfig);
    }
  }
  
  // Fall back to the shared fallback snapshot.
  const fallbackConfig = getTaskTypeConfigFallback(taskType);
  if (fallbackConfig) {
    return fallbackConfig;
  }
  
  // Default for completely unknown task types
  return {
    isVisible: false, // Default to hidden for unknown types
    canCancel: true,
    category: 'utility'
  };
}

/**
 * Check if a task type should be visible in the UI
 */
function isTaskVisible(taskType: string): boolean {
  return getTaskConfig(taskType).isVisible;
}

/**
 * Get the display name for a task type
 */
export function getTaskDisplayName(taskType: string): string {
  const config = getTaskConfig(taskType);
  return config.displayName || taskType;
}

/**
 * Check if a task type supports progress checking
 */
export function taskSupportsProgress(taskType: string): boolean {
  return getTaskConfig(taskType).supportsProgress || false;
}

/**
 * Get task types filtered by visibility
 * Uses database cache if available, falls back to hardcoded list
 */
function getTaskTypesByVisibility(visible: boolean): string[] {
  if (isTaskTypeConfigCacheInitialized()) {
    const cache = getTaskTypeConfigCache();
    return Object.entries(cache)
      .filter(([_, config]) => visible ? config.is_visible : !config.is_visible)
      .map(([taskType]) => taskType);
  }

  // Fall back to the versioned fallback snapshot.
  return getTaskTypeFallbackEntries()
    .filter(([_, config]) => visible ? config.isVisible : !config.isVisible)
    .map(([taskType]) => taskType);
}

/**
 * Get all visible task types
 */
export function getVisibleTaskTypes(): string[] {
  return getTaskTypesByVisibility(true);
}

/**
 * Get all hidden task types
 */
export function getHiddenTaskTypes(): string[] {
  return getTaskTypesByVisibility(false);
}

/**
 * Filter tasks to only include visible ones
 */
export function filterVisibleTasks<T extends { taskType: string }>(tasks: T[]): T[] {
  return tasks.filter(task => isTaskVisible(task.taskType));
}
