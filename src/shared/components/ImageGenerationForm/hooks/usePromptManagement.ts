/**
 * usePromptManagement - Manages prompts, master prompt, and prompt mode
 *
 * Handles:
 * - Prompts (shot-specific or project-level fallback)
 * - Master prompt for automated mode
 * - Prompt mode (automated vs managed)
 * - Before/after prompt text
 * - Routes to shot settings when a shot is selected
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { toast } from '@/shared/components/ui/sonner';
import { PromptEntry, PromptMode, ImageGenShotSettings } from '../types';
import { SHOT_FILTER } from '@/shared/constants/filterConstants';

// ============================================================================
// Types
// ============================================================================

interface UsePromptManagementProps {
  // Shot context
  associatedShotId: string | null;
  effectiveShotId: string;

  // Shot settings hook
  shotPromptSettings: {
    entityId: string | null;
    status: string;
    settings: ImageGenShotSettings;
    updateField: <K extends keyof ImageGenShotSettings>(field: K, value: ImageGenShotSettings[K]) => void;
  };

  // Project-level state (for no-shot mode)
  noShotPrompts: PromptEntry[];
  setNoShotPrompts: React.Dispatch<React.SetStateAction<PromptEntry[]>>;
  noShotMasterPrompt: string;
  setNoShotMasterPrompt: React.Dispatch<React.SetStateAction<string>>;
  promptMode: PromptMode;
  setPromptMode: React.Dispatch<React.SetStateAction<PromptMode>>;
  beforeEachPromptText: string;
  setBeforeEachPromptText: React.Dispatch<React.SetStateAction<string>>;
  afterEachPromptText: string;
  setAfterEachPromptText: React.Dispatch<React.SetStateAction<string>>;

  // Persistence
  ready: boolean;
  markAsInteracted: () => void;

  // Prompt ID generation
  generatePromptId: () => string;
  // Ref for prompt ID counter (shared with generatePromptId, used for dedup)
  promptIdCounter: React.MutableRefObject<number>;
}

interface UsePromptManagementReturn {
  // Computed state (routes to shot or project)
  prompts: PromptEntry[];
  masterPromptText: string;
  effectivePromptMode: PromptMode;
  currentBeforePromptText: string;
  currentAfterPromptText: string;
  isShotSettingsReady: boolean;
  actionablePromptsCount: number;
  lastKnownPromptCount: number;

  // Setters (route to shot or project)
  setPrompts: (newPrompts: PromptEntry[] | ((prev: PromptEntry[]) => PromptEntry[])) => void;
  setMasterPromptText: React.Dispatch<React.SetStateAction<string>>;
  setEffectivePromptMode: (mode: PromptMode) => void;
  setCurrentBeforePromptText: (text: string) => void;
  setCurrentAfterPromptText: (text: string) => void;

  // Handlers
  handleAddPrompt: (source?: 'form' | 'modal') => void;
  handleUpdatePrompt: (id: string, field: 'fullPrompt' | 'shortPrompt', value: string) => void;
  handleRemovePrompt: (id: string) => void;
  handleDeleteAllPrompts: () => void;
  handleSavePromptsFromModal: (updatedPrompts: PromptEntry[]) => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function usePromptManagement(props: UsePromptManagementProps): UsePromptManagementReturn {
  const {
    associatedShotId,
    effectiveShotId,
    shotPromptSettings,
    noShotPrompts,
    setNoShotPrompts,
    noShotMasterPrompt,
    setNoShotMasterPrompt,
    promptMode,
    setPromptMode,
    beforeEachPromptText,
    setBeforeEachPromptText,
    afterEachPromptText,
    setAfterEachPromptText,
    ready,
    markAsInteracted,
    generatePromptId,
    promptIdCounter,
  } = props;

  // ============================================================================
  // Local State
  // ============================================================================

  // Remember last known prompt count to show correct skeleton
  const [lastKnownPromptCount, setLastKnownPromptCount] = useState<number>(() => {
    try {
      if (typeof window !== 'undefined') {
        const globalStored = window.sessionStorage.getItem('ig:lastPromptCount');
        if (globalStored) return parseInt(globalStored, 10);
      }
    } catch { /* Ignore sessionStorage errors */ }
    return 1;
  });

  // Track which entities we've initialized to prevent infinite loops
  const initializedEntitiesRef = useRef<Set<string>>(new Set());

  // ============================================================================
  // Shot Settings Ready Check
  // ============================================================================

  const isShotSettingsReady = useMemo(() => {
    if (!associatedShotId) return false;
    const settingsForCurrentShot = shotPromptSettings.entityId === associatedShotId;
    return settingsForCurrentShot &&
      (shotPromptSettings.status === 'ready' || shotPromptSettings.status === 'saving');
  }, [associatedShotId, shotPromptSettings.entityId, shotPromptSettings.status]);

  // ============================================================================
  // Computed Prompts
  // ============================================================================

  const prompts = useMemo(() => {
    if (associatedShotId) {
      return isShotSettingsReady ? (shotPromptSettings.settings.prompts || []) : [];
    }
    return noShotPrompts;
  }, [associatedShotId, isShotSettingsReady, shotPromptSettings.settings.prompts, noShotPrompts]);

  const setPrompts = useCallback((newPrompts: PromptEntry[] | ((prev: PromptEntry[]) => PromptEntry[])) => {
    if (associatedShotId) {
      const currentPrompts = shotPromptSettings.settings.prompts || [];
      const updatedPrompts = typeof newPrompts === 'function' ? newPrompts(currentPrompts) : newPrompts;
      shotPromptSettings.updateField('prompts', updatedPrompts);
      markAsInteracted();
    } else {
      setNoShotPrompts(prev => {
        return typeof newPrompts === 'function' ? newPrompts(prev) : newPrompts;
      });
      markAsInteracted();
    }
  }, [associatedShotId, shotPromptSettings, markAsInteracted, setNoShotPrompts]);

  // ============================================================================
  // Computed Master Prompt
  // ============================================================================

  const masterPromptText = useMemo(() => {
    if (associatedShotId) {
      return isShotSettingsReady ? (shotPromptSettings.settings.masterPrompt || '') : '';
    }
    return noShotMasterPrompt;
  }, [associatedShotId, isShotSettingsReady, shotPromptSettings.settings.masterPrompt, noShotMasterPrompt]);

  const setMasterPromptText: React.Dispatch<React.SetStateAction<string>> = useCallback((newTextOrUpdater) => {
    if (associatedShotId) {
      const currentText = shotPromptSettings.settings.masterPrompt || '';
      const newText = typeof newTextOrUpdater === 'function' ? newTextOrUpdater(currentText) : newTextOrUpdater;
      shotPromptSettings.updateField('masterPrompt', newText);
      markAsInteracted();
    } else {
      setNoShotMasterPrompt(newTextOrUpdater);
      markAsInteracted();
    }
  }, [associatedShotId, shotPromptSettings, markAsInteracted, setNoShotMasterPrompt]);

  // ============================================================================
  // Computed Prompt Mode
  // ============================================================================

  const effectivePromptMode = useMemo<PromptMode>(() => {
    if (associatedShotId) {
      return isShotSettingsReady ? (shotPromptSettings.settings.promptMode || 'automated') : 'automated';
    }
    return promptMode;
  }, [associatedShotId, isShotSettingsReady, shotPromptSettings.settings.promptMode, promptMode]);

  const setEffectivePromptMode = useCallback((newMode: PromptMode) => {
    if (associatedShotId) {
      shotPromptSettings.updateField('promptMode', newMode);
      markAsInteracted();
    } else {
      setPromptMode(newMode);
    }
  }, [associatedShotId, shotPromptSettings, markAsInteracted, setPromptMode]);

  // ============================================================================
  // Computed Before/After Prompt Text
  // ============================================================================

  const currentBeforePromptText = useMemo(() => {
    if (associatedShotId) {
      return isShotSettingsReady ? (shotPromptSettings.settings.beforeEachPromptText ?? '') : '';
    }
    return beforeEachPromptText;
  }, [associatedShotId, isShotSettingsReady, shotPromptSettings.settings.beforeEachPromptText, beforeEachPromptText]);

  const setCurrentBeforePromptText = useCallback((newText: string) => {
    if (associatedShotId) {
      shotPromptSettings.updateField('beforeEachPromptText', newText);
      markAsInteracted();
    } else {
      setBeforeEachPromptText(newText);
    }
  }, [associatedShotId, shotPromptSettings, markAsInteracted, setBeforeEachPromptText]);

  const currentAfterPromptText = useMemo(() => {
    if (associatedShotId) {
      return isShotSettingsReady ? (shotPromptSettings.settings.afterEachPromptText ?? '') : '';
    }
    return afterEachPromptText;
  }, [associatedShotId, isShotSettingsReady, shotPromptSettings.settings.afterEachPromptText, afterEachPromptText]);

  const setCurrentAfterPromptText = useCallback((newText: string) => {
    if (associatedShotId) {
      shotPromptSettings.updateField('afterEachPromptText', newText);
      markAsInteracted();
    } else {
      setAfterEachPromptText(newText);
    }
  }, [associatedShotId, shotPromptSettings, markAsInteracted, setAfterEachPromptText]);

  // ============================================================================
  // Actionable Prompts Count
  // ============================================================================

  const actionablePromptsCount = useMemo(() =>
    prompts.filter(p => p.fullPrompt.trim() !== "").length,
    [prompts]
  );

  // ============================================================================
  // Effects: Prompt Count Persistence
  // ============================================================================

  // Load shot-specific prompt count when shot changes
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const shotSpecificKey = `ig:lastPromptCount:${effectiveShotId}`;
        let stored = window.sessionStorage.getItem(shotSpecificKey);

        if (!stored) {
          stored = window.sessionStorage.getItem('ig:lastPromptCount');
        }

        const count = stored ? parseInt(stored, 10) : 1;
        setLastKnownPromptCount(count);
      }
    } catch { /* Ignore sessionStorage errors */ }
  }, [effectiveShotId]);

  // Save prompt count whenever it changes
  useEffect(() => {
    if (ready && prompts.length > 0) {
      try {
        if (typeof window !== 'undefined') {
          const storageKey = `ig:lastPromptCount:${effectiveShotId}`;
          window.sessionStorage.setItem(storageKey, prompts.length.toString());
          window.sessionStorage.setItem('ig:lastPromptCount', prompts.length.toString());
          setLastKnownPromptCount(prompts.length);
        }
      } catch { /* Ignore sessionStorage errors */ }
    }
  }, [ready, prompts.length, effectiveShotId]);

  // Save current shot settings to localStorage for inheritance
  useEffect(() => {
    if (isShotSettingsReady && shotPromptSettings.status === 'ready') {
      try {
        const settingsToSave = {
          masterPrompt: shotPromptSettings.settings.masterPrompt || '',
          promptMode: shotPromptSettings.settings.promptMode || effectivePromptMode || 'automated',
        };
        localStorage.setItem('image-gen-last-active-shot-settings', JSON.stringify(settingsToSave));
      } catch (e) {
        // Ignore localStorage errors
      }
    }
  }, [isShotSettingsReady, shotPromptSettings.status, shotPromptSettings.settings.masterPrompt, shotPromptSettings.settings.promptMode, effectivePromptMode]);

  // ============================================================================
  // Effects: Prompt Initialization
  // ============================================================================

  useEffect(() => {
    const entityKey = associatedShotId || SHOT_FILTER.NO_SHOT;

    if (initializedEntitiesRef.current.has(entityKey)) {
      return;
    }

    const settingsForCurrentShot = shotPromptSettings.entityId === associatedShotId;
    if (associatedShotId && (shotPromptSettings.status !== 'ready' || !settingsForCurrentShot)) {
      return;
    }

    const currentPrompts = associatedShotId ? shotPromptSettings.settings.prompts : noShotPrompts;
    if (!currentPrompts || currentPrompts.length === 0) {
      initializedEntitiesRef.current.add(entityKey);

      const timeoutId = setTimeout(() => {
        const emptyPrompt = { id: generatePromptId(), fullPrompt: "", shortPrompt: "" };
        if (associatedShotId) {
          shotPromptSettings.updateField('prompts', [emptyPrompt]);
        } else {
          setNoShotPrompts([emptyPrompt]);
        }
      }, 50);

      return () => clearTimeout(timeoutId);
    } else {
      initializedEntitiesRef.current.add(entityKey);
    }
  }, [associatedShotId, shotPromptSettings.status, shotPromptSettings.entityId, generatePromptId, shotPromptSettings, noShotPrompts, setNoShotPrompts]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleAddPrompt = useCallback(() => {
    markAsInteracted();
    const newId = generatePromptId();
    const newPromptNumber = prompts.length + 1;
    const newPrompt = { id: newId, fullPrompt: "", shortPrompt: `Prompt ${newPromptNumber}` };
    setPrompts(prev => [...prev, newPrompt]);
  }, [markAsInteracted, generatePromptId, prompts.length, setPrompts]);

  const handleUpdatePrompt = useCallback((id: string, field: 'fullPrompt' | 'shortPrompt', value: string) => {
    markAsInteracted();
    setPrompts(prev => prev.map(p => {
      if (p.id === id) {
        const updatedPrompt = { ...p, [field]: value };
        if (field === 'fullPrompt' && (updatedPrompt.shortPrompt === "" || updatedPrompt.shortPrompt?.startsWith(p.fullPrompt.substring(0, 20)))) {
          updatedPrompt.shortPrompt = value.substring(0, 30) + (value.length > 30 ? "..." : "");
        }
        return updatedPrompt;
      }
      return p;
    }));
  }, [markAsInteracted, setPrompts]);

  const handleRemovePrompt = useCallback((id: string) => {
    markAsInteracted();
    if (prompts.length > 1) {
      setPrompts(prev => prev.filter(p => p.id !== id));
    } else {
      toast.error("Cannot remove the last prompt.");
    }
  }, [markAsInteracted, prompts.length, setPrompts]);

  const handleDeleteAllPrompts = useCallback(() => {
    markAsInteracted();
    const newId = generatePromptId();
    setPrompts([{ id: newId, fullPrompt: "", shortPrompt: "Prompt 1" }]);
  }, [markAsInteracted, generatePromptId, setPrompts]);

  const handleSavePromptsFromModal = useCallback((updatedPrompts: PromptEntry[]) => {
    markAsInteracted();
    // De-duplicate IDs and assign new ones where necessary.
    const seenIds = new Set<string>();
    const sanitizedPrompts = updatedPrompts.map(p => {
      let id = p.id && !seenIds.has(p.id) ? p.id : "";
      if (!id) {
        id = generatePromptId();
      }
      seenIds.add(id);
      return {
        ...p,
        id,
        shortPrompt: p.shortPrompt || (p.fullPrompt.substring(0, 30) + (p.fullPrompt.length > 30 ? "..." : "")),
      };
    });

    setPrompts(sanitizedPrompts);
  }, [markAsInteracted, generatePromptId, setPrompts]);

  // ============================================================================
  // Prompt ID dedup
  // ============================================================================
  // Ensure the `promptIdCounter` is always ahead of any existing numeric IDs.
  // This prevents duplicate IDs which caused multiple prompts to update together.
  useEffect(() => {
    let nextId = prompts.reduce((max, p) => {
      const match = /^prompt-(\d+)$/.exec(p.id || "");
      if (match) {
        const num = parseInt(match[1], 10) + 1;
        return num > max ? num : max;
      }
      return max;
    }, 1);

    // Resolve any duplicate IDs on the fly by assigning new ones.
    const seen = new Set<string>();
    let hadDuplicates = false;
    const dedupedPrompts = prompts.map(prompt => {
      if (!seen.has(prompt.id)) {
        seen.add(prompt.id);
        return prompt;
      }
      hadDuplicates = true;
      // Duplicate found - give it a fresh ID.
      const newId = `prompt-${nextId++}`;
      seen.add(newId);
      return { ...prompt, id: newId };
    });

    if (hadDuplicates) {
      setPrompts(dedupedPrompts);
    }

    if (nextId > promptIdCounter.current) {
      promptIdCounter.current = nextId;
    }
  }, [prompts, setPrompts, promptIdCounter]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    // Computed state
    prompts,
    masterPromptText,
    effectivePromptMode,
    currentBeforePromptText,
    currentAfterPromptText,
    isShotSettingsReady,
    actionablePromptsCount,
    lastKnownPromptCount,

    // Setters
    setPrompts,
    setMasterPromptText,
    setEffectivePromptMode,
    setCurrentBeforePromptText,
    setCurrentAfterPromptText,

    // Handlers
    handleAddPrompt,
    handleUpdatePrompt,
    handleRemovePrompt,
    handleDeleteAllPrompts,
    handleSavePromptsFromModal,
  };
}
