import { useState, useCallback, useRef, useMemo } from 'react';
import { useToolSettings } from '@/shared/hooks/settings/useToolSettings';
import { useRenderLogger } from '@/shared/lib/debug/debugRendering';
import { useDebouncedSettingsSave } from '@/shared/settings/hooks/useDebouncedSettingsSave';
import { deepEqual } from '@/shared/lib/utils/deepEqual';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { useCustomModeLoad, useReactQueryModeLoad } from '@/shared/settings/hooks/autoSaveSettingsLoaders';
import {
  applyEntityChangeState,
  applyLoadedDataState,
  transitionReadyWithPendingSave,
} from '@/shared/settings/hooks/autoSaveSettingsHelpers';

/**
 * Status states for the auto-save settings lifecycle.
 */
type AutoSaveStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

/**
 * Custom load/save functions for non-React-Query persistence.
 */
interface CustomLoadSave<T> {
  load: (entityId: string) => Promise<T | null>;
  save: (entityId: string, data: T) => Promise<void>;
  entityId: string | null;
  onFlush?: (entityId: string, data: T) => void;
}

interface UseAutoSaveSettingsOptions<T> {
  toolId?: string;
  shotId?: string | null;
  projectId?: string | null;
  scope?: 'shot' | 'project';
  debounceMs?: number;
  defaults: T;
  enabled?: boolean;
  debug?: boolean;
  debugTag?: string;
  onSaveSuccess?: () => void;
  onSaveError?: (error: Error) => void;
  customLoadSave?: CustomLoadSave<T>;
}

interface UseAutoSaveSettingsReturn<T> {
  settings: T;
  status: AutoSaveStatus;
  entityId: string | null;
  isDirty: boolean;
  error: Error | null;
  hasShotSettings: boolean;
  hasPersistedData: boolean;
  updateField: <K extends keyof T>(key: K, value: T[K]) => void;
  updateFields: (updates: Partial<T>) => void;
  save: () => Promise<void>;
  saveImmediate: (dataToSave?: T) => Promise<void>;
  revert: () => void;
  reset: (newDefaults?: T) => void;
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
export function useAutoSaveSettings<T extends object>(
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
  const [status, setStatusRaw] = useState<AutoSaveStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [hasPersistedData, setHasPersistedData] = useState(false);

  // Ref for status — load effects read this instead of depending on `status` directly.
  // This prevents unnecessary effect re-runs on every status transition (idle→loading→ready→saving).
  // Updated both at render time and immediately when setStatus is called, so effects
  // running in the same commit (after entity-change) see the correct value.
  const statusRef = useRef(status);
  statusRef.current = status;
  const setStatus = useCallback((s: AutoSaveStatus) => {
    setStatusRaw(s);
    statusRef.current = s;
  }, []);

  useRenderLogger(`AutoSaveSettings:${toolId}`, { entityId, status });

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

  // Refs for React Query state — read by entity-change effect to detect cache hits
  // without adding reactive query values to its deps (which would re-run on every refetch).
  const rqIsLoadingRef = useRef(rqIsLoading);
  rqIsLoadingRef.current = rqIsLoading;
  const dbSettingsRef = useRef(dbSettings);
  dbSettingsRef.current = dbSettings;

  // Dirty flag - has user changed anything since load?
  const isDirty = useMemo(
    () => (loadedSettingsRef.current ? !deepEqual(settings, loadedSettingsRef.current) : false),
    [settings]
  );

  // Ref for current settings — used by saveImmediate to avoid capturing `settings`
  // in the closure, which would make saveImmediate unstable (recreated on every settings change).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Save implementation
  // Uses currentEntityIdRef instead of entityId to keep this callback stable across entity changes.
  // This prevents cascading re-renders through the entire settings/context tree on navigation.
  const saveImmediate = useCallback(async (settingsToSave?: T): Promise<void> => {
    const currentEntityId = currentEntityIdRef.current;
    if (!currentEntityId) {
      return;
    }

    const toSave = settingsToSave ?? settingsRef.current;

    // Don't save if nothing changed
    if (deepEqual(toSave, loadedSettingsRef.current)) {
      return;
    }

    setStatus('saving');

    try {
      if (isCustomMode) {
        await customSaveRef.current!(currentEntityId, toSave);
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
      normalizeAndPresentError(err, { context: 'useAutoSaveSettings.save', showToast: false });
      setStatus('error');
      setError(err as Error);
      onSaveError?.(err as Error);
      throw err;
    }
  }, [isCustomMode, updateSettings, scope, onSaveSuccess, onSaveError]);

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
    isCustomMode,
    scope,
    toolId,
    projectId,
    customSaveRef,
    onFlushRef,
    saveImmediateRef,
    getLatestSettings,
  });

  // Update single field
  // Uses currentEntityIdRef instead of entityId to keep this callback stable across entity changes.
  const updateField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    debouncedSave.incrementEditVersion();

    setSettings(prev => {
      const updated = { ...prev, [key]: value };

      // Always track pending settings - this protects user input from being overwritten by DB load
      debouncedSave.trackPendingUpdate(updated, currentEntityIdRef.current);

      // Schedule auto-save (no-ops during loading - just keeps pending tracking)
      debouncedSave.scheduleSave(currentEntityIdRef.current);

      return updated;
    });
  }, [debouncedSave]);

  // Update multiple fields at once
  // Uses currentEntityIdRef instead of entityId to keep this callback stable across entity changes.
  const updateFields = useCallback((updates: Partial<T>) => {
    debouncedSave.incrementEditVersion();

    setSettings(prev => {
      const updated = { ...prev, ...updates };

      // Always track pending settings - this protects user input from being overwritten by DB load
      debouncedSave.trackPendingUpdate(updated, currentEntityIdRef.current);

      // Schedule auto-save (no-ops during loading - just keeps pending tracking)
      debouncedSave.scheduleSave(currentEntityIdRef.current);

      return updated;
    });
  }, [debouncedSave]);

  // Revert to last saved settings
  const revert = useCallback(() => {
    if (loadedSettingsRef.current) {
      setSettings(loadedSettingsRef.current);
      debouncedSave.clearPending();
    }
  }, [debouncedSave]);

  // Manual save - flushes debounce immediately
  // Uses saveImmediateRef to avoid depending on saveImmediate directly
  const save = useCallback(async () => {
    debouncedSave.cancelPendingSave();
    await saveImmediateRef.current();
  }, [debouncedSave]);

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

  const transitionPendingLoadSave = useCallback(() => {
    transitionReadyWithPendingSave({
      setStatus,
      debouncedSave,
      saveImmediateRef,
      debounceMs,
    });
  }, [setStatus, debouncedSave, saveImmediateRef, debounceMs]);

  const applyLoadedData = useCallback((data: T, hadPersistedData: boolean) => {
    applyLoadedDataState({
      data,
      hadPersistedData,
      isCustomMode,
      setSettings,
      loadedSettingsRef,
      setHasPersistedData,
      setStatus,
      setError,
    });
  }, [isCustomMode, setSettings, loadedSettingsRef, setHasPersistedData, setStatus, setError]);

  const previousEntityId = currentEntityIdRef.current;
  applyEntityChangeState({
    entityId,
    previousEntityId,
    currentEntityIdRef,
    defaults,
    isCustomMode,
    rqIsLoading: rqIsLoadingRef.current,
    dbSettings: dbSettingsRef.current,
    setSettings,
    setStatus,
    setHasPersistedData,
    loadedSettingsRef,
    setError,
  });

  // Load settings - custom mode (imperative async load)
  useCustomModeLoad({
    isCustomMode,
    entityId,
    enabled,
    statusRef,
    defaults,
    debouncedSave,
    customLoadRef,
    currentEntityIdRef,
    isLoadingRef,
    transitionReadyWithPendingSave: transitionPendingLoadSave,
    applyLoadedData,
    setStatus,
    setError,
  });

  // Load settings - React Query mode (reactive from useToolSettings)
  useReactQueryModeLoad({
    isCustomMode,
    entityId,
    enabled,
    statusRef,
    defaults,
    dbSettings,
    rqIsLoading,
    debouncedSave,
    loadedSettingsRef,
    transitionReadyWithPendingSave: transitionPendingLoadSave,
    setSettings,
    setStatus,
    setError,
  });

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
