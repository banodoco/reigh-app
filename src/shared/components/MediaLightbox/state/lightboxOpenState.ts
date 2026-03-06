import { useSyncExternalStore } from 'react';

type Listener = () => void;

let openCount = 0;
const listeners = new Set<Listener>();

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

function getSnapshot(): boolean {
  return openCount > 0;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function acquireLightboxOpenState(): () => void {
  openCount += 1;
  notifyListeners();

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    openCount = Math.max(0, openCount - 1);
    notifyListeners();
  };
}

export function useLightboxOpenState(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function __resetLightboxOpenStateForTests(): void {
  openCount = 0;
  notifyListeners();
}
