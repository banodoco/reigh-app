import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useToolSettings } from './useToolSettings';
import { useDebouncedSettingsSave } from './useDebouncedSettingsSave';
import { deepEqual } from '@/shared/lib/deepEqual';
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
    onSaveSuccess,
    onSaveError,
    customLoadSave,
  } = options;

  const isCustomMode = !!customLoadSave;

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
  const currentEntityIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);

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
  }, [entityId, settings, isCustomMode, updateSettings, scope, onSaveSuccess, onSaveError]);

  // Ref to hold latest saveImmediate to avoid effect dependency churn
  const saveImmediateRef = useRef(saveImmediate);
  saveImmediateRef.current = saveImmediate;

  // Helper to read the latest settings from React state (via setSettings identity trick)
  const getLatestSettings = useCallback((): Promise<T> => {
    return new Promise<T>((resolve) => {
      setSettings(current => {
        resolve(current);
        return current; // Don't modify, just read
      });
    });
  }, []);

  // Debounced save sub-hook — manages scheduling, pending tracking, edit versioning, and flush effects
  const debouncedSave = useDebouncedSettingsSave<T>({
    entityId,
    debounceMs,
    status,
    flushConfig: { isCustomMode, scope, toolId, projectId },
    customSaveRef,
    onFlushRef,
    saveImmediateRef,
    getLatestSettings,
  });

  // Update single field
  const updateField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    debouncedSave.incrementEditVersion();

    setSettings(prev => {
      const updated = { ...prev, [key]: value };

      // Always track pending settings - this protects user input from being overwritten by DB load
      debouncedSave.trackPendingUpdate(updated, entityId ?? null);

      // Schedule auto-save (no-ops during loading - just keeps pending tracking)
      debouncedSave.scheduleSave(entityId ?? null);

      return updated;
    });
  }, [entityId, debouncedSave]);

  // Update multiple fields at once
  const updateFields = useCallback((updates: Partial<T>) => {
    debouncedSave.incrementEditVersion();

    setSettings(prev => {
      const updated = { ...prev, ...updates };

      // Always track pending settings - this protects user input from being overwritten by DB load
      debouncedSave.trackPendingUpdate(updated, entityId ?? null);

      // Schedule auto-save (no-ops during loading - just keeps pending tracking)
      debouncedSave.scheduleSave(entityId ?? null);

      return updated;
    });
  }, [entityId, debouncedSave]);

  // Revert to last saved settings
  const revert = useCallback(() => {
    if (loadedSettingsRef.current) {
      setSettings(loadedSettingsRef.current);
      debouncedSave.clearPending();
    }
  }, [debouncedSave]);

  // Manual save - flushes debounce immediately
  const save = useCallback(async () => {
    debouncedSave.cancelPendingSave();
    await saveImmediate();
  }, [saveImmediate, debouncedSave]);

  // Reset to defaults (or provided settings)
  const reset = useCallback((newDefaults?: T) => {
    const resetTo = newDefaults || defaults;

    setSettings(resetTo);
    loadedSettingsRef.current = JSON.parse(JSON.stringify(resetTo));
    debouncedSave.clearPending();
  }, [defaults, debouncedSave]);

  // Initialize from external source (e.g., "last used" settings) - custom mode only
  const initializeFrom = useCallback((data: Partial<T>) => {
    if (!isCustomMode) return;
    // Only apply if we don't have persisted data and aren't loading
    if (hasPersistedData || isLoadingRef.current) {
      return;
    }

    setSettings(prev => ({ ...prev, ...data }));
  }, [isCustomMode, hasPersistedData]);

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
      debouncedSave.clearPending();
      return;
    }

    // Entity changed to a different one
    if (previousEntityId && previousEntityId !== entityId) {
      // Reset for new entity
      setSettings(defaults);
      setStatus('idle');
      setHasPersistedData(false);
      loadedSettingsRef.current = null;
      debouncedSave.clearPending();
    }

    currentEntityIdRef.current = entityId;
  }, [entityId, defaults, debouncedSave]);

  // Load settings - custom mode (imperative async load)
  useEffect(() => {
    if (!isCustomMode) return;
    if (!entityId || !enabled) return;
    // Only start load from idle state - prevents duplicate loads
    if (status !== 'idle') return;

    // Don't reload if we have pending edits for this entity
    if (debouncedSave.hasPendingFor(entityId)) {
      setStatus('ready');
      // Schedule save for pending edits
      debouncedSave.cancelPendingSave();
      const toSave = debouncedSave.pendingSettingsRef.current!;
      debouncedSave.saveTimeoutRef.current = setTimeout(async () => {
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
        if (debouncedSave.hasPendingFor(entityId)) {
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
  }, [isCustomMode, entityId, enabled, status, defaults, debounceMs, debouncedSave]);

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
    if (debouncedSave.hasPendingFor(entityId)) {
      // Still transition to ready and schedule save for pending edits
      if (status !== 'ready') {
        setStatus('ready');
        // Schedule save for input that happened during loading
        debouncedSave.cancelPendingSave();
        const toSave = debouncedSave.pendingSettingsRef.current!;
        debouncedSave.saveTimeoutRef.current = setTimeout(async () => {
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
  }, [isCustomMode, entityId, rqIsLoading, dbSettings, defaults, enabled, status, debounceMs, debouncedSave]);

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
