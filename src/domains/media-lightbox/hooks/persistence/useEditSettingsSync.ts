/**
 * useEditSettingsSync Hook
 *
 * Handles bidirectional sync between persisted edit settings and
 * the active inpainting UI state. Syncs on initial load and on changes.
 *
 * Includes prompt race-condition protection: if the inpainting hook resets
 * its prompt to empty while persistence has a value, the prompt is restored
 * from persistence after a short delay.
 */

import { useRef, useEffect } from 'react';
import type { EditMode } from '../useGenerationEditSettings';

interface UseEditSettingsSyncProps {
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

interface UseEditSettingsSyncReturn {
  /** Whether initial sync from persistence to UI has completed */
  hasInitializedFromPersistence: boolean;
}

/**
 * Syncs edit settings bidirectionally between persistence layer and UI state.
 * - On load: applies persisted settings to UI (once per generation)
 * - On change: syncs UI changes back to persistence
 * - Protects against prompt race conditions (empty-reset while persistence has a value)
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
  // Track the last known good prompt to detect race-condition resets
  const lastUserPromptRef = useRef<string>('');
  // Debounce timer for prompt race-condition restoration
  const promptSyncTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset sync tracking when generation changes
  useEffect(() => {
    if (actualGenerationId !== lastSyncedGenerationIdRef.current) {
      hasInitializedFromPersistenceRef.current = false;
      lastSyncedGenerationIdRef.current = actualGenerationId ?? null;
      lastUserPromptRef.current = '';
    }
  }, [actualGenerationId]);

  // Cleanup prompt restore timer on unmount
  useEffect(() => {
    return () => {
      if (promptSyncTimerRef.current) clearTimeout(promptSyncTimerRef.current);
    };
  }, []);

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
        lastUserPromptRef.current = persistedPrompt;
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

  // Sync prompt changes with race-condition protection:
  // If inpaintPrompt is reset to empty but we had a user prompt, it's likely
  // a race condition from hook re-initialization — restore from persistence.
  useEffect(() => {
    if (!hasInitializedFromPersistenceRef.current || !isEditSettingsReady) return;

    if (inpaintPrompt === '' && lastUserPromptRef.current !== '' && persistedPrompt !== '') {
      // Restore the prompt from persistence after a short delay
      if (promptSyncTimerRef.current) clearTimeout(promptSyncTimerRef.current);
      promptSyncTimerRef.current = setTimeout(() => {
        if (persistedPrompt) {
          setInpaintPrompt(persistedPrompt);
        }
      }, 100);
      return;
    }

    if (inpaintPrompt !== persistedPrompt) {
      setPersistedPrompt(inpaintPrompt);
      lastUserPromptRef.current = inpaintPrompt;
    }
  }, [inpaintPrompt, persistedPrompt, setPersistedPrompt, setInpaintPrompt, isEditSettingsReady]);

  return {
    hasInitializedFromPersistence: hasInitializedFromPersistenceRef.current,
  };
}
