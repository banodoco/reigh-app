import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

const reportedNonFatalErrors = new Set<string>();

export function reportNonFatalMobileError(key: string, error: unknown): void {
  if (reportedNonFatalErrors.has(key)) {
    return;
  }
  reportedNonFatalErrors.add(key);
  normalizeAndPresentError(error, { context: `useMobile.${key}`, showToast: false });
}
