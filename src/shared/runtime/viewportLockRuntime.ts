import { createViewportLockService, type ViewportLockService } from '@/shared/services/viewport/viewportLockService';

let runtimeViewportLockService: ViewportLockService | null = null;

export function initializeViewportLockRuntime(service: ViewportLockService = createViewportLockService()): ViewportLockService {
  if (!runtimeViewportLockService) {
    runtimeViewportLockService = service;
  }
  return runtimeViewportLockService;
}

export function getViewportLockRuntime(): ViewportLockService {
  if (!runtimeViewportLockService) {
    // Fail-soft fallback: lazily create a runtime instance if bootstrap initialization
    // was skipped (e.g., alternate entry points).
    return initializeViewportLockRuntime();
  }
  return runtimeViewportLockService;
}
