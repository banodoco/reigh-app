import {
  getToastManager as getRuntimeToastManager,
  initializeToastManager,
  resetToastManagerForTests as resetRuntimeToastManagerForTests,
} from '@/shared/runtime/toastRuntime';

export function initializeUiToastManager() {
  return initializeToastManager();
}

export function getToastManager() {
  return getRuntimeToastManager();
}

export function resetToastManagerForTests(): void {
  resetRuntimeToastManagerForTests();
}
