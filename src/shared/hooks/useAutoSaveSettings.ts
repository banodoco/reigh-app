import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useToolSettings } from './useToolSettings';
import { useRenderLogger } from '@/shared/lib/debugRendering';
import { useDebouncedSettingsSave } from './useDebouncedSettingsSave';
import { deepEqual } from '@/shared/lib/deepEqual';
import { handleError } from '@/shared/lib/errorHandling/handleError';

/**
 * Status states for the auto-save settings lifecycle.
 *
 * State machine:
 *   idle → loading → ready ⇄ saving
 *                  ↘ error ↗
 *   Entity change: any → idle (flush pending first via useDebouncedSettingsSave cleanup)
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

// ============================================================================
// Load sub-hooks (extracted for readability)
// ============================================================================

/** Custom mode load: imperatively fetches settings via customLoadSave.load(). */
function useCustomModeLoad<T extends object>(ctx: {
  isCustomMode: boolean;
  entityId: string | null;
  enabled: boolean;
  statusRef: React.MutableRefObject<AutoSaveStatus>;
  defaults: T;
  debounceMs: number;
  debouncedSave: ReturnType<typeof useDebouncedSettingsSave<T>>;
  customLoadRef: React.MutableRefObject<((entityId: string) => Promise<T | null>) | undefined>;
  currentEntityIdRef: React.MutableRefObject<string | null>;
  isLoadingRef: React.MutableRefObject<boolean>;
  transitionReadyWithPendingSave: () => void;
  applyLoadedData: (data: T, hadPersistedData: boolean) => void;
  setStatus: (s: AutoSaveStatus) => void;
  setError: (e: Error | null) => void;
}) {
  const {
    isCustomMode, entityId, enabled, statusRef, defaults, debouncedSave,
    customLoadRef, currentEntityIdRef, isLoadingRef,
    transitionReadyWithPendingSave, applyLoadedData, setStatus, setError,
  } = ctx;

  useEffect(() => {
    if (!isCustomMode) return;
    if (!entityId || !enabled) return;
    // Accept both 'idle' (first mount) and 'loading' (entity change)
    // Uses statusRef to avoid depending on status and re-running on every transition.
    if (statusRef.current !== 'idle' && statusRef.current !== 'loading') return;

    if (debouncedSave.hasPendingFor(entityId)) {
      transitionReadyWithPendingSave();
      return;
    }

    setStatus('loading');
    isLoadingRef.current = true;

    customLoadRef.current!(entityId)
      .then(loaded => {
        if (currentEntityIdRef.current !== entityId) return;

        if (debouncedSave.hasPendingFor(entityId)) {
          isLoadingRef.current = false;
          transitionReadyWithPendingSave();
          return;
        }

        isLoadingRef.current = false;
        applyLoadedData(
          loaded ? { ...defaults, ...loaded } : defaults,
          !!loaded
        );
      })
      .catch(err => {
        handleError(err, { context: 'useAutoSaveSettings.load', showToast: false });
        setStatus('error');
        isLoadingRef.current = false;
        setError(err as Error);
      });
    // statusRef used instead of status to prevent re-running on every status transition.
    // The guard reads statusRef.current at execution time, which is more correct than
    // capturing status at effect creation time.
  }, [isCustomMode, entityId, enabled, defaults, debouncedSave]);
}

/** React Query mode load: reactively syncs from useToolSettings query data. */
function useReactQueryModeLoad<T extends object>(ctx: {
  isCustomMode: boolean;
  entityId: string | null;
  enabled: boolean;
  statusRef: React.MutableRefObject<AutoSaveStatus>;
  defaults: T;
  toolId: string;
  dbSettings: T | undefined;
  rqIsLoading: boolean;
  debounceMs: number;
  debouncedSave: ReturnType<typeof useDebouncedSettingsSave<T>>;
  loadedSettingsRef: React.MutableRefObject<T | null>;
  transitionReadyWithPendingSave: () => void;
  setSettings: React.Dispatch<React.SetStateAction<T>>;
  setStatus: (s: AutoSaveStatus) => void;
  setError: (e: Error | null) => void;
}) {
  const {
    isCustomMode, entityId, enabled, statusRef, defaults, toolId,
    dbSettings, rqIsLoading, debouncedSave, loadedSettingsRef,
    transitionReadyWithPendingSave, setSettings, setStatus, setError,
  } = ctx;

  useEffect(() => {
    if (isCustomMode) return;
    if (!entityId || !enabled) {
      return;
    }

    // Use statusRef.current throughout — this lets us remove `status` from deps,
    // preventing the effect from re-running on every status transition.
    const currentStatus = statusRef.current;

    if (rqIsLoading) {
      if (currentStatus === 'idle') {
        setStatus('loading');
      }
      return;
    }

    if (currentStatus === 'saving') return;

    if (debouncedSave.hasPendingFor(entityId)) {
      if (currentStatus !== 'ready') {
        transitionReadyWithPendingSave();
      }
      return;
    }

    const loadedSettings: T = {
      ...defaults,
      ...(dbSettings || {}),
    };

    const clonedSettings = JSON.parse(JSON.stringify(loadedSettings));

    if (loadedSettingsRef.current && deepEqual(clonedSettings, loadedSettingsRef.current)) {
      if (currentStatus !== 'ready') {
        setStatus('ready');
      }
      return;
    }

    setSettings(clonedSettings);
    loadedSettingsRef.current = JSON.parse(JSON.stringify(clonedSettings));
    setStatus('ready');
    setError(null);
    // statusRef used instead of status to prevent re-running on every status transition.
    // The effect only needs to react to query data changes (rqIsLoading, dbSettings),
    // entity changes, and enabled/defaults changes — not internal status transitions.
  }, [isCustomMode, entityId, rqIsLoading, dbSettings, defaults, enabled, debouncedSave]);
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
      handleError(err, { context: 'useAutoSaveSettings.save', showToast: false });
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

  // ---------------------------------------------------------------------------
  // Shared load-apply helpers (used by both custom and React Query load effects)
  // ---------------------------------------------------------------------------

  /** Transition to ready and schedule a debounced save for pending edits. */
  const transitionReadyWithPendingSave = () => {
    setStatus('ready');
    debouncedSave.cancelPendingSave();
    const toSave = debouncedSave.pendingSettingsRef.current!;
    debouncedSave.saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveImmediateRef.current(toSave);
      } catch (err) {
        handleError(err, { context: 'useAutoSaveSettings.pendingSave', showToast: false });
      }
    }, debounceMs);
  };

  /** Apply loaded settings to state and transition to ready. */
  const applyLoadedData = (data: T, hadPersistedData: boolean) => {
    const cloned = JSON.parse(JSON.stringify(data));
    setSettings(cloned);
    loadedSettingsRef.current = JSON.parse(JSON.stringify(cloned));
    if (isCustomMode) {
      setHasPersistedData(hadPersistedData);
    }
    setStatus('ready');
    setError(null);
  };

  // Handle entity changes during render (not in an effect).
  // This prevents the "stale frame" where the previous entity's settings flash briefly.
  // React will discard the current render and re-render with the new state before painting.
  // See: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  //
  // NOTE: We intentionally do NOT call debouncedSave.clearPending() here.
  // The flush-on-entity-change cleanup in useDebouncedSettingsSave handles flushing
  // pending saves for the old entity and clearing refs — calling clearPending here
  // would null out the refs before the flush effect gets to read them.
  const previousEntityId = currentEntityIdRef.current;
  if (entityId !== previousEntityId) {
    currentEntityIdRef.current = entityId;

    if (!entityId) {
      // Entity cleared — reset to idle
      setSettings(defaults);
      setStatus('idle');
      setHasPersistedData(false);
      loadedSettingsRef.current = null;
    } else if (previousEntityId) {
      // Navigating from one entity to another
      setHasPersistedData(false);

      // Fast path: if React Query already has cached data for the new entity,
      // skip the loading transition entirely. This prevents the visible
      // defaults→loading→ready flash when navigating between previously-visited shots.
      // dbSettingsRef/rqIsLoadingRef are updated from useToolSettings earlier in this render,
      // so they already reflect the new entity's cache state.
      if (!isCustomMode && !rqIsLoadingRef.current && dbSettingsRef.current) {
        const loaded = { ...defaults, ...(dbSettingsRef.current as Record<string, unknown>) } as T;
        const cloned = JSON.parse(JSON.stringify(loaded));
        setSettings(cloned);
        loadedSettingsRef.current = JSON.parse(JSON.stringify(cloned));
        setStatus('ready');
        setError(null);
      } else {
        // Slow path: data not cached, show loading state
        setSettings(defaults);
        setStatus('loading');
        loadedSettingsRef.current = null;
      }
    }
    // else: entityId went from null to a value (first mount) — load effects handle initial load
  }

  // Load settings - custom mode (imperative async load)
  useCustomModeLoad({
    isCustomMode,
    entityId,
    enabled,
    statusRef,
    defaults,
    debounceMs,
    debouncedSave,
    customLoadRef,
    currentEntityIdRef,
    isLoadingRef,
    transitionReadyWithPendingSave,
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
    toolId,
    dbSettings,
    rqIsLoading,
    debounceMs,
    debouncedSave,
    loadedSettingsRef,
    transitionReadyWithPendingSave,
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
