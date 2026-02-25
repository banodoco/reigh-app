import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRenderLogger } from '@/shared/lib/debug/debugRendering';
import { updateToolSettingsSupabase } from '@/shared/hooks/useToolSettings';
import { queryKeys } from '@/shared/lib/queryKeys';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

type AutoSaveStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

interface UseDebouncedSettingsSaveOptions<T> {
  /** Current entity ID */
  entityId: string | null;
  /** Debounce delay in ms */
  debounceMs: number;
  /** Current hook status - saves are only scheduled when 'ready' or 'saving' */
  status: AutoSaveStatus;
  /** Whether using custom load/save mode (vs React Query mode) */
  isCustomMode: boolean;
  /** Settings scope for React Query mode flush */
  scope: 'shot' | 'project';
  /** Tool identifier for React Query mode flush */
  toolId: string;
  /** Project ID for React Query cache invalidation */
  projectId?: string | null;
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
    isCustomMode,
    scope,
    toolId,
    projectId,
    customSaveRef,
    onFlushRef,
    saveImmediateRef,
    getLatestSettings,
  } = options;

  const queryClient = useQueryClient();

  useRenderLogger(`DebouncedSettingsSave:${toolId}`, { entityId, status });

  // Refs owned by this hook
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSettingsRef = useRef<T | null>(null);
  const pendingEntityIdRef = useRef<string | null>(null);
  const editVersionRef = useRef<number>(0);

  // Ref for status so scheduleSave can read it at call time without depending on it.
  // This is critical for reference stability: without it, scheduleSave changes on every
  // status transition (ready→saving→ready), cascading through the entire settings tree.
  const statusRef = useRef(status);
  statusRef.current = status;

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
  // Uses statusRef instead of status to avoid recreating on every status transition.
  // The status check is a guard ("don't save while loading") — reading the latest
  // value at call time via ref is more correct than capturing it at creation time.
  const scheduleSave = useCallback((_forEntityId: string | null) => {
    // During loading, don't schedule saves - just let pending tracking do its work
    const currentStatus = statusRef.current;
    if (currentStatus !== 'ready' && currentStatus !== 'saving') {
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
        normalizeAndPresentError(err, { context: 'useDebouncedSettingsSave.debouncedSave', showToast: false });
      }
    }, debounceMs);
    saveTimeoutRef.current = timeoutId;
  }, [debounceMs, cancelPendingSave, getLatestSettings, saveImmediateRef]);

  /**
   * Fire-and-forget flush of pending settings to DB.
   * Used by both entity-change cleanup and beforeunload handlers.
   */
  const flushPendingSettings = useCallback((
    pending: T,
    pendingForEntity: string,
    flushScope: 'shot' | 'project',
    flushToolId: string,
    flushIsCustomMode: boolean,
    customSave: ((entityId: string, data: T) => Promise<void>) | undefined,
    onFlush: ((entityId: string, data: T) => void) | undefined,
    context: string,
  ) => {
    if (flushIsCustomMode) {
      if (customSave) {
        customSave(pendingForEntity, pending)
          .then(() => { onFlush?.(pendingForEntity, pending); })
          .catch(err => { normalizeAndPresentError(err, { context, showToast: false }); });
      }
    } else {
      updateToolSettingsSupabase({
        scope: flushScope,
        id: pendingForEntity,
        toolId: flushToolId,
        patch: pending,
      }, undefined, 'immediate')
        .then(() => {
          const cacheKey = flushScope === 'shot'
            ? queryKeys.settings.tool(flushToolId, projectId ?? undefined, pendingForEntity)
            : queryKeys.settings.tool(flushToolId, pendingForEntity, undefined);
          queryClient.invalidateQueries({ queryKey: cacheKey });
          if (flushScope === 'shot' && pendingForEntity) {
            queryClient.refetchQueries({ queryKey: queryKeys.shots.batchSettings(pendingForEntity) });
          }
        })
        .catch(err => { normalizeAndPresentError(err, { context, showToast: false }); });
    }
  }, [projectId, queryClient]);

  // Flush pending settings on entity change/unmount
  useEffect(() => {
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
        flushPendingSettings(
          pending, pendingForEntity, currentScope, currentToolId,
          currentIsCustomMode, customSave, onFlush,
          'useDebouncedSettingsSave.cleanupFlush',
        );
      }

      if (pendingForEntity === currentEntityId) {
        pendingSettingsRef.current = null;
        pendingEntityIdRef.current = null;
      }
    };
  }, [entityId, scope, toolId, isCustomMode, projectId, queryClient, customSaveRef, onFlushRef, flushPendingSettings]);

  // Flush on page close/navigation (best-effort, ~50-100ms budget)
  useEffect(() => {
    const customSave = customSaveRef.current;

    const handleBeforeUnload = () => {
      const pending = pendingSettingsRef.current;
      const pendingForEntity = pendingEntityIdRef.current;
      if (pending && pendingForEntity) {
        flushPendingSettings(
          pending, pendingForEntity, scope, toolId,
          isCustomMode, customSave, undefined,
          'useDebouncedSettingsSave.unloadFlush',
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [toolId, scope, isCustomMode, customSaveRef, flushPendingSettings]);

  // Memoize return to prevent object recreation on every render.
  // Without this, every effect/callback depending on `debouncedSave` would re-run
  // on every render, cascading re-renders through the entire settings tree.
  return useMemo(() => ({
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
  }), [scheduleSave, cancelPendingSave, clearPending, trackPendingUpdate, incrementEditVersion, hasPendingFor]);
}
