import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface AsyncOperationOptions {
  context?: string;
  showToast?: boolean;
  toastTitle?: string;
}

interface UseAsyncOperationReturn<T> {
  isLoading: boolean;
  error: Error | null;
  execute: (
    operation: () => Promise<T>,
    options?: AsyncOperationOptions
  ) => Promise<T | undefined>;
  clearError: () => void;
}

interface UseAsyncOperationMapReturn<T> {
  isLoading: (key: string) => boolean;
  getError: (key: string) => Error | null;
  execute: (
    key: string,
    operation: () => Promise<T>,
    options?: AsyncOperationOptions
  ) => Promise<T | undefined>;
  clearError: (key: string) => void;
}

export function useAsyncOperation<T = void>(): UseAsyncOperationReturn<T> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const execute = useCallback(async (
    operation: () => Promise<T>,
    options: AsyncOperationOptions = {}
  ): Promise<T | undefined> => {
    const { context, showToast = true, toastTitle } = options;

    if (!isMountedRef.current) return undefined;

    setIsLoading(true);
    setError(null);

    try {
      const result = await operation();
      if (isMountedRef.current) {
        setIsLoading(false);
      }
      return result;
    } catch (errorValue) {
      const error = errorValue instanceof Error ? errorValue : new Error(String(errorValue));
      if (isMountedRef.current) {
        setError(error);
        setIsLoading(false);
      }
      normalizeAndPresentError(error, { context: context ?? 'useAsyncOperation', showToast, toastTitle });
      return undefined;
    }
  }, []);

  return { isLoading, error, execute, clearError };
}

export function useAsyncOperationMap<T = void>(): UseAsyncOperationMapReturn<T> {
  const [loadingMap, setLoadingMap] = useState<Map<string, boolean>>(new Map());
  const [errorMap, setErrorMap] = useState<Map<string, Error>>(new Map());
  const isMountedRef = useRef(true);
  const loadingMapRef = useRef(loadingMap);
  const errorMapRef = useRef(errorMap);

  loadingMapRef.current = loadingMap;
  errorMapRef.current = errorMap;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isLoading = useCallback((key: string) => loadingMapRef.current.get(key) ?? false, []);
  const getError = useCallback((key: string) => errorMapRef.current.get(key) ?? null, []);

  const execute = useCallback(async (
    key: string,
    operation: () => Promise<T>,
    options: AsyncOperationOptions = {}
  ): Promise<T | undefined> => {
    const { context, showToast = true, toastTitle } = options;

    if (!isMountedRef.current) return undefined;

    setLoadingMap((previous) => new Map(previous).set(key, true));
    setErrorMap((previous) => {
      const next = new Map(previous);
      next.delete(key);
      return next;
    });

    try {
      const result = await operation();
      if (isMountedRef.current) {
        setLoadingMap((previous) => {
          const next = new Map(previous);
          next.delete(key);
          return next;
        });
      }
      return result;
    } catch (errorValue) {
      const error = errorValue instanceof Error ? errorValue : new Error(String(errorValue));
      if (isMountedRef.current) {
        setErrorMap((previous) => new Map(previous).set(key, error));
        setLoadingMap((previous) => {
          const next = new Map(previous);
          next.delete(key);
          return next;
        });
      }
      normalizeAndPresentError(error, { context: context ?? 'useAsyncOperationMap', showToast, toastTitle });
      return undefined;
    }
  }, []);

  const clearError = useCallback((key: string) => {
    setErrorMap((previous) => {
      const next = new Map(previous);
      next.delete(key);
      return next;
    });
  }, []);

  return { isLoading, getError, execute, clearError };
}
