import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { deepEqual } from '@/shared/lib/deepEqual';

/**
 * Status states for the entity state lifecycle
 */
export type EntityStateStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

/**
 * Options for useEntityState hook
 */
export interface UseEntityStateOptions<T> {
  /**
   * Unique identifier for the entity being edited.
   * When this changes, state is reset and reloaded.
   */
  entityId: string | null;

  /**
   * Load function - fetches initial data for the entity.
   * Return null if no persisted data exists (will use defaults).
   */
  load: (entityId: string) => Promise<T | null>;

  /**
   * Save function - persists data for the entity.
   */
  save: (entityId: string, data: T) => Promise<void>;

  /**
   * Default values when no persisted data exists.
   */
  defaults: T;

  /**
   * Debounce delay in milliseconds (default: 300).
   */
  debounceMs?: number;

  /**
   * Whether the hook is enabled (default: true).
   */
  enabled?: boolean;

  /**
   * Optional callback for flush on unmount/entity change.
   * Use this for cache invalidation, etc.
   */
  onFlush?: (entityId: string, data: T) => void;

  /**
   * Whether to enable detailed debug logging.
   */
  debug?: boolean;

  /**
   * Custom debug tag for logs.
   */
  debugTag?: string;

  /**
   * Callback when save completes successfully.
   */
  onSaveSuccess?: () => void;

  /**
   * Callback when save fails.
   */
  onSaveError?: (error: Error) => void;
}

/**
 * Return type for useEntityState hook
 */
export interface UseEntityStateReturn<T> {
  /** Current state (merged from loaded data + defaults) */
  state: T;

  /** Current status of the lifecycle */
  status: EntityStateStatus;

  /** The entity ID this state is confirmed for (null if not yet loaded) */
  entityId: string | null;

  /** Whether state has been modified since last save */
  isDirty: boolean;

  /** Error if status is 'error' */
  error: Error | null;

  /** Whether the entity had persisted data (vs just defaults) */
  hasPersistedData: boolean;

  /** Update a single field */
  updateField: <K extends keyof T>(key: K, value: T[K]) => void;

  /** Update multiple fields at once */
  updateFields: (updates: Partial<T>) => void;

  /** Manual save - flushes debounce immediately */
  save: () => Promise<void>;

  /** Force an immediate save (bypasses debounce) */
  saveImmediate: (dataToSave?: T) => Promise<void>;

  /** Revert to last saved state */
  revert: () => void;

  /** Reset to defaults (or provided values) */
  reset: (newDefaults?: T) => void;

  /**
   * Initialize from external source (e.g., "last used" settings).
   * Only applies if entity has no persisted data.
   */
  initializeFrom: (data: Partial<T>) => void;
}

/**
 * Generic hook for persisting entity state with auto-save.
 *
 * Features:
 * - Status machine (idle → loading → ready → saving → error)
 * - Debounced auto-save on field changes
 * - Pending refs protection (prevents loads from overwriting user input)
 * - Edit version counter (race condition detection during fast typing)
 * - Flushes pending saves on unmount/entity change
 * - Flushes on page close (beforeunload)
 * - Dirty tracking for unsaved changes indicator
 *
 * CRITICAL: During loading (status !== 'ready'), updates only affect local UI state.
 * This prevents auto-initialization effects from blocking loaded values.
 *
 * @example
 * ```typescript
 * const { state, updateField, status } = useEntityState({
 *   entityId: generationId,
 *   load: (id) => fetchFromDB(id),
 *   save: (id, data) => saveToDB(id, data),
 *   defaults: { prompt: '', mode: 'basic' },
 * });
 *
 * // Update a field (auto-saves after debounce)
 * updateField('prompt', 'new prompt');
 *
 * // Check if ready before rendering
 * if (status !== 'ready') return <Loading />;
 * ```
 */
export function useEntityState<T extends Record<string, unknown>>(
  options: UseEntityStateOptions<T>
): UseEntityStateReturn<T> {
  const {
    entityId,
    load,
    save: saveToStorage,
    defaults,
    debounceMs = 300,
    enabled = true,
    onFlush,
    debug = false,
    debugTag = '[useEntityState]',
    onSaveSuccess,
    onSaveError,
  } = options;

  // Local state - single source of truth for UI
  const [state, setState] = useState<T>(defaults);
  const [status, setStatus] = useState<EntityStateStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [hasPersistedData, setHasPersistedData] = useState(false);

  // Refs for tracking state without triggering re-renders
  const loadedStateRef = useRef<T | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingStateRef = useRef<T | null>(null);
  const pendingEntityIdRef = useRef<string | null>(null);
  const currentEntityIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);

  // Edit version counter - increments on each edit, used to detect if newer edits happened during save
  const editVersionRef = useRef<number>(0);

  // Stable refs for callbacks to avoid effect dependency churn
  const loadRef = useRef(load);
  const saveToStorageRef = useRef(saveToStorage);
  const onFlushRef = useRef(onFlush);
  loadRef.current = load;
  saveToStorageRef.current = saveToStorage;
  onFlushRef.current = onFlush;

  // Dirty flag - has user changed anything since load?
  const isDirty = useMemo(
    () => (loadedStateRef.current ? !deepEqual(state, loadedStateRef.current) : false),
    [state]
  );

  // Save implementation
  const saveImmediate = useCallback(async (dataToSave?: T): Promise<void> => {
    if (!entityId) {
      if (debug) {
        console.warn(`${debugTag} Cannot save - no entity selected`);
      }
      return;
    }

    const toSave = dataToSave ?? state;

    // Don't save if nothing changed
    if (deepEqual(toSave, loadedStateRef.current)) {
      if (debug) {
        console.log(`${debugTag} ⏭️ Skipping save - no changes`);
      }
      return;
    }

    if (debug) {
      console.log(`${debugTag} 💾 Saving state:`, {
        entityId: entityId.substring(0, 8),
      });
    }

    setStatus('saving');

    try {
      await saveToStorageRef.current(entityId, toSave);

      // Update our "clean" reference
      loadedStateRef.current = JSON.parse(JSON.stringify(toSave));
      setHasPersistedData(true);

      setStatus('ready');
      setError(null);

      if (debug) {
        console.log(`${debugTag} ✅ Save successful`);
      }

      onSaveSuccess?.();
    } catch (err) {
      console.error(`${debugTag} ❌ Save failed:`, err);
      setStatus('error');
      setError(err as Error);
      onSaveError?.(err as Error);
      throw err;
    }
  }, [entityId, state, debug, debugTag, onSaveSuccess, onSaveError]);

  // Ref to hold latest saveImmediate
  const saveImmediateRef = useRef(saveImmediate);
  saveImmediateRef.current = saveImmediate;

  /**
   * Flush pending state on entity change/unmount.
   */
  useEffect(() => {
    const currentEntityIdValue = entityId;

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      const pending = pendingStateRef.current;
      const pendingForEntity = pendingEntityIdRef.current;

      if (pending && pendingForEntity && pendingForEntity === currentEntityIdValue) {
        if (debug) {
          console.log(`${debugTag} 🚿 Flushing pending save in cleanup:`, {
            entityId: pendingForEntity.substring(0, 8),
          });
        }

        // Fire-and-forget; cleanup cannot be async
        saveToStorageRef.current(pendingForEntity, pending)
          .then(() => {
            onFlushRef.current?.(pendingForEntity, pending);
            if (debug) {
              console.log(`${debugTag} ✅ Cleanup flush succeeded`);
            }
          })
          .catch(err => {
            console.error(`${debugTag} Cleanup flush failed:`, err);
          });
      }

      // Clear pending refs for the entity we are leaving
      if (pendingForEntity === currentEntityIdValue) {
        pendingStateRef.current = null;
        pendingEntityIdRef.current = null;
      }
    };
  }, [entityId, debug, debugTag]);

  /**
   * Handle page close/navigation - save pending state directly.
   */
  useEffect(() => {
    const handleBeforeUnload = () => {
      const pending = pendingStateRef.current;
      const pendingForEntity = pendingEntityIdRef.current;

      if (pending && pendingForEntity) {
        if (debug) {
          console.log(`${debugTag} 🚿 Flushing pending save on page unload:`, {
            entityId: pendingForEntity.substring(0, 8),
          });
        }

        // Fire-and-forget save
        saveToStorageRef.current(pendingForEntity, pending).catch(err => {
          console.error(`${debugTag} Unload flush failed:`, err);
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [debug, debugTag]);

  // Update single field
  const updateField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    // Increment edit version
    editVersionRef.current += 1;
    const editVersionAtStart = editVersionRef.current;

    setState(prev => {
      const updated = { ...prev, [key]: value };

      // Always track pending state - protects user input from being overwritten by load
      pendingStateRef.current = updated;
      pendingEntityIdRef.current = entityId ?? null;

      // During loading, don't schedule saves - just update local state
      if (status !== 'ready' && status !== 'saving') {
        if (debug) {
          console.log(`${debugTag} 📝 updateField during loading - UI only (protected):`, {
            key,
            status,
          });
        }
        return updated;
      }

      // Trigger auto-save with debounce
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      const timeoutId = setTimeout(async () => {
        try {
          // Get the LATEST state at save time
          const latestState = await new Promise<T>((resolve) => {
            setState(current => {
              resolve(current);
              return current;
            });
          });

          await saveImmediateRef.current(latestState);

          // Only clear pending if no newer edits happened during the save
          if (editVersionRef.current === editVersionAtStart) {
            pendingStateRef.current = null;
            pendingEntityIdRef.current = null;
          }
        } catch (err) {
          console.error(`${debugTag} Debounced save failed:`, err);
        }
      }, debounceMs);
      saveTimeoutRef.current = timeoutId;

      return updated;
    });
  }, [status, debounceMs, entityId, debug, debugTag]);

  // Update multiple fields at once
  const updateFields = useCallback((updates: Partial<T>) => {
    editVersionRef.current += 1;
    const editVersionAtStart = editVersionRef.current;

    setState(prev => {
      const updated = { ...prev, ...updates };

      pendingStateRef.current = updated;
      pendingEntityIdRef.current = entityId ?? null;

      if (status !== 'ready' && status !== 'saving') {
        if (debug) {
          console.log(`${debugTag} 📝 updateFields during loading - UI only (protected):`, {
            keys: Object.keys(updates),
            status,
          });
        }
        return updated;
      }

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      const timeoutId = setTimeout(async () => {
        try {
          const latestState = await new Promise<T>((resolve) => {
            setState(current => {
              resolve(current);
              return current;
            });
          });

          await saveImmediateRef.current(latestState);

          if (editVersionRef.current === editVersionAtStart) {
            pendingStateRef.current = null;
            pendingEntityIdRef.current = null;
          }
        } catch (err) {
          console.error(`${debugTag} Debounced save failed:`, err);
        }
      }, debounceMs);
      saveTimeoutRef.current = timeoutId;

      return updated;
    });
  }, [status, debounceMs, entityId, debug, debugTag]);

  // Revert to last saved state
  const revert = useCallback(() => {
    if (loadedStateRef.current) {
      if (debug) {
        console.log(`${debugTag} ↩️ Reverting to last saved state`);
      }
      setState(loadedStateRef.current);
      pendingStateRef.current = null;
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

  // Reset to defaults (or provided values)
  const reset = useCallback((newDefaults?: T) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const resetTo = newDefaults || defaults;
    if (debug) {
      console.log(`${debugTag} 🔄 Resetting to defaults`);
    }

    setState(resetTo);
    loadedStateRef.current = JSON.parse(JSON.stringify(resetTo));
    pendingStateRef.current = null;
    pendingEntityIdRef.current = null;
    editVersionRef.current = 0;
  }, [defaults, debug, debugTag]);

  // Initialize from external source (e.g., "last used" settings)
  const initializeFrom = useCallback((data: Partial<T>) => {
    // Only apply if we don't have persisted data and aren't loading
    if (hasPersistedData || isLoadingRef.current) {
      if (debug) {
        console.log(`${debugTag} ⏭️ Skipping initializeFrom - has persisted data or loading`);
      }
      return;
    }

    if (debug) {
      console.log(`${debugTag} 🔄 Initializing from external source`);
    }

    setState(prev => ({ ...prev, ...data }));
  }, [hasPersistedData, debug, debugTag]);

  // Handle entity changes - reset state
  useEffect(() => {
    const previousEntityId = currentEntityIdRef.current;

    if (!entityId) {
      currentEntityIdRef.current = null;
      setState(defaults);
      setStatus('idle');
      setHasPersistedData(false);
      loadedStateRef.current = null;
      pendingStateRef.current = null;
      pendingEntityIdRef.current = null;
      editVersionRef.current = 0;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      return;
    }

    if (previousEntityId && previousEntityId !== entityId) {
      if (debug) {
        console.log(`${debugTag} 🔄 Entity changed:`, {
          from: previousEntityId.substring(0, 8),
          to: entityId.substring(0, 8),
        });
      }

      setState(defaults);
      setStatus('idle');
      setHasPersistedData(false);
      loadedStateRef.current = null;
      pendingStateRef.current = null;
      pendingEntityIdRef.current = null;
      editVersionRef.current = 0;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    }

    currentEntityIdRef.current = entityId;
  }, [entityId, defaults, debug, debugTag]);

  // Load state from storage
  useEffect(() => {
    if (!entityId || !enabled) return;
    // Only start load from idle state - prevents duplicate loads
    if (status !== 'idle') return;

    // Don't reload if we have pending edits for this entity
    if (pendingStateRef.current && pendingEntityIdRef.current === entityId) {
      if (debug) {
        console.log(`${debugTag} ⏳ Skipping load - user has pending edits`);
      }
      setStatus('ready');
      // Schedule save for pending edits
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      const toSave = pendingStateRef.current;
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveImmediateRef.current(toSave);
        } catch (err) {
          console.error(`${debugTag} Pending save failed:`, err);
        }
      }, debounceMs);
      return;
    }

    setStatus('loading');
    isLoadingRef.current = true;

    loadRef.current(entityId)
      .then(loaded => {
        // Check if entity changed during load
        if (currentEntityIdRef.current !== entityId) {
          return;
        }

        // Check again for pending edits (user may have typed during load)
        if (pendingStateRef.current && pendingEntityIdRef.current === entityId) {
          if (debug) {
            console.log(`${debugTag} ⏳ Load completed but user has pending edits - keeping user input`);
          }
          setStatus('ready');
          isLoadingRef.current = false;
          return;
        }

        if (loaded) {
          const mergedState = { ...defaults, ...loaded };
          const cloned = JSON.parse(JSON.stringify(mergedState));

          if (debug) {
            console.log(`${debugTag} 📥 Loaded from storage:`, {
              entityId: entityId.substring(0, 8),
            });
          }

          setState(cloned);
          loadedStateRef.current = JSON.parse(JSON.stringify(cloned));
          setHasPersistedData(true);
        } else {
          if (debug) {
            console.log(`${debugTag} ⚠️ No persisted data found, using defaults`);
          }
          setState(defaults);
          loadedStateRef.current = JSON.parse(JSON.stringify(defaults));
          setHasPersistedData(false);
        }

        setStatus('ready');
        isLoadingRef.current = false;
        setError(null);
      })
      .catch(err => {
        console.error(`${debugTag} ❌ Load failed:`, err);
        setStatus('error');
        isLoadingRef.current = false;
        setError(err as Error);
      });
  }, [entityId, enabled, status, defaults, debounceMs, debug, debugTag]);

  return useMemo(() => ({
    state,
    status,
    entityId: currentEntityIdRef.current,
    isDirty,
    error,
    hasPersistedData,
    updateField,
    updateFields,
    save,
    saveImmediate,
    revert,
    reset,
    initializeFrom,
  }), [state, status, isDirty, error, hasPersistedData, updateField, updateFields, save, saveImmediate, revert, reset, initializeFrom]);
}
