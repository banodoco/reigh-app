import { Toast } from '@base-ui/react/toast';

type ToastManager = ReturnType<typeof Toast.createToastManager>;

let runtimeToastManager: ToastManager | null = null;

export function initializeToastManager(): ToastManager {
  if (!runtimeToastManager) {
    runtimeToastManager = Toast.createToastManager();
  }
  return runtimeToastManager;
}

export function getToastManager(): ToastManager {
  if (!runtimeToastManager) {
    throw new Error('Toast runtime is not initialized. Call initializeToastManager() during app bootstrap.');
  }
  return runtimeToastManager;
}
