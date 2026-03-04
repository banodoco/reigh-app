/** Typed custom event helpers for cross-component window events. */

import { useEffect } from 'react';

export interface AppCustomEvents {
  // --- UI / navigation ---
  openSettings: { tab?: string };
  'app:scrollToTop': { behavior?: ScrollBehavior };
  mobilePaneOpen: { side: string | null };
  openGenerationsPane: void;
  openGenerationModal: void;
  closeGenerationModal: void;

  // --- Generation / gallery ---
  'generation-star-updated': { generationId: string; shotId: string; starred: boolean };
  'generation-settings-changed': void;
  'videogallery-cache-updated': { projectId: string; updatedUrls: string[] };
  mobileSelectionActive: boolean;

  // --- Shot lifecycle ---
  'shot-pending-create': { imageCount: number };
  'shot-pending-create-clear': void;
  'shot-pending-upload': { shotId: string; expectedCount: number; operationId: string };
  'shot-pending-upload-succeeded': { shotId: string; operationId: string };
  'shot-pending-upload-failed': { shotId: string; operationId: string };

  // --- Timeline ---
  'timeline:duplicate-complete': { shotId: string; newItemId: string };
  'timeline:pending-add': { frame: number; shotId?: string };

  // --- Editor ---
  shotEditorRecovery: { shotId?: string; reason: string };

  // --- Persistence ---
  persistentStateChange: { key: string; value: unknown };

  // --- Realtime infrastructure ---
  'realtime:auth-heal': {
    source: string;
    reason: string;
    priority: string;
    coalescedSources: string[];
    coalescedReasons: string[];
    timestamp: number;
  };
  'realtime:generation-update-batch': {
    payloads: Array<{ generationId: string; upscaleCompleted?: boolean }>;
  };
  'realtime:variant-change-batch': {
    affectedGenerationIds: string[];
  };
}

type VoidEvents = { [K in keyof AppCustomEvents]: AppCustomEvents[K] extends void ? K : never }[keyof AppCustomEvents];

export function dispatchAppEvent<K extends VoidEvents>(type: K): void;
export function dispatchAppEvent<K extends keyof AppCustomEvents>(
  type: K,
  detail: AppCustomEvents[K],
): void;
export function dispatchAppEvent<K extends keyof AppCustomEvents>(
  type: K,
  detail?: AppCustomEvents[K],
): void {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

export function useAppEventListener<K extends keyof AppCustomEvents>(
  type: K,
  handler: (detail: AppCustomEvents[K]) => void,
): void {
  useEffect(() => {
    const listener = (event: Event) => {
      handler((event as CustomEvent<AppCustomEvents[K]>).detail);
    };

    window.addEventListener(type, listener);
    return () => window.removeEventListener(type, listener);
  }, [type, handler]);
}

export function listenAppEvent<K extends keyof AppCustomEvents>(
  type: K,
  handler: (detail: AppCustomEvents[K]) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<AppCustomEvents[K]>).detail);
  };
  window.addEventListener(type, listener);
  return () => window.removeEventListener(type, listener);
}
