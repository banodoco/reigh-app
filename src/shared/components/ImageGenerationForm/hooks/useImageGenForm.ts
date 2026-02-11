/**
 * useImageGenForm - All orchestration logic for ImageGenerationForm
 *
 * Extracted from the main component to separate state management from rendering.
 * The component calls this hook and passes the returned values to JSX.
 */

import { useState, useEffect, useRef, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import { usePersistentToolState } from '@/shared/hooks/usePersistentToolState';
import { useAutoSaveSettings } from '@/shared/hooks/useAutoSaveSettings';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { useListShots } from '@/shared/hooks/useShots';
import { useShotCreation } from '@/shared/hooks/useShotCreation';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { BatchImageGenerationTaskParams } from '@/shared/lib/tasks/imageGeneration';
import { useAIInteractionService } from '@/shared/hooks/useAIInteractionService';
import { useSubmitButtonState } from '@/shared/hooks/useSubmitButtonState';
import { TOOL_IDS } from '@/shared/lib/toolConstants';

import type { LoraModel } from '@/shared/components/LoraSelectorModal';
import { useGenerationSource } from './useGenerationSource';
import { usePromptManagement } from './usePromptManagement';
import { useReferenceManagement } from './useReferenceManagement';
import { useFormSubmission } from './useFormSubmission';
import { useLoraHandlers } from './useLoraHandlers';
import { useProjectImageSettings } from './useProjectImageSettings';

import { useFormUIState } from '../state';

import {
  useContextValue,
  type FormCoreState,
  type FormPromptState,
  type FormPromptHandlers,
  type FormReferenceState,
  type FormReferenceHandlers,
  type FormLoraState,
  type FormLoraHandlers,
} from '../ImageGenerationFormContext';

import {
  type PromptEntry,
  type PersistedFormSettings,
  type PromptMode,
  type ImageGenShotSettings,
  type HiresFixConfig,
  DEFAULT_HIRES_FIX_CONFIG,
  getLoraTypeForModel,
  BY_REFERENCE_LORA_TYPE,
} from '../types';

interface UseImageGenFormProps {
  onGenerate: (params: BatchImageGenerationTaskParams) => Promise<string[]> | string[] | void;
  openaiApiKey?: string;
  onShotChange?: (shotId: string | null) => void;
  initialShotId?: string | null;
}

export function useImageGenForm({
  onGenerate,
  openaiApiKey,
  onShotChange,
  initialShotId,
}: UseImageGenFormProps) {
  // ============================================================================
  // UI State (reducer for modal states, session tracking)
  // ============================================================================
  const { uiState, uiActions } = useFormUIState();

  const [imagesPerPrompt, setImagesPerPrompt] = useState(8); // Default to 8 for automated mode
  const [promptMultiplier, setPromptMultiplier] = useState(1); // How many images per prompt in automated mode
  const [hiresFixConfigRaw, setHiresFixConfig] = useState<Partial<HiresFixConfig>>({});
  // Always merge with defaults to handle incomplete persisted data
  // Also migrate legacy camelCase field names to snake_case
  const hiresFixConfig = useMemo<HiresFixConfig>(() => {
    const raw = hiresFixConfigRaw as Record<string, unknown>;
    // Migrate legacy camelCase fields if present
    const migrated: Partial<HiresFixConfig> = {
      ...hiresFixConfigRaw,
      // Map old camelCase to new snake_case (prefer new names if both exist)
      base_steps: (raw.base_steps as number) ?? (raw.baseSteps as number),
      hires_scale: (raw.hires_scale as number) ?? (raw.hiresScale as number),
      hires_steps: (raw.hires_steps as number) ?? (raw.hiresSteps as number),
      hires_denoise: (raw.hires_denoise as number) ?? (raw.hiresDenoise as number),
      // Migrate from old single lightning_lora_strength to phase_1 (phase_2 defaults to 0)
      lightning_lora_strength_phase_1: (raw.lightning_lora_strength_phase_1 as number)
        ?? (raw.lightning_lora_strength as number)
        ?? (raw.lightningLoraStrength as number),
      lightning_lora_strength_phase_2: (raw.lightning_lora_strength_phase_2 as number),
    };
    return {
      ...DEFAULT_HIRES_FIX_CONFIG,
      ...migrated,
    };
  }, [hiresFixConfigRaw]);
  // Associated shot for image generation
  const [associatedShotId, setAssociatedShotId] = useState<string | null>(null);

  // ============================================================================
  // Project Settings & References (extracted hook)
  // ============================================================================
  const {
    selectedProjectId,
    projectAspectRatio,
    projectResolution,
    privacyDefaults,
    isLocalGenerationEnabled,
    projectImageSettings,
    updateProjectImageSettings,
    isLoadingProjectSettings,
    effectiveShotId,
    referencePointers,
    referenceCount,
    selectedReferenceIdByShot,
    selectedReferenceId,
    hydratedReferences,
    displayedReferenceId,
    selectedReference,
    isReferenceDataLoading,
  } = useProjectImageSettings(associatedShotId);

  const queryClient = useQueryClient();

  // Mark that we've visited this page in the session
  useEffect(() => {
    try {
      if (!uiState.hasVisitedImageGeneration && typeof window !== 'undefined') {
        window.sessionStorage.setItem('hasVisitedImageGeneration', 'true');
        uiActions.setHasVisited(true);
      }
    } catch { /* Ignore sessionStorage errors */ }
  }, [uiState.hasVisitedImageGeneration, uiActions]);

  // Text to prepend/append to every prompt
  const [beforeEachPromptText, setBeforeEachPromptText] = useState("");
  const [afterEachPromptText, setAfterEachPromptText] = useState("");
  // Prompt mode: automated vs managed (default to automated)
  const [promptMode, setPromptMode] = useState<PromptMode>('automated');
  // Local state for prompts when no shot is selected
  const [noShotPrompts, setNoShotPrompts] = useState<PromptEntry[]>([]);
  const [noShotMasterPrompt, setNoShotMasterPrompt] = useState('');

  // Optimistic button state for immediate feedback: idle → submitting → success → idle
  const automatedSubmitButton = useSubmitButtonState();

  const { data: shots } = useListShots(selectedProjectId);
  const { createShot, isCreating: isCreatingShot } = useShotCreation();
  const { navigateToShot } = useShotNavigation();

  // Define generatePromptId before using it in hooks
  const promptIdCounter = useRef(1);
  const generatePromptId = useCallback(() => `prompt-${promptIdCounter.current++}`, []);

  // AI interaction service for automated prompt generation
  const { generatePrompts: aiGeneratePrompts } = useAIInteractionService({
    apiKey: openaiApiKey,
    generatePromptId,
  });

  // Fetch public LoRAs from all users
  const { data: availableLoras } = usePublicLoras();

  // LoRA management using the modularized hook with new generalized approach
  const loraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId,
    persistenceScope: 'project', // Use new persistence scope
    enableProjectPersistence: true,
    persistenceKey: 'project-loras', // Standardized key shared across all tools
    enableTriggerWords: true,
    onPromptUpdate: setAfterEachPromptText,
    currentPrompt: afterEachPromptText,
    disableAutoLoad: true, // Disable auto-load since we handle our own default logic
  });

  // Default settings for shot prompts - recomputed when shot changes to pick up fresh localStorage
  // Inheritance chain: localStorage (last edited shot) → project-level settings → hardcoded defaults
  // Reference selection defaults to most-recent reference (handled in auto-select effect)
  // Note: beforeEachPromptText/afterEachPromptText are persisted per-shot but NOT inherited (default empty)
  const shotPromptDefaults = useMemo<ImageGenShotSettings>(() => {
    // Try to load last active shot settings for inheritance
    try {
      const stored = localStorage.getItem('image-gen-last-active-shot-settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          prompts: [],
          masterPrompt: parsed.masterPrompt || '',
          promptMode: parsed.promptMode || 'automated',
          // IMPORTANT: Do NOT default this to null.
          // null is treated as an explicit override and would suppress the project-level
          // per-shot selection mapping (selectedReferenceIdByShot), leading to "no selection"
          // and jitter/jumps when the user clicks.
          // Leave undefined so we can fall back to project-level mapping until the user picks one.
        };
      }
    } catch {
      // Ignore localStorage errors
    }
    // Fall back to project-level settings if localStorage is empty
    return {
      prompts: [],
      masterPrompt: noShotMasterPrompt || '',
      promptMode: promptMode || 'automated',
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- associatedShotId triggers recompute to pick up fresh localStorage
  }, [associatedShotId, noShotMasterPrompt, promptMode]);

  // Shot-specific prompts using per-shot storage
  const shotPromptSettings = useAutoSaveSettings<ImageGenShotSettings>({
    toolId: 'image-gen-prompts',
    shotId: associatedShotId,
    projectId: selectedProjectId,
    scope: 'shot',
    defaults: shotPromptDefaults,
    enabled: !!associatedShotId,
  });

  // Project-level settings (NOT shot-specific)
  // Note: promptMode here is the fallback when no shot is selected
  // beforeEachPromptText/afterEachPromptText persist but default to empty (not inherited from other shots)
  const { ready, markAsInteracted } = usePersistentToolState<PersistedFormSettings>(
    TOOL_IDS.IMAGE_GENERATION,
    { projectId: selectedProjectId },
    {
      imagesPerPrompt: [imagesPerPrompt, setImagesPerPrompt],
      selectedLoras: [loraManager.selectedLoras, loraManager.setSelectedLoras],
      beforeEachPromptText: [beforeEachPromptText, setBeforeEachPromptText],
      afterEachPromptText: [afterEachPromptText, setAfterEachPromptText],
      associatedShotId: [associatedShotId, setAssociatedShotId],
      promptMode: [promptMode, setPromptMode],
      prompts: [noShotPrompts, setNoShotPrompts], // Persist no-shot prompts
      masterPrompt: [noShotMasterPrompt, setNoShotMasterPrompt], // Persist no-shot master prompt
      hiresFixConfig: [hiresFixConfig, setHiresFixConfig],
    }
  );

  // ============================================================================
  // Generation Source & Model Selection (extracted hook)
  // ============================================================================
  const {
    generationSource,
    selectedTextModel,
    generationSourceRef,
    selectedTextModelRef,
    handleGenerationSourceChange,
    handleTextModelChange,
  } = useGenerationSource({
    projectImageSettings,
    isLoadingProjectSettings,
    updateProjectImageSettings,
    markAsInteracted,
    loraManager: {
      selectedLoras: loraManager.selectedLoras,
      setSelectedLoras: loraManager.setSelectedLoras,
    },
    setHiresFixConfig,
  });

  // ============================================================================
  // Prompt Management (extracted hook)
  // ============================================================================
  const {
    prompts,
    masterPromptText,
    effectivePromptMode,
    currentBeforePromptText,
    currentAfterPromptText,
    actionablePromptsCount,
    lastKnownPromptCount,
    setPrompts,
    setMasterPromptText,
    setEffectivePromptMode,
    setCurrentBeforePromptText,
    setCurrentAfterPromptText,
    handleAddPrompt,
    handleUpdatePrompt,
    handleRemovePrompt,
    handleDeleteAllPrompts,
    handleSavePromptsFromModal,
  } = usePromptManagement({
    associatedShotId,
    effectiveShotId,
    shotPromptSettings: {
      entityId: shotPromptSettings.entityId,
      status: shotPromptSettings.status,
      settings: shotPromptSettings.settings,
      updateField: shotPromptSettings.updateField,
    },
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
  });

  // ============================================================================
  // Reference Management (extracted hook)
  // ============================================================================
  const {
    styleReferenceStrength,
    subjectStrength,
    subjectDescription,
    inThisScene,
    inThisSceneStrength,
    referenceMode,
    styleBoostTerms,
    isUploadingStyleReference,
    styleReferenceImageDisplay,
    styleReferenceImageGeneration,
    handleStyleReferenceUpload,
    handleResourceSelect,
    handleSelectReference,
    handleDeleteReference,
    handleUpdateReferenceName,
    handleToggleVisibility,
    handleRemoveStyleReference,
    handleStyleStrengthChange,
    handleSubjectStrengthChange,
    handleSubjectDescriptionChange,
    handleSubjectDescriptionFocus,
    handleSubjectDescriptionBlur,
    handleInThisSceneChange,
    handleInThisSceneStrengthChange,
    handleStyleBoostTermsChange,
    handleReferenceModeChange,
  } = useReferenceManagement({
    selectedProjectId,
    effectiveShotId,
    selectedReferenceId,
    selectedReferenceIdByShot,
    referencePointers,
    hydratedReferences,
    selectedReference,
    isLoadingProjectSettings,
    isLocalGenerationEnabled,
    updateProjectImageSettings,
    markAsInteracted,
    privacyDefaults,
    associatedShotId,
    shotPromptSettings: {
      updateField: shotPromptSettings.updateField,
    },
    setHiresFixConfig,
  });

  const effectiveSubjectDescription = subjectDescription.trim() || 'this character';

  // ============================================================================
  // Form Submission (extracted hook)
  // ============================================================================
  const {
    handleSubmit,
    handleGenerateAndQueue,
    handleUseExistingPrompts,
    handleNewPromptsLikeExisting,
  } = useFormSubmission({
    selectedProjectId,
    prompts,
    imagesPerPrompt,
    promptMultiplier,
    associatedShotId,
    currentBeforePromptText,
    currentAfterPromptText,
    styleBoostTerms,
    isLocalGenerationEnabled,
    hiresFixConfig,
    effectivePromptMode,
    masterPromptText,
    actionablePromptsCount,
    generationSourceRef,
    selectedTextModelRef,
    styleReferenceImageGeneration,
    styleReferenceStrength,
    subjectStrength,
    effectiveSubjectDescription,
    inThisScene,
    inThisSceneStrength,
    referenceMode,
    aiGeneratePrompts,
    onGenerate,
    setPrompts,
    automatedSubmitButton,
  });

  // Apply initialShotId once after hydration (takes precedence over persisted value)
  // If initialShotId is explicitly null, reset to None (opened from outside shot context)
  // IMPORTANT: Do NOT call markAsInteracted() here - initialShotId is a temporary context
  // override (e.g., from modal opened in shot context), not a user preference to persist.
  // The tool page's persisted shot selection should only change when explicitly changed by user.
  const hasAppliedInitialShotId = useRef(false);
  useEffect(() => {
    // Only apply once, after hydration is complete
    // Only override when initialShotId is a specific shot ID (truthy string)
    // null or undefined = keep the persisted value from project settings
    if (ready && !hasAppliedInitialShotId.current && shots) {
      if (initialShotId) {
        // initialShotId was provided as a specific shot - set to that shot if it exists
        const shotExists = shots.some(shot => shot.id === initialShotId);
        if (shotExists && associatedShotId !== initialShotId) {
          setAssociatedShotId(initialShotId);
          // Don't persist - this is a temporary context override
        }
      }
      // If initialShotId is null/undefined, keep the persisted value from project settings
      hasAppliedInitialShotId.current = true;
    }
  }, [ready, initialShotId, shots, associatedShotId]);

  // Reset associatedShotId if the selected shot no longer exists (e.g., was deleted)
  useEffect(() => {
    if (associatedShotId && shots) {
      const shotExists = shots.some(shot => shot.id === associatedShotId);
      if (!shotExists) {
        setAssociatedShotId(null);
        markAsInteracted();
      }
    }
  }, [associatedShotId, shots, markAsInteracted]);

  // ============================================================================
  // LORA Handlers (extracted hook)
  // ============================================================================
  const {
    handleAddLora,
    handleRemoveLora,
    handleLoraStrengthChange,
  } = useLoraHandlers({
    loraManager: {
      selectedLoras: loraManager.selectedLoras,
      handleAddLora: loraManager.handleAddLora,
      handleRemoveLora: loraManager.handleRemoveLora,
      handleLoraStrengthChange: loraManager.handleLoraStrengthChange,
      handleLoadProjectLoras: loraManager.handleLoadProjectLoras,
    },
    markAsInteracted,
    generationSource,
    selectedTextModel,
    projectImageSettings,
    updateProjectImageSettings,
  });

  // Handle creating a new shot
  const handleCreateShot = useCallback(async (shotName: string, files: File[]) => {
    // Use unified shot creation - handles inheritance, events, lastAffected automatically
    const result = await createShot({
      name: shotName,
      files: files.length > 0 ? files : undefined,
      dispatchSkeletonEvents: false, // No skeleton needed in form context
      onSuccess: () => {
        // Invalidate and refetch shots to update the list
        queryClient.invalidateQueries({ queryKey: queryKeys.shots.list(selectedProjectId!) });
        queryClient.refetchQueries({ queryKey: queryKeys.shots.list(selectedProjectId!) });
      },
    });

    if (!result) {
      // Error already shown by useShotCreation
      return;
    }

    // Note: Settings inheritance is handled automatically by useShotCreation

    // Switch to the newly created shot
    markAsInteracted();
    setAssociatedShotId(result.shotId);
    uiActions.setCreateShotModalOpen(false);
  }, [createShot, markAsInteracted, queryClient, selectedProjectId, uiActions]);

  // Optimize event handlers with useCallback to prevent recreating on each render
  const handleSliderChange = useCallback((setter: Dispatch<SetStateAction<number>>) => (value: number) => {
    markAsInteracted();
    setter(value);
  }, [markAsInteracted]);

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
      // Duplicate found – give it a fresh ID.
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
  }, [prompts, setPrompts]);

  // Handle shot change with proper prompt initialization
  const handleShotChange = (value: string) => {
    markAsInteracted();
    const newShotId = value === "none" ? null : value;

    // usePersistentToolState auto-syncs associatedShotId to DB
    setAssociatedShotId(newShotId);

    // Call the parent callback if provided
    if (onShotChange) {
      onShotChange(newShotId);
    }

    // Note: Prompts for the new shot will be loaded automatically via useAutoSaveSettings
    // and initialized if empty via the initialization effect
  };

  // ============================================================================
  // Context Value (for sections to pull from)
  // ============================================================================

  const coreState = useMemo<FormCoreState>(() => ({
    selectedProjectId,
    associatedShotId,
    effectiveShotId,
    isGenerating: automatedSubmitButton.isSubmitting,
    ready,
  }), [selectedProjectId, associatedShotId, effectiveShotId, automatedSubmitButton.isSubmitting, ready]);

  const promptState = useMemo<FormPromptState>(() => ({
    prompts,
    masterPromptText,
    effectivePromptMode,
    actionablePromptsCount,
    currentBeforePromptText,
    currentAfterPromptText,
    lastKnownPromptCount,
  }), [prompts, masterPromptText, effectivePromptMode, actionablePromptsCount, currentBeforePromptText, currentAfterPromptText, lastKnownPromptCount]);

  const promptHandlersValue = useMemo<FormPromptHandlers>(() => ({
    setPrompts,
    setMasterPromptText,
    setEffectivePromptMode,
    setCurrentBeforePromptText,
    setCurrentAfterPromptText,
    handleAddPrompt,
    handleUpdatePrompt,
    handleRemovePrompt,
    handleDeleteAllPrompts,
    markAsInteracted,
  }), [setPrompts, setMasterPromptText, setEffectivePromptMode, setCurrentBeforePromptText, setCurrentAfterPromptText, handleAddPrompt, handleUpdatePrompt, handleRemovePrompt, handleDeleteAllPrompts, markAsInteracted]);

  const referenceState = useMemo<FormReferenceState>(() => ({
    references: hydratedReferences,
    selectedReferenceId: displayedReferenceId,
    referenceMode,
    styleReferenceStrength,
    subjectStrength,
    subjectDescription,
    inThisScene,
    inThisSceneStrength,
    styleBoostTerms,
    isUploadingStyleReference,
    styleReferenceImageDisplay,
  }), [hydratedReferences, displayedReferenceId, referenceMode, styleReferenceStrength, subjectStrength, subjectDescription, inThisScene, inThisSceneStrength, styleBoostTerms, isUploadingStyleReference, styleReferenceImageDisplay]);

  const referenceHandlersValue = useMemo<FormReferenceHandlers>(() => ({
    onSelectReference: handleSelectReference,
    onDeleteReference: handleDeleteReference,
    onUpdateReferenceName: handleUpdateReferenceName,
    onStyleUpload: handleStyleReferenceUpload,
    onStyleRemove: handleRemoveStyleReference,
    onStyleStrengthChange: handleStyleStrengthChange,
    onSubjectStrengthChange: handleSubjectStrengthChange,
    onSubjectDescriptionChange: handleSubjectDescriptionChange,
    onSubjectDescriptionFocus: handleSubjectDescriptionFocus,
    onSubjectDescriptionBlur: handleSubjectDescriptionBlur,
    onInThisSceneChange: handleInThisSceneChange,
    onInThisSceneStrengthChange: handleInThisSceneStrengthChange,
    onReferenceModeChange: handleReferenceModeChange,
    onStyleBoostTermsChange: handleStyleBoostTermsChange,
    onToggleVisibility: handleToggleVisibility,
    onResourceSelect: handleResourceSelect,
  }), [handleSelectReference, handleDeleteReference, handleUpdateReferenceName, handleStyleReferenceUpload, handleRemoveStyleReference, handleStyleStrengthChange, handleSubjectStrengthChange, handleSubjectDescriptionChange, handleSubjectDescriptionFocus, handleSubjectDescriptionBlur, handleInThisSceneChange, handleInThisSceneStrengthChange, handleReferenceModeChange, handleStyleBoostTermsChange, handleToggleVisibility, handleResourceSelect]);

  const loraState = useMemo<FormLoraState>(() => ({
    selectedLoras: loraManager.selectedLoras,
    availableLoras: availableLoras ?? [],
  }), [loraManager.selectedLoras, availableLoras]);

  const loraHandlersValue = useMemo<FormLoraHandlers>(() => ({
    handleAddLora,
    handleRemoveLora,
    handleLoraStrengthChange,
  }), [handleAddLora, handleRemoveLora, handleLoraStrengthChange]);

  // Pre-compute LoRA modal props (moves computation out of JSX)
  const mappedSelectedLoras = useMemo(() =>
    loraManager.selectedLoras.map(lora => {
      const fullLora = availableLoras?.find(l => l['Model ID'] === lora.id);
      return {
        ...fullLora,
        "Model ID": lora.id,
        Name: lora.name,
        strength: lora.strength,
      } as LoraModel & { strength: number };
    }), [loraManager.selectedLoras, availableLoras]);

  const loraType = generationSource === 'just-text' ? getLoraTypeForModel(selectedTextModel) : BY_REFERENCE_LORA_TYPE;

  const contextValue = useContextValue({
    uiState,
    uiActions,
    core: coreState,
    prompts: promptState,
    promptHandlers: promptHandlersValue,
    references: referenceState,
    referenceHandlers: referenceHandlersValue,
    loras: loraState,
    loraHandlers: loraHandlersValue,
  });

  return {
    // Context value for provider
    contextValue,

    // Form submission
    handleSubmit,

    // State + setters
    shots,
    associatedShotId,
    setAssociatedShotId,
    imagesPerPrompt,
    setImagesPerPrompt,
    promptMultiplier,
    setPromptMultiplier,
    hiresFixConfig,
    setHiresFixConfig,
    selectedProjectId,

    // Computed
    generationSource,
    selectedTextModel,
    effectivePromptMode,
    actionablePromptsCount,
    projectResolution,
    projectAspectRatio,
    isLocalGenerationEnabled,
    isReferenceDataLoading,
    referenceCount,

    // Prompt management
    prompts,
    setEffectivePromptMode,
    handleSavePromptsFromModal,
    generatePromptId,
    markAsInteracted,
    handleGenerateAndQueue,

    // Shot handling
    handleShotChange,
    handleCreateShot,
    isCreatingShot,
    navigateToShot,

    // Generation source
    handleGenerationSourceChange,
    handleTextModelChange,

    // Submission button state
    automatedSubmitButton,
    handleUseExistingPrompts,
    handleNewPromptsLikeExisting,
    handleSliderChange,

    // LoRA
    loraManager,
    availableLoras,
    mappedSelectedLoras,
    loraType,
    handleAddLora,
    handleRemoveLora,
    handleLoraStrengthChange,

    // UI
    uiState,
    uiActions,

    // Pass-through from props
    openaiApiKey,
  };
}
