import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface LocalStorageOptions<TFallback> {
  context: string;
  fallback: TFallback;
}

export function readLocalStorageItem(
  key: string,
  options: LocalStorageOptions<string | null>,
): string | null {
  const { context, fallback } = options;
  try {
    return localStorage.getItem(key);
  } catch (error) {
    normalizeAndPresentError(error, { context, showToast: false, logData: { key } });
    return fallback;
  }
}

export function writeLocalStorageItem(
  key: string,
  value: string,
  options: LocalStorageOptions<void>,
): void {
  const { context } = options;
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    normalizeAndPresentError(error, {
      context,
      showToast: false,
      logData: { key, valueLength: value.length },
    });
  }
}

export function removeLocalStorageItem(
  key: string,
  options: LocalStorageOptions<void>,
): void {
  const { context } = options;
  try {
    localStorage.removeItem(key);
  } catch (error) {
    normalizeAndPresentError(error, { context, showToast: false, logData: { key } });
  }
}
