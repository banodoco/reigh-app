import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRenderLogger } from '@/shared/lib/debugRendering';
import { updateToolSettingsSupabase } from './useToolSettings';
import { queryKeys } from '@/shared/lib/queryKeys';
import { handleError } from '@/shared/lib/errorHandling/handleError';

type AutoSaveStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

/**
 * Configuration for the flush behavior when entity changes or page unloads.
 * The hook needs to know HOW to flush in both custom and React Query modes.
 */
interface FlushConfig {
  isCustomMode: boolean;
  scope: 'shot' | 'project';
  toolId: string;
  projectId?: string | null;
}

interface UseDebouncedSettingsSaveOptions<T> {
  /** Current entity ID */
  entityId: string | null;
  /** Debounce delay in ms */
  debounceMs: number;
  /** Current hook status - saves are only scheduled when 'ready' or 'saving' */
  status: AutoSaveStatus;
  /** Flush configuration for cleanup effects */
  flushConfig: FlushConfig;
  /** Ref to the custom save function (only used in custom mode) */
  customSaveRef: React.MutableRefObject<((entityId: string, data: T) => Promise<void>) | undefined>;
  /** Ref to optional onFlush callback (only used in custom mode) */
  onFlushRef: React.MutableRefObject<((entityId: string, data: T) => void) | undefined>;
  /** Ref to the latest saveImmediate function */
  saveImmediateRef: React.MutableRefObject<(settings: T) => Promise<void>>;
  /** Function to read the latest settings from state (via setSettings identity trick) */
  getLatestSettings: () => Promise<T>;
}

interface UseDebouncedSettingsSaveReturn<T> {
  /** Schedule a debounced save. Call this after updating settings state. */
  scheduleSave: (entityId: string | null) => void;
  /** Cancel any pending debounce timeout without saving. */
  cancelPendingSave: () => void;
  /**
   * Clear pending refs and cancel timeout. Used by revert/reset.
   * Does NOT trigger a save.
   */
  clearPending: () => void;
  /**
   * Record that settings were updated (tracks pending state for flush).
   * Call this BEFORE scheduleSave if the update should be flushed on unmount.
   */
  trackPendingUpdate: (settings: T, entityId: string | null) => void;
  /**
   * Increment the edit version and return the version at this point.
   * Used to detect if newer edits happened during an async save.
   */
  incrementEditVersion: () => number;
  /**
   * Check if there are pending edits for a given entity.
   * Used by load effects to avoid overwriting user input.
   */
  hasPendingFor: (entityId: string) => boolean;
  /** The pending settings ref (read-only access for load effects) */
  pendingSettingsRef: React.MutableRefObject<T | null>;
  /** The pending entity ID ref (read-only access for load effects) */
  pendingEntityIdRef: React.MutableRefObject<string | null>;
  /** The edit version ref */
  editVersionRef: React.MutableRefObject<number>;
  /** The save timeout ref */
  saveTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

/**
 * Sub-hook that manages debounced save scheduling, edit version tracking,
 * pending state tracking, and flush-on-unmount/entity-change/beforeunload.
 *
 * Extracted from useAutoSaveSettings to eliminate duplication between
 * updateField and updateFields, and to isolate the flush lifecycle.
 *
 * @internal Used only by useAutoSaveSettings
 */
export function useDebouncedSettingsSave<T extends object>(
  options: UseDebouncedSettingsSaveOptions<T>
): UseDebouncedSettingsSaveReturn<T> {
  const {
    entityId,
    debounceMs,
    status,
    flushConfig,
    customSaveRef,
    onFlushRef,
    saveImmediateRef,
    getLatestSettings,
  } = options;

  const { isCustomMode, scope, toolId, projectId } = flushConfig;
  const queryClient = useQueryClient();

  useRenderLogger(`DebouncedSettingsSave:${toolId}`, { entityId, status });

  // Refs owned by this hook
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSettingsRef = useRef<T | null>(null);
  const pendingEntityIdRef = useRef<string | null>(null);
  const editVersionRef = useRef<number>(0);

  // Track pending update (called before scheduleSave)
  const trackPendingUpdate = useCallback((settings: T, forEntityId: string | null) => {
    pendingSettingsRef.current = settings;
    pendingEntityIdRef.current = forEntityId;
  }, []);

  // Increment edit version and return current
  const incrementEditVersion = useCallback((): number => {
    editVersionRef.current += 1;
    return editVersionRef.current;
  }, []);

  // Check if there are pending edits for a given entity
  const hasPendingFor = useCallback((forEntityId: string): boolean => {
    return !!pendingSettingsRef.current && pendingEntityIdRef.current === forEntityId;
  }, []);

  // Cancel pending debounce timeout
  const cancelPendingSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, []);

  // Clear pending refs and cancel timeout (for revert/reset)
  const clearPending = useCallback(() => {
    pendingSettingsRef.current = null;
    pendingEntityIdRef.current = null;
    editVersionRef.current = 0;
    cancelPendingSave();
  }, [cancelPendingSave]);

  // Schedule a debounced save
  const scheduleSave = useCallback((_forEntityId: string | null) => {
    // During loading, don't schedule saves - just let pending tracking do its work
    if (status !== 'ready' && status !== 'saving') {
      return;
    }

    cancelPendingSave();

    const editVersionAtStart = editVersionRef.current;

    const timeoutId = setTimeout(async () => {
      try {
        // Get the LATEST settings at save time (not a captured value which could be stale)
        const latestSettings = await getLatestSettings();
        await saveImmediateRef.current(latestSettings);

        // CRITICAL: Only clear pending if no newer edits happened during the save
        // This prevents race conditions when user types fast
        if (editVersionRef.current === editVersionAtStart) {
          pendingSettingsRef.current = null;
          pendingEntityIdRef.current = null;
        }
      } catch (err) {
        handleError(err, { context: 'useDebouncedSettingsSave.debouncedSave', showToast: false });
      }
    }, debounceMs);
    saveTimeoutRef.current = timeoutId;
  }, [status, debounceMs, cancelPendingSave, getLatestSettings, saveImmediateRef]);

  /**
   * Flush pending settings on entity change/unmount.
   *
   * IMPORTANT: this runs in the *cleanup* for the previous entity render.
   * In React Query mode, we call updateToolSettingsSupabase directly with
   * the explicit entity ID to avoid drift issues.
   * In custom mode, we call the save function via ref.
   */
  useEffect(() => {
    // Capture values for this effect instance
    const currentEntityId = entityId;
    const currentScope = scope;
    const currentToolId = toolId;
    const currentIsCustomMode = isCustomMode;
    const customSave = customSaveRef.current;
    const onFlush = onFlushRef.current;

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      const pending = pendingSettingsRef.current;
      const pendingForEntity = pendingEntityIdRef.current;

      if (pending && pendingForEntity && pendingForEntity === currentEntityId) {
        if (currentIsCustomMode) {
          // Custom mode: fire-and-forget via save ref
          if (customSave) {
            customSave(pendingForEntity, pending)
              .then(() => {
                onFlush?.(pendingForEntity, pending);
              })
              .catch(err => {
                handleError(err, { context: 'useDebouncedSettingsSave.cleanupFlush', showToast: false });
              });
          }
        } else {
          // React Query mode: call updateToolSettingsSupabase directly
          updateToolSettingsSupabase({
            scope: currentScope,
            id: pendingForEntity,
            toolId: currentToolId,
            patch: pending,
          }, undefined, 'immediate')
            .then(() => {
              // CRITICAL: Invalidate the React Query cache for this entity after save completes.
              const cacheKey = currentScope === 'shot'
                ? queryKeys.settings.tool(currentToolId, projectId ?? undefined, pendingForEntity)
                : queryKeys.settings.tool(currentToolId, pendingForEntity, undefined);
              queryClient.invalidateQueries({ queryKey: cacheKey });

              // Also refetch shot-batch-settings used by useSegmentSettings
              if (currentScope === 'shot' && pendingForEntity) {
                queryClient.refetchQueries({ queryKey: queryKeys.shots.batchSettings(pendingForEntity) });
              }
            })
            .catch(err => {
              handleError(err, { context: 'useDebouncedSettingsSave.cleanupFlush', showToast: false });
            });
        }
      }

      // Always clear pending refs for the entity we are leaving
      if (pendingForEntity === currentEntityId) {
        pendingSettingsRef.current = null;
        pendingEntityIdRef.current = null;
      }
    };
    // Only re-run when entityId changes
  }, [entityId, scope, toolId, isCustomMode, projectId, queryClient, customSaveRef, onFlushRef]);

  /**
   * Handle page close/navigation - save pending settings directly.
   * This is a best-effort save; browsers typically allow ~50-100ms for async ops.
   */
  useEffect(() => {
    const customSave = customSaveRef.current;

    const handleBeforeUnload = () => {
      const pending = pendingSettingsRef.current;
      const pendingForEntity = pendingEntityIdRef.current;

      if (pending && pendingForEntity) {
        if (isCustomMode) {
          if (customSave) {
            customSave(pendingForEntity, pending).catch(err => {
              handleError(err, { context: 'useDebouncedSettingsSave.unloadFlush', showToast: false });
            });
          }
        } else {
          updateToolSettingsSupabase({
            scope,
            id: pendingForEntity,
            toolId,
            patch: pending,
          }, undefined, 'immediate').catch(err => {
            handleError(err, { context: 'useDebouncedSettingsSave.unloadFlush', showToast: false });
          });
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [toolId, scope, isCustomMode, customSaveRef]);

  return {
    scheduleSave,
    cancelPendingSave,
    clearPending,
    trackPendingUpdate,
    incrementEditVersion,
    hasPendingFor,
    pendingSettingsRef,
    pendingEntityIdRef,
    editVersionRef,
    saveTimeoutRef,
  };
}
