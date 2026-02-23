import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

interface UseServerFormOptions<TServer, TLocal> {
  serverData: TServer | undefined;
  isLoading: boolean;
  toLocal: (server: TServer) => TLocal;
  save: (local: TLocal) => Promise<boolean>;
  autoSaveMs?: number;
  contextKey?: string | null;
  validate?: (updates: Partial<TLocal>, current: TLocal) => Partial<TLocal>;
  onDirtyChange?: (isDirty: boolean) => void;
}

interface UseServerFormReturn<TLocal> {
  data: TLocal;
  update: (updates: Partial<TLocal>) => void;
  save: () => Promise<boolean>;
  saveData: (data: TLocal) => Promise<boolean>;
  reset: () => void;
  isDirty: boolean;
  isLoading: boolean;
  hasLocalEdits: boolean;
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
  const [localData, setLocalData] = useState<TLocal | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const hasUserEdited = useRef(false);
  const saveFnRef = useRef(saveFn);
  const localDataRef = useRef<TLocal | null>(null);
  const prevContextKeyRef = useRef(contextKey);

  useEffect(() => {
    isDirtyRef.current = isDirty;
    localDataRef.current = localData;
    saveFnRef.current = saveFn;
  }, [isDirty, localData, saveFn]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (contextKey !== prevContextKeyRef.current) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      setLocalData(null);
      setIsDirty(false);
      hasUserEdited.current = false;
      prevContextKeyRef.current = contextKey;
    }
  }, [contextKey]);

  const transformedServer = useMemo(() => {
    if (serverData === undefined) return null;
    return toLocal(serverData);
  }, [serverData, toLocal]);

  const data = localData ?? transformedServer ?? ({} as TLocal);

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

  const save = useCallback(async (): Promise<boolean> => {
    const dataToSave = localDataRef.current;
    if (!dataToSave) return true;

    const result = await saveFnRef.current(dataToSave);
    if (result) {
      setIsDirty(false);
    }
    return result;
  }, []);

  const saveData = useCallback(async (dataToSave: TLocal): Promise<boolean> => {
    const result = await saveFnRef.current(dataToSave);
    return result;
  }, []);

  const reset = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setLocalData(null);
    setIsDirty(false);
    hasUserEdited.current = false;
  }, []);

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

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      if (isDirtyRef.current && hasUserEdited.current && localDataRef.current) {
        saveFnRef.current(localDataRef.current);
      }
    };
  }, []);

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
