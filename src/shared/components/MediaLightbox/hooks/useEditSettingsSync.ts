/**
 * useEditSettingsSync Hook
 *
 * Handles bidirectional sync between persisted edit settings and
 * the active inpainting UI state. Syncs on initial load and on changes.
 */

import { useRef, useEffect } from 'react';
import type { EditMode } from './useGenerationEditSettings';

export interface UseEditSettingsSyncProps {
  /** Current generation ID for tracking changes */
  actualGenerationId: string | undefined;
  /** Whether edit settings are ready to use */
  isEditSettingsReady: boolean;
  /** Whether there are persisted settings for this generation */
  hasPersistedSettings: boolean;

  // Persisted values
  persistedEditMode: EditMode | undefined;
  persistedNumGenerations: number | undefined;
  persistedPrompt: string | undefined;

  // Current UI values
  editMode: EditMode;
  inpaintNumGenerations: number;
  inpaintPrompt: string;

  // Setters for UI values
  setEditMode: (mode: EditMode) => void;
  setInpaintNumGenerations: (num: number) => void;
  setInpaintPrompt: (prompt: string) => void;

  // Setters for persisted values
  setPersistedEditMode: (mode: EditMode) => void;
  setPersistedNumGenerations: (num: number) => void;
  setPersistedPrompt: (prompt: string) => void;
}

export interface UseEditSettingsSyncReturn {
  /** Whether initial sync from persistence to UI has completed */
  hasInitializedFromPersistence: boolean;
}

/**
 * Syncs edit settings bidirectionally between persistence layer and UI state.
 * - On load: applies persisted settings to UI (once per generation)
 * - On change: syncs UI changes back to persistence
 */
export function useEditSettingsSync({
  actualGenerationId,
  isEditSettingsReady,
  hasPersistedSettings,
  persistedEditMode,
  persistedNumGenerations,
  persistedPrompt,
  editMode,
  inpaintNumGenerations,
  inpaintPrompt,
  setEditMode,
  setInpaintNumGenerations,
  setInpaintPrompt,
  setPersistedEditMode,
  setPersistedNumGenerations,
  setPersistedPrompt,
}: UseEditSettingsSyncProps): UseEditSettingsSyncReturn {
  // Track if we've synced initial values from persistence to inpainting
  const hasInitializedFromPersistenceRef = useRef(false);
  const lastSyncedGenerationIdRef = useRef<string | null>(null);

  // Reset sync tracking when generation changes
  useEffect(() => {
    if (actualGenerationId !== lastSyncedGenerationIdRef.current) {
      hasInitializedFromPersistenceRef.current = false;
      lastSyncedGenerationIdRef.current = actualGenerationId ?? null;
    }
  }, [actualGenerationId]);

  // Initialize inpainting state from persisted/lastUsed settings (once per generation)
  // IMPORTANT: Wait for isEditSettingsReady to ensure effective values are computed correctly
  useEffect(() => {
    if (
      isEditSettingsReady &&
      !hasInitializedFromPersistenceRef.current &&
      actualGenerationId
    ) {
      hasInitializedFromPersistenceRef.current = true;

      // Sync edit mode
      if (persistedEditMode && persistedEditMode !== editMode) {
        setEditMode(persistedEditMode);
      }

      // Sync numGenerations
      if (persistedNumGenerations && persistedNumGenerations !== inpaintNumGenerations) {
        setInpaintNumGenerations(persistedNumGenerations);
      }

      // Sync prompt (only if has persisted settings - otherwise leave empty)
      if (hasPersistedSettings && persistedPrompt && persistedPrompt !== inpaintPrompt) {
        setInpaintPrompt(persistedPrompt);
      }
    }
  }, [
    isEditSettingsReady,
    actualGenerationId,
    hasPersistedSettings,
    persistedEditMode,
    persistedNumGenerations,
    persistedPrompt,
    editMode,
    inpaintNumGenerations,
    inpaintPrompt,
    setEditMode,
    setInpaintNumGenerations,
    setInpaintPrompt,
  ]);

  // Sync changes FROM inpainting TO persistence (debounced via the persistence hook)
  useEffect(() => {
    if (!hasInitializedFromPersistenceRef.current || !isEditSettingsReady) return;

    // Sync editMode changes
    if (editMode !== persistedEditMode) {
      setPersistedEditMode(editMode);
    }
  }, [editMode, persistedEditMode, setPersistedEditMode, isEditSettingsReady]);

  useEffect(() => {
    if (!hasInitializedFromPersistenceRef.current || !isEditSettingsReady) return;

    // Sync numGenerations changes
    if (inpaintNumGenerations !== persistedNumGenerations) {
      setPersistedNumGenerations(inpaintNumGenerations);
    }
  }, [inpaintNumGenerations, persistedNumGenerations, setPersistedNumGenerations, isEditSettingsReady]);

  useEffect(() => {
    if (!hasInitializedFromPersistenceRef.current || !isEditSettingsReady) return;

    // Sync prompt changes
    if (inpaintPrompt !== persistedPrompt) {
      setPersistedPrompt(inpaintPrompt);
    }
  }, [inpaintPrompt, persistedPrompt, setPersistedPrompt, isEditSettingsReady]);

  return {
    hasInitializedFromPersistence: hasInitializedFromPersistenceRef.current,
  };
}
