import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToolSettings, updateToolSettingsSupabase } from './useToolSettings';
import { deepEqual } from '@/shared/lib/deepEqual';
import { queryKeys } from '@/shared/lib/queryKeys';
import { handleError } from '@/shared/lib/errorHandler';

/**
 * Status states for the auto-save settings lifecycle
 */
type AutoSaveStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

/**
 * Custom load/save functions for non-React-Query persistence.
 * When provided, the hook uses these instead of useToolSettings.
 */
interface CustomLoadSave<T> {
  /** Load data for the given entity. Return null if no persisted data exists. */
  load: (entityId: string) => Promise<T | null>;
  /** Save data for the given entity. */
  save: (entityId: string, data: T) => Promise<void>;
  /** The entity ID to load/save for. When this changes, state is reset and reloaded. */
  entityId: string | null;
  /** Optional callback after flush on unmount/entity change (e.g., cache invalidation). */
  onFlush?: (entityId: string, data: T) => void;
}

/**
 * Options for useAutoSaveSettings hook
 */
interface UseAutoSaveSettingsOptions<T> {
  /** Tool identifier for storage (used with React Query mode) */
  toolId?: string;
  /** Shot ID for shot-scoped settings */
  shotId?: string | null;
  /** Project ID for project-scoped settings */
  projectId?: string | null;
  /** Scope of settings - determines which DB column is used */
  scope?: 'shot' | 'project';
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Default settings when none exist in DB */
  defaults: T;
  /** Whether the hook is enabled (default: true) */
  enabled?: boolean;
  /** Whether to enable detailed debug logging */
  debug?: boolean;
  /** Custom debug tag for logs (default: [useAutoSaveSettings:toolId]) */
  debugTag?: string;
  /** Callback when save completes successfully */
  onSaveSuccess?: () => void;
  /** Callback when save fails */
  onSaveError?: (error: Error) => void;
  /**
   * When provided, uses custom load/save functions instead of React Query.
   * This replaces the former useEntityState hook.
   */
  customLoadSave?: CustomLoadSave<T>;
}

/**
 * Return type for useAutoSaveSettings hook
 */
interface UseAutoSaveSettingsReturn<T> {
  /** Current settings (merged from DB + defaults) */
  settings: T;
  /** Current status of the settings lifecycle */
  status: AutoSaveStatus;
  /** The entity ID these settings are confirmed for (null if not yet loaded) */
  entityId: string | null;
  /** Whether settings have been modified since last save */
  isDirty: boolean;
  /** Error if status is 'error' */
  error: Error | null;
  /** Whether the shot had settings stored in DB (vs just defaults/project settings) */
  hasShotSettings: boolean;
  /** Whether the entity had persisted data (vs just defaults). Same as hasShotSettings for React Query mode. */
  hasPersistedData: boolean;

  /** Update a single field */
  updateField: <K extends keyof T>(key: K, value: T[K]) => void;
  /** Update multiple fields at once */
  updateFields: (updates: Partial<T>) => void;
  /** Manual save - flushes debounce immediately */
  save: () => Promise<void>;
  /** Force an immediate save (bypasses debounce) */
  saveImmediate: (dataToSave?: T) => Promise<void>;
  /** Revert to last saved settings */
  revert: () => void;
  /** Reset to defaults (or provided settings) */
  reset: (newDefaults?: T) => void;
  /**
   * Initialize from external source (e.g., "last used" settings).
   * Only applies if entity has no persisted data and isn't loading.
   * Only available in customLoadSave mode; no-op otherwise.
   */
  initializeFrom: (data: Partial<T>) => void;
}

/**
 * Recommended hook for auto-saving settings to the database.
 *
 * This is the default choice for new features that need persisted settings.
 * Builds on `useToolSettings` (cascade resolution) and adds auto-save, dirty tracking,
 * entity-change handling, and unmount flushing.
 *
 * Features:
 * - Loads settings from DB with scope cascade (defaults -> user -> project -> shot)
 * - Debounced auto-save on field changes (default 300ms)
 * - Flushes pending saves on unmount/navigation
 * - Dirty tracking for unsaved changes indicator
 * - Status machine for loading states
 * - Optional customLoadSave mode for non-React-Query persistence
 *
 * CRITICAL: During loading (status !== 'ready'), updates only affect local UI state.
 * This prevents auto-initialization effects from blocking DB values.
 *
 * @see docs/structure_detail/settings_system.md for the full settings hook decision tree
 *
 * @example
 * ```typescript
 * // React Query mode (tool settings)
 * const settings = useAutoSaveSettings({
 *   toolId: 'my-tool',
 *   shotId: selectedShotId,
 *   scope: 'shot',
 *   defaults: { prompt: '', mode: 'basic' },
 * });
 *
 * // Custom load/save mode
 * const settings = useAutoSaveSettings({
 *   defaults: { prompt: '', mode: 'basic' },
 *   customLoadSave: {
 *     entityId: generationId,
 *     load: (id) => fetchFromDB(id),
 *     save: (id, data) => saveToDB(id, data),
 *   },
 * });
 *
 * // Update a field (auto-saves after debounce)
 * settings.updateField('prompt', 'new prompt');
 *
 * // Check if ready before rendering
 * if (settings.status !== 'ready') return <Loading />;
 * ```
 */
export function useAutoSaveSettings<T extends Record<string, unknown>>(
  options: UseAutoSaveSettingsOptions<T>
): UseAutoSaveSettingsReturn<T> {
  const {
    toolId = '',
    shotId,
    projectId,
    scope = 'shot',
    debounceMs = 300,
    defaults,
    enabled = true,
    debug = false,
    debugTag = `[useAutoSaveSettings:${toolId}]`,
    onSaveSuccess,
    onSaveError,
    customLoadSave,
  } = options;

  const isCustomMode = !!customLoadSave;
  const queryClient = useQueryClient();

  // Determine the entity ID based on mode
  const entityId = isCustomMode
    ? customLoadSave.entityId
    : (scope === 'shot' ? shotId : projectId) ?? null;
  const isEntityValid = !!entityId;

  // Local state - single source of truth for UI
  const [settings, setSettings] = useState<T>(defaults);
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [hasPersistedData, setHasPersistedData] = useState(false);

  // Refs for tracking state without triggering re-renders
  const loadedSettingsRef = useRef<T | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSettingsRef = useRef<T | null>(null);
  const pendingEntityIdRef = useRef<string | null>(null);
  const currentEntityIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);

  // Edit version counter - increments on each edit, used to detect if newer edits happened during save
  const editVersionRef = useRef<number>(0);

  // Stable refs for custom callbacks to avoid effect dependency churn
  const customLoadRef = useRef(customLoadSave?.load);
  const customSaveRef = useRef(customLoadSave?.save);
  const onFlushRef = useRef(customLoadSave?.onFlush);
  customLoadRef.current = customLoadSave?.load;
  customSaveRef.current = customLoadSave?.save;
  onFlushRef.current = customLoadSave?.onFlush;

  // Fetch settings from database (React Query mode only)
  const {
    settings: dbSettings,
    isLoading: rqIsLoading,
    update: updateSettings,
    hasShotSettings,
  } = useToolSettings<T>(toolId, {
    shotId: scope === 'shot' ? (shotId || undefined) : undefined,
    projectId: projectId || undefined,
    enabled: !isCustomMode && enabled && isEntityValid,
  });

  // Dirty flag - has user changed anything since load?
  const isDirty = useMemo(
    () => (loadedSettingsRef.current ? !deepEqual(settings, loadedSettingsRef.current) : false),
    [settings]
  );

  // Save implementation
  const saveImmediate = useCallback(async (settingsToSave?: T): Promise<void> => {
    if (!entityId) {
      return;
    }

    const toSave = settingsToSave ?? settings;

    // Don't save if nothing changed
    if (deepEqual(toSave, loadedSettingsRef.current)) {
      return;
    }

    setStatus('saving');

    try {
      if (isCustomMode) {
        await customSaveRef.current!(entityId, toSave);
      } else {
        await updateSettings(scope, toSave);
      }

      // Update our "clean" reference
      loadedSettingsRef.current = JSON.parse(JSON.stringify(toSave));

      if (isCustomMode) {
        setHasPersistedData(true);
      }

      // NOTE: Don't clear pendingSettingsRef here - it's now handled in the timeout callback
      // with edit version checking to avoid race conditions when user types fast

      setStatus('ready');
      setError(null);

      onSaveSuccess?.();
    } catch (err) {
      handleError(err, { context: 'useAutoSaveSettings.save', showToast: false });
      setStatus('error');
      setError(err as Error);
      onSaveError?.(err as Error);
      throw err;
    }
  }, [entityId, settings, isCustomMode, updateSettings, scope, toolId, debug, debugTag, onSaveSuccess, onSaveError]);

  // Ref to hold latest saveImmediate to avoid effect dependency churn
  const saveImmediateRef = useRef(saveImmediate);
  saveImmediateRef.current = saveImmediate;

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
          customSaveRef.current!(pendingForEntity, pending)
            .then(() => {
              onFlushRef.current?.(pendingForEntity, pending);
            })
            .catch(err => {
              handleError(err, { context: 'useAutoSaveSettings.cleanupFlush', showToast: false });
            });
        } else {
          // React Query mode: call updateToolSettingsSupabase directly
          // Use 'immediate' mode to bypass debounce - we need to flush NOW
          updateToolSettingsSupabase({
            scope: currentScope,
            id: pendingForEntity,
            toolId: currentToolId,
            patch: pending,
          }, undefined, 'immediate')
            .then(() => {
              // CRITICAL: Invalidate the React Query cache for this entity after save completes.
              const cacheKey = currentScope === 'shot'
                ? queryKeys.settings.tool(currentToolId, projectId, pendingForEntity)
                : queryKeys.settings.tool(currentToolId, pendingForEntity, undefined);
              queryClient.invalidateQueries({ queryKey: cacheKey });

              // Also refetch shot-batch-settings used by useSegmentSettings
              if (currentScope === 'shot' && pendingForEntity) {
                queryClient.refetchQueries({ queryKey: queryKeys.shots.batchSettings(pendingForEntity) });
              }
            })
            .catch(err => {
              handleError(err, { context: 'useAutoSaveSettings.cleanupFlush', showToast: false });
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
  }, [entityId, scope, toolId, isCustomMode, projectId, queryClient, debug, debugTag]);

  /**
   * Handle page close/navigation - save pending settings directly.
   * This is a best-effort save; browsers typically allow ~50-100ms for async ops.
   */
  useEffect(() => {
    const handleBeforeUnload = () => {
      const pending = pendingSettingsRef.current;
      const pendingForEntity = pendingEntityIdRef.current;

      if (pending && pendingForEntity) {
        if (isCustomMode) {
          customSaveRef.current!(pendingForEntity, pending).catch(err => {
            handleError(err, { context: 'useAutoSaveSettings.unloadFlush', showToast: false });
          });
        } else {
          // Use 'immediate' mode to bypass debounce - page is closing
          updateToolSettingsSupabase({
            scope,
            id: pendingForEntity,
            toolId,
            patch: pending,
          }, undefined, 'immediate').catch(err => {
            handleError(err, { context: 'useAutoSaveSettings.unloadFlush', showToast: false });
          });
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [toolId, scope, isCustomMode, debug, debugTag]);

  // Update single field
  const updateField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    // Increment edit version - allows detecting if newer edits happened during save
    editVersionRef.current += 1;
    const editVersionAtStart = editVersionRef.current;

    setSettings(prev => {
      const updated = { ...prev, [key]: value };

      // Always track pending settings - this protects user input from being overwritten by DB load
      pendingSettingsRef.current = updated;
      pendingEntityIdRef.current = entityId ?? null;

      // During loading, don't schedule saves - just update local state
      // The pending ref will prevent DB load from overwriting user input
      if (status !== 'ready' && status !== 'saving') {
        return updated;
      }

      // Trigger auto-save with debounce
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      const timeoutId = setTimeout(async () => {
        try {
          // Get the LATEST settings at save time (not the captured 'updated' which could be stale)
          const latestSettings = await new Promise<T>((resolve) => {
            setSettings(current => {
              resolve(current);
              return current; // Don't modify, just read
            });
          });

          await saveImmediateRef.current(latestSettings);

          // CRITICAL: Only clear pending if no newer edits happened during the save
          // This prevents race conditions when user types fast
          if (editVersionRef.current === editVersionAtStart) {
            pendingSettingsRef.current = null;
            pendingEntityIdRef.current = null;
          }
        } catch (err) {
          handleError(err, { context: 'useAutoSaveSettings.debouncedSave', showToast: false });
        }
      }, debounceMs);
      saveTimeoutRef.current = timeoutId;

      return updated;
    });
  }, [status, debounceMs, entityId, debug, debugTag]);

  // Update multiple fields at once
  const updateFields = useCallback((updates: Partial<T>) => {
    // Increment edit version - allows detecting if newer edits happened during save
    editVersionRef.current += 1;
    const editVersionAtStart = editVersionRef.current;

    setSettings(prev => {
      const updated = { ...prev, ...updates };

      // Always track pending settings - this protects user input from being overwritten by DB load
      pendingSettingsRef.current = updated;
      pendingEntityIdRef.current = entityId ?? null;

      // During loading, don't schedule saves - just update local state
      if (status !== 'ready' && status !== 'saving') {
        return updated;
      }

      // Trigger auto-save with debounce
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      const timeoutId = setTimeout(async () => {
        try {
          // Get the LATEST settings at save time (not the captured 'updated' which could be stale)
          const latestSettings = await new Promise<T>((resolve) => {
            setSettings(current => {
              resolve(current);
              return current; // Don't modify, just read
            });
          });

          await saveImmediateRef.current(latestSettings);

          // CRITICAL: Only clear pending if no newer edits happened during the save
          // This prevents race conditions when user types fast
          if (editVersionRef.current === editVersionAtStart) {
            pendingSettingsRef.current = null;
            pendingEntityIdRef.current = null;
          }
        } catch (err) {
          handleError(err, { context: 'useAutoSaveSettings.debouncedSave', showToast: false });
        }
      }, debounceMs);
      saveTimeoutRef.current = timeoutId;

      return updated;
    });
  }, [status, debounceMs, entityId, debug, debugTag]);

  // Revert to last saved settings
  const revert = useCallback(() => {
    if (loadedSettingsRef.current) {
      setSettings(loadedSettingsRef.current);
      pendingSettingsRef.current = null;
      pendingEntityIdRef.current = null;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    }
  }, [debug, debugTag]);

  // Manual save - flushes debounce immediately
  const save = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    await saveImmediate();
  }, [saveImmediate]);

  // Reset to defaults (or provided settings)
  const reset = useCallback((newDefaults?: T) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const resetTo = newDefaults || defaults;

    setSettings(resetTo);
    loadedSettingsRef.current = JSON.parse(JSON.stringify(resetTo));
    pendingSettingsRef.current = null;
    pendingEntityIdRef.current = null;
    editVersionRef.current = 0;
  }, [defaults, debug, debugTag]);

  // Initialize from external source (e.g., "last used" settings) - custom mode only
  const initializeFrom = useCallback((data: Partial<T>) => {
    if (!isCustomMode) return;
    // Only apply if we don't have persisted data and aren't loading
    if (hasPersistedData || isLoadingRef.current) {
      return;
    }

    setSettings(prev => ({ ...prev, ...data }));
  }, [isCustomMode, hasPersistedData, debug, debugTag]);

  // Handle entity changes - flush and reset
  useEffect(() => {
    const previousEntityId = currentEntityIdRef.current;

    if (!entityId) {
      // Reset state
      currentEntityIdRef.current = null;
      setSettings(defaults);
      setStatus('idle');
      setHasPersistedData(false);
      loadedSettingsRef.current = null;
      pendingSettingsRef.current = null;
      pendingEntityIdRef.current = null;
      editVersionRef.current = 0;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      return;
    }

    // Entity changed to a different one
    if (previousEntityId && previousEntityId !== entityId) {

      // Reset for new entity
      setSettings(defaults);
      setStatus('idle');
      setHasPersistedData(false);
      loadedSettingsRef.current = null;
      pendingSettingsRef.current = null;
      pendingEntityIdRef.current = null;
      editVersionRef.current = 0;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    }

    currentEntityIdRef.current = entityId;
  }, [entityId, defaults, debug, debugTag]);

  // Load settings - custom mode (imperative async load)
  useEffect(() => {
    if (!isCustomMode) return;
    if (!entityId || !enabled) return;
    // Only start load from idle state - prevents duplicate loads
    if (status !== 'idle') return;

    // Don't reload if we have pending edits for this entity
    if (pendingSettingsRef.current && pendingEntityIdRef.current === entityId) {
      setStatus('ready');
      // Schedule save for pending edits
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      const toSave = pendingSettingsRef.current;
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveImmediateRef.current(toSave);
        } catch (err) {
          handleError(err, { context: 'useAutoSaveSettings.pendingSave', showToast: false });
        }
      }, debounceMs);
      return;
    }

    setStatus('loading');
    isLoadingRef.current = true;

    customLoadRef.current!(entityId)
      .then(loaded => {
        // Check if entity changed during load
        if (currentEntityIdRef.current !== entityId) {
          return;
        }

        // Check again for pending edits (user may have typed during load)
        if (pendingSettingsRef.current && pendingEntityIdRef.current === entityId) {
          setStatus('ready');
          isLoadingRef.current = false;
          return;
        }

        if (loaded) {
          const mergedState = { ...defaults, ...loaded };
          const cloned = JSON.parse(JSON.stringify(mergedState));

          setSettings(cloned);
          loadedSettingsRef.current = JSON.parse(JSON.stringify(cloned));
          setHasPersistedData(true);
        } else {
          setSettings(defaults);
          loadedSettingsRef.current = JSON.parse(JSON.stringify(defaults));
          setHasPersistedData(false);
        }

        setStatus('ready');
        isLoadingRef.current = false;
        setError(null);
      })
      .catch(err => {
        handleError(err, { context: 'useAutoSaveSettings.load', showToast: false });
        setStatus('error');
        isLoadingRef.current = false;
        setError(err as Error);
      });
  }, [isCustomMode, entityId, enabled, status, defaults, debounceMs, debug, debugTag]);

  // Load settings - React Query mode (reactive from useToolSettings)
  useEffect(() => {
    if (isCustomMode) return;
    if (!entityId || !enabled) return;

    // Show loading state while fetching
    if (rqIsLoading) {
      if (status === 'idle') {
        setStatus('loading');
      }
      return;
    }

    // Don't overwrite if we're in the middle of saving
    if (status === 'saving') {
      return;
    }

    // Don't overwrite if user has pending edits for THIS entity (debounce hasn't fired yet)
    // This prevents React Query refetches from "unwriting" user input
    // IMPORTANT: We now protect pending edits even on first load - losing user's typing
    // is worse than the theoretical risk of saving defaults over DB values
    if (pendingSettingsRef.current && pendingEntityIdRef.current === entityId) {
      // Still transition to ready and schedule save for pending edits
      if (status !== 'ready') {
        setStatus('ready');
        // Schedule save for input that happened during loading
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        const toSave = pendingSettingsRef.current;
        saveTimeoutRef.current = setTimeout(async () => {
          try {
            await saveImmediateRef.current(toSave);
          } catch (err) {
            handleError(err, { context: 'useAutoSaveSettings.pendingSave', showToast: false });
          }
        }, debounceMs);
      }
      return;
    }

    // Apply settings from DB
    // Note: dbSettings comes from useToolSettings which already merges in priority order:
    // defaults -> user -> project -> shot (via deepMerge). We layer local defaults on top
    // only as a fallback for fields not present in the merged settings.
    const loadedSettings: T = {
      ...defaults,
      ...(dbSettings || {}),
    };

    // Deep clone to prevent React Query cache reference sharing
    const clonedSettings = JSON.parse(JSON.stringify(loadedSettings));

    // Avoid setState loops when dbSettings identity changes but values don't.
    if (loadedSettingsRef.current && deepEqual(clonedSettings, loadedSettingsRef.current)) {
      if (status !== 'ready') {
        setStatus('ready');
      }
      return;
    }

    // No pending edits for this entity - safe to apply DB settings

    setSettings(clonedSettings);
    loadedSettingsRef.current = JSON.parse(JSON.stringify(clonedSettings));
    setStatus('ready');
    setError(null);
  }, [isCustomMode, entityId, rqIsLoading, dbSettings, defaults, enabled, status, toolId, debounceMs, debug, debugTag]);

  // Memoize return value to prevent object recreation on every render
  // NOTE: entityId uses currentEntityIdRef.current which is a ref value, so it updates
  // without triggering memo recalculation. Consumers should check status === 'ready'
  // alongside entityId to ensure settings are actually loaded for that entity.
  return useMemo(() => ({
    settings,
    status,
    entityId: currentEntityIdRef.current,
    isDirty,
    error,
    hasShotSettings: isCustomMode ? hasPersistedData : hasShotSettings,
    hasPersistedData: isCustomMode ? hasPersistedData : hasShotSettings,
    updateField,
    updateFields,
    save,
    saveImmediate,
    revert,
    reset,
    initializeFrom,
  }), [settings, status, isDirty, error, isCustomMode, hasPersistedData, hasShotSettings, updateField, updateFields, save, saveImmediate, revert, reset, initializeFrom]);
}
