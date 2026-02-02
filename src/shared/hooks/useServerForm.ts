/**
 * useServerForm - Reusable "form over server state" pattern
 *
 * Provides local editing state on top of server data with:
 * - Local state management
 * - Dirty tracking
 * - Auto-save with debounce
 * - Unmount flush
 * - Context switching (reset on key change)
 *
 * Use this when you need to:
 * - Edit server data locally before saving
 * - Auto-save changes after a delay
 * - Reset to server state
 *
 * @example
 * ```tsx
 * const form = useServerForm({
 *   serverData: queryData,
 *   isLoading,
 *   toLocal: (server) => transformToFormState(server),
 *   save: async (local) => saveMutation(local),
 *   autoSaveMs: 500,
 *   contextKey: itemId, // Reset when switching items
 * });
 *
 * return (
 *   <input
 *     value={form.data.name}
 *     onChange={(e) => form.update({ name: e.target.value })}
 *   />
 * );
 * ```
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

export interface UseServerFormOptions<TServer, TLocal> {
  /** Server data (from React Query or other source) */
  serverData: TServer | undefined;
  /** Whether server data is still loading */
  isLoading: boolean;
  /** Transform server data to local form state */
  toLocal: (server: TServer) => TLocal;
  /** Save local state back to server. Returns true on success. */
  save: (local: TLocal) => Promise<boolean>;
  /** Auto-save debounce delay (ms). 0 = no auto-save. Default: 0 */
  autoSaveMs?: number;
  /** Key that triggers reset when changed (e.g., item ID). */
  contextKey?: string | null;
  /** Validate/transform updates before applying */
  validate?: (updates: Partial<TLocal>, current: TLocal) => Partial<TLocal>;
  /** Called when dirty state changes */
  onDirtyChange?: (isDirty: boolean) => void;
}

export interface UseServerFormReturn<TLocal> {
  /** Current form data (local edits if any, otherwise transformed server data) */
  data: TLocal;
  /** Update local state with partial values */
  update: (updates: Partial<TLocal>) => void;
  /** Save current local state to server */
  save: () => Promise<boolean>;
  /** Save specific data to server (bypasses local state) */
  saveData: (data: TLocal) => Promise<boolean>;
  /** Reset to server data (discard local edits) */
  reset: () => void;
  /** Whether there are unsaved local edits */
  isDirty: boolean;
  /** Whether server data is loading */
  isLoading: boolean;
  /** Whether local state exists (user has edited) */
  hasLocalEdits: boolean;
  /** The raw local state (null if no edits) */
  localData: TLocal | null;
}

export function useServerForm<TServer, TLocal extends Record<string, unknown>>({
  serverData,
  isLoading,
  toLocal,
  save: saveFn,
  autoSaveMs = 0,
  contextKey,
  validate,
  onDirtyChange,
}: UseServerFormOptions<TServer, TLocal>): UseServerFormReturn<TLocal> {
  // Local state for user edits (null = no edits, use server data)
  const [localData, setLocalData] = useState<TLocal | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Refs for auto-save and unmount handling
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const hasUserEdited = useRef(false);
  const saveFnRef = useRef(saveFn);
  const localDataRef = useRef<TLocal | null>(null);
  const prevContextKeyRef = useRef(contextKey);

  // Keep refs in sync with state
  useEffect(() => {
    isDirtyRef.current = isDirty;
    localDataRef.current = localData;
    saveFnRef.current = saveFn;
  }, [isDirty, localData, saveFn]);

  // Notify parent of dirty state changes
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Reset on context change (e.g., switching to different item)
  useEffect(() => {
    if (contextKey !== prevContextKeyRef.current) {
      // Clear any pending auto-save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      // Reset local state
      setLocalData(null);
      setIsDirty(false);
      hasUserEdited.current = false;
      prevContextKeyRef.current = contextKey;
    }
  }, [contextKey]);

  // Transform server data to local format (memoized)
  const transformedServer = useMemo(() => {
    if (serverData === undefined) return null;
    return toLocal(serverData);
  }, [serverData, toLocal]);

  // Current data = local edits or transformed server data
  const data = localData ?? transformedServer ?? ({} as TLocal);

  // Update local state
  const update = useCallback(
    (updates: Partial<TLocal>) => {
      setLocalData((prev) => {
        const current = prev ?? transformedServer ?? ({} as TLocal);
        const validated = validate ? validate(updates, current) : updates;
        return { ...current, ...validated };
      });
      setIsDirty(true);
      hasUserEdited.current = true;
    },
    [transformedServer, validate]
  );

  // Save to server
  const save = useCallback(async (): Promise<boolean> => {
    const dataToSave = localDataRef.current;
    if (!dataToSave) return true; // Nothing to save

    const result = await saveFnRef.current(dataToSave);
    if (result) {
      setIsDirty(false);
    }
    return result;
  }, []);

  // Save specific data (bypasses local state - useful for reset operations)
  const saveData = useCallback(async (dataToSave: TLocal): Promise<boolean> => {
    const result = await saveFnRef.current(dataToSave);
    return result;
  }, []);

  // Reset to server data
  const reset = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setLocalData(null);
    setIsDirty(false);
    hasUserEdited.current = false;
  }, []);

  // Auto-save on changes (debounced)
  useEffect(() => {
    if (!autoSaveMs || !hasUserEdited.current || !isDirty || !localData) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      await save();
    }, autoSaveMs);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [localData, isDirty, autoSaveMs, save]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      // Save if there are unsaved changes
      if (isDirtyRef.current && hasUserEdited.current && localDataRef.current) {
        saveFnRef.current(localDataRef.current);
      }
    };
  }, []); // Only run on mount/unmount

  return {
    data,
    update,
    save,
    saveData,
    reset,
    isDirty,
    isLoading,
    hasLocalEdits: localData !== null,
    localData,
  };
}
