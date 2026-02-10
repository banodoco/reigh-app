import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useMemo, Suspense } from "react";
import { createPortal } from "react-dom";
import { LoraModel } from "@/shared/components/LoraSelectorModal";
import { DisplayableMetadata } from "@/shared/components/MediaGallery";
import { ActiveLora } from "@/shared/components/ActiveLoRAsDisplay";
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import { useProject } from "@/shared/contexts/ProjectContext";
import { usePersistentToolState } from "@/shared/hooks/usePersistentToolState";
import { useToolSettings, extractSettingsFromCache } from "@/shared/hooks/useToolSettings";
import { useAutoSaveSettings } from "@/shared/hooks/useAutoSaveSettings";
import { useUserUIState } from "@/shared/hooks/useUserUIState";
import { usePublicLoras } from '@/shared/hooks/useResources';
import { useListShots } from "@/shared/hooks/useShots";
import { useShotCreation } from "@/shared/hooks/useShotCreation";
import CreateShotModal from "@/shared/components/CreateShotModal";
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { useShotNavigation } from "@/shared/hooks/useShotNavigation";
import { BatchImageGenerationTaskParams } from "@/shared/lib/tasks/imageGeneration";
import { ASPECT_RATIO_TO_RESOLUTION } from "@/shared/lib/aspectRatios";
import { useAIInteractionService } from '@/shared/hooks/useAIInteractionService';
import { useTaskStatusCounts } from '@/shared/hooks/useTasks';
import { useSubmitButtonState } from '@/shared/hooks/useSubmitButtonState';
import { useHydratedReferences } from '@/shared/hooks/useHydratedReferences';

// Import extracted components
import { PromptsSection } from "./components/PromptsSection";
import { ShotSelector } from "./components/ShotSelector";
import { ModelSection } from "./components/ModelSection";
import { GenerateControls } from "./components/GenerateControls";
import { GenerationSettingsSection } from "./components/GenerationSettingsSection";
import { ChunkLoadErrorBoundary } from "@/shared/components/ChunkLoadErrorBoundary";

// Import extracted hooks
import {
  useGenerationSource,
  usePromptManagement,
  useReferenceManagement,
  useFormSubmission,
  useLegacyMigrations,
  useReferenceSelection,
  useLoraHandlers,
} from "./hooks";

// Import state management
import { useFormUIState } from "./state";

// Import context
import {
  ImageGenerationFormProvider,
  useContextValue,
  FormCoreState,
  FormPromptState,
  FormPromptHandlers,
  FormReferenceState,
  FormReferenceHandlers,
  FormLoraState,
  FormLoraHandlers,
} from "./ImageGenerationFormContext";

// Import types
import {
  ImageGenerationFormHandles,
  PromptEntry,
  PersistedFormSettings,
  ProjectImageSettings,
  PromptMode,
  ImageGenShotSettings,
  HiresFixConfig,
  DEFAULT_HIRES_FIX_CONFIG,
  TextToImageModel,
  LoraCategory,
  getLoraTypeForModel,
  getLoraCategoryForModel,
  BY_REFERENCE_LORA_TYPE,
} from "./types";

// Lazy load modals to improve initial bundle size and performance
const LazyLoraSelectorModal = React.lazy(() => 
  import("@/shared/components/LoraSelectorModal").then(module => ({ 
    default: module.LoraSelectorModal 
  }))
);

const LazyPromptEditorModal = React.lazy(() =>
  import("../PromptEditorModal")
);

interface ImageGenerationFormProps {
  onGenerate: (params: BatchImageGenerationTaskParams) => Promise<string[]> | string[] | void;
  isGenerating?: boolean;
  hasApiKey?: boolean;
  apiKey?: string;
  openaiApiKey?: string;
  /**
   * Indicates that the latest generate action successfully queued tasks. When
   * true, the submit button will briefly show "Added to queue!" to give the
   * user feedback that their request was accepted.
   */
  justQueued?: boolean;
  /**
   * Called when the associated shot selection changes in the form
   */
  onShotChange?: (shotId: string | null) => void;
  /**
   * When true, the generate controls will be rendered with sticky positioning
   * at the bottom of the scroll container (for modal contexts)
   */
  stickyFooter?: boolean;
  /**
   * When provided with stickyFooter, the footer will be portaled to this element
   * (by ID) so it renders outside the scroll container
   */
  footerPortalId?: string;
  /**
   * Pre-select a specific shot when the form mounts. This takes precedence over
   * persisted settings on initial render only.
   */
  initialShotId?: string | null;
}

// NOTE: buildBatchTaskParams and BuildBatchTaskParamsInput now come from ./hooks/buildBatchTaskParams

export const ImageGenerationForm = forwardRef<ImageGenerationFormHandles, ImageGenerationFormProps>(({
  onGenerate,
  // Legacy props - kept for API compatibility but not used internally
  isGenerating: _isGenerating = false,
  hasApiKey: _incomingHasApiKey = true,
  apiKey: _apiKey,
  openaiApiKey,
  justQueued: _justQueued = false,
  onShotChange,
  stickyFooter = false,
  footerPortalId,
  initialShotId,
}, ref) => {
  // ============================================================================
  // UI State (reducer for modal states, session tracking)
  // ============================================================================
  const { uiState, uiActions } = useFormUIState();

  // NOTE: lastKnownPromptCount now comes from usePromptManagement hook
  // Legacy: promptsByShot removed - now using per-shot storage via useAutoSaveSettings
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
  // NOTE: directFormActivePromptId is now in uiState from reducer
  // NOTE: Reference management state (styleReferenceStrength, subjectStrength, etc.)
  // is now provided by useReferenceManagement hook - see destructuring below
  // NOTE: Generation source state (generationSource, selectedTextModel, modelOverride)
  // is now provided by useGenerationSource hook - see destructuring below
  // Associated shot for image generation
  const [associatedShotId, setAssociatedShotId] = useState<string | null>(null);
  
  const { selectedProjectId, projects } = useProject();
  const queryClient = useQueryClient();

  // Get current task count for baseline tracking
  const { data: taskStatusCounts } = useTaskStatusCounts(selectedProjectId);

  // Derive project aspect ratio and resolution for GenerationSettingsSection
  const { projectAspectRatio, projectResolution } = useMemo(() => {
    const currentProject = projects.find(project => project.id === selectedProjectId);
    const aspectRatio = currentProject?.aspectRatio ?? '16:9';
    const resolution = ASPECT_RATIO_TO_RESOLUTION[aspectRatio] ?? '902x508';
    return { projectAspectRatio: aspectRatio, projectResolution: resolution };
  }, [projects, selectedProjectId]);
  
  // Access user's generation settings to detect local generation
  const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  
  // Privacy defaults for new resources
  const { value: privacyDefaults } = useUserUIState('privacyDefaults', { resourcesPublic: true, generationsPublic: false });
  
  const isLocalGenerationEnabled = generationMethods.onComputer && !generationMethods.inCloud;
  
  // Project-level settings for model and style reference (shared across tools)
  const {
    settings: projectImageSettings,
    update: updateProjectImageSettings,
    isUpdating: isSavingProjectSettings,
    isLoading: isLoadingProjectSettings
  } = useToolSettings<ProjectImageSettings>('project-image-settings', {
    projectId: selectedProjectId,
    enabled: !!selectedProjectId
  });

  // NOTE: modelOverride is now provided by useGenerationSource hook

  // Get the effective shot ID for storage (use 'none' for null)
  const effectiveShotId = associatedShotId || 'none';
  
  // Get reference pointers array and selected reference for current shot
  const cachedProjectSettings = selectedProjectId
    ? extractSettingsFromCache<ProjectImageSettings>(
        queryClient.getQueryData(queryKeys.settings.tool('project-image-settings', selectedProjectId, undefined))
      )
    : undefined;

  const referencePointers = projectImageSettings?.references ?? cachedProjectSettings?.references ?? [];
  // Reference count is simply the number of pointers - no complex tracking needed
  // Skeleton count is managed by comparing referencePointers.length vs hydratedReferences.length
  const referenceCount = referencePointers.length;
  // Use cache fallback for selection too, so selection is stable during loading
  const selectedReferenceIdByShot = projectImageSettings?.selectedReferenceIdByShot ?? cachedProjectSettings?.selectedReferenceIdByShot ?? {};
  const selectedReferenceId = selectedReferenceIdByShot[effectiveShotId] ?? null;

  // Hydrate references with data from resources table
  const { hydratedReferences, isLoading: isLoadingReferences, hasLegacyReferences } = useHydratedReferences(referencePointers);

  // ============================================================================
  // Reference Selection (extracted hook)
  // ============================================================================
  const {
    displayedReferenceId,
    selectedReference,
    isReferenceDataLoading,
  } = useReferenceSelection({
    effectiveShotId,
    referenceCount,
    selectedReferenceId,
    hydratedReferences,
    isLoadingProjectSettings,
    isLoadingReferences,
  });

  // For backward compatibility with single reference - used in legacy migration
  const rawStyleReferenceImage = selectedReference?.styleReferenceImage || projectImageSettings?.styleReferenceImage || null;

  // NOTE: Aliases for reference values (currentStyleStrength, etc.) are defined after useReferenceManagement hook
  // NOTE: Effects using generationSource/modelOverride are defined after useGenerationSource hook

  // ============================================================================
  // Legacy Migrations (extracted hook)
  // ============================================================================
  useLegacyMigrations({
    selectedProjectId,
    effectiveShotId,
    referencePointers,
    hydratedReferences,
    hasLegacyReferences,
    rawStyleReferenceImage,
    isLoadingReferences,
    selectedReferenceIdByShot,
    projectImageSettings,
    updateProjectImageSettings,
    privacyDefaults,
  });
  
  // Mark that we've visited this page in the session
  React.useEffect(() => {
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
  // NOTE: isCreateShotModalOpen is now in uiState from reducer
  
  // Prompt mode: automated vs managed (default to automated)
  const [promptMode, setPromptMode] = useState<PromptMode>('automated');
  // Local state for prompts when no shot is selected
  const [noShotPrompts, setNoShotPrompts] = useState<PromptEntry[]>([]);
  const [noShotMasterPrompt, setNoShotMasterPrompt] = useState('');

  // Optimistic button state for immediate feedback: idle → submitting → success → idle
  const automatedSubmitButton = useSubmitButtonState();

  // Removed unused currentShotId that was causing unnecessary re-renders
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

  // Debug logging consolidated - enable via VITE_DEBUG_IMAGE_GEN=true
  const DEBUG_IMAGE_GEN = import.meta.env.VITE_DEBUG_IMAGE_GEN === 'true';

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

  // NOTE: LORA initialization effect is defined AFTER useGenerationSource hook below
  // (needs generationSource and selectedTextModel values)

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
  const { ready, isSaving, markAsInteracted } = usePersistentToolState<PersistedFormSettings>(
    'image-generation',
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
    modelOverride,
    generationSourceRef,
    selectedTextModelRef,
    handleGenerationSourceChange,
    handleTextModelChange,
    setGenerationSource,
    setSelectedTextModel,
    setModelOverride,
  } = useGenerationSource({
    selectedProjectId,
    projectImageSettings,
    isLoadingProjectSettings,
    updateProjectImageSettings,
    markAsInteracted,
    loraManager: {
      selectedLoras: loraManager.selectedLoras,
      setSelectedLoras: loraManager.setSelectedLoras,
    },
    setHiresFixConfig,
    queryClient,
  });

  // Clear model override once server settings reflect the change
  useEffect(() => {
    if (modelOverride && projectImageSettings?.selectedModel === modelOverride) {
      setModelOverride(undefined);
    }
  }, [projectImageSettings?.selectedModel, modelOverride, isSavingProjectSettings, setModelOverride]);

  // Initialize generationSource and selectedTextModel from project settings
  // (LORA initialization is done separately after loraManager is created)
  const hasInitializedGenerationSource = useRef(false);
  const initializedTextModelRef = useRef<TextToImageModel | null>(null);
  useEffect(() => {
    if (isLoadingProjectSettings) return;
    if (hasInitializedGenerationSource.current) return;
    if (!projectImageSettings) return;

    if (projectImageSettings.generationSource) {
      setGenerationSource(projectImageSettings.generationSource);
    }
    const textModel = projectImageSettings.selectedTextModel || 'qwen-image';
    if (projectImageSettings.selectedTextModel) {
      setSelectedTextModel(projectImageSettings.selectedTextModel);
    }
    // Store for LORA initialization (done in separate effect after loraManager is created)
    initializedTextModelRef.current = textModel;
    hasInitializedGenerationSource.current = true;
  }, [projectImageSettings, selectedProjectId, isLoadingProjectSettings, setGenerationSource, setSelectedTextModel]);

  // Initialize LORAs from per-category storage (runs after loraManager is created)
  // Categories: 'qwen' (all Qwen models + by-reference) and 'z-image'
  // NOTE: This effect must be AFTER useGenerationSource so generationSource/selectedTextModel are defined
  const hasInitializedLoras = useRef(false);
  useEffect(() => {
    if (isLoadingProjectSettings) return;
    if (hasInitializedLoras.current) return;

    // Determine current category based on generation source and model
    const textModel = initializedTextModelRef.current || selectedTextModel;
    const currentSource = projectImageSettings?.generationSource || generationSource;
    // by-reference always uses 'qwen' category
    const category: LoraCategory = currentSource === 'by-reference' ? 'qwen' : getLoraCategoryForModel(textModel);

    // Try new category-based storage first, fall back to old per-model storage for migration
    let categoryLoras: ActiveLora[] = [];
    if (projectImageSettings?.selectedLorasByCategory) {
      categoryLoras = projectImageSettings.selectedLorasByCategory[category] ?? [];
    } else if (projectImageSettings?.selectedLorasByTextModel) {
      // Migration: use old per-model storage
      categoryLoras = projectImageSettings.selectedLorasByTextModel[textModel] ?? [];
    }

    if (categoryLoras.length > 0) {
      loraManager.setSelectedLoras(categoryLoras);
    }
    hasInitializedLoras.current = true;
  }, [projectImageSettings?.selectedLorasByCategory, projectImageSettings?.selectedLorasByTextModel, projectImageSettings?.generationSource, isLoadingProjectSettings, loraManager, selectedTextModel, generationSource]);

  // ============================================================================
  // Prompt Management (extracted hook)
  // ============================================================================
  const {
    prompts,
    masterPromptText,
    effectivePromptMode,
    currentBeforePromptText,
    currentAfterPromptText,
    isShotSettingsReady,
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

  // Computed values from useReferenceManagement (aliases for backwards compatibility)
  const currentStyleStrength = styleReferenceStrength;
  const currentSubjectStrength = subjectStrength;
  const currentSubjectDescription = subjectDescription;
  const effectiveSubjectDescription = currentSubjectDescription.trim() || 'this character';
  const currentInThisScene = inThisScene;
  const currentInThisSceneStrength = inThisSceneStrength;
  const currentReferenceMode = referenceMode;
  const currentStyleBoostTerms = styleBoostTerms;

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
    currentStyleBoostTerms,
    isLocalGenerationEnabled,
    hiresFixConfig,
    effectivePromptMode,
    masterPromptText,
    actionablePromptsCount,
    generationSourceRef,
    selectedTextModelRef,
    styleReferenceImageGeneration,
    currentStyleStrength,
    currentSubjectStrength,
    effectiveSubjectDescription,
    currentInThisScene,
    currentInThisSceneStrength,
    referenceMode,
    aiGeneratePrompts,
    taskStatusCounts,
    onGenerate,
    setPrompts,
    automatedSubmitButton,
  });

  // Get current selected reference ID - from shot settings if shot selected, otherwise project settings
  // Note: Unlike other fields, reference ID intentionally falls back to project value while loading
  const effectiveSelectedReferenceId = useMemo<string | null>(() => {
    if (associatedShotId && isShotSettingsReady) {
      // Shot-level reference takes precedence if explicitly set
      const shotRefId = shotPromptSettings.settings.selectedReferenceId;
      if (shotRefId !== undefined) {
        return shotRefId;
      }
    }
    // Fall back to project-level selection
    return selectedReferenceId;
  }, [associatedShotId, isShotSettingsReady, shotPromptSettings.settings.selectedReferenceId, selectedReferenceId]);

  // Helper to update selected reference ID - routes to shot settings
  const setEffectiveSelectedReferenceId = useCallback((newRefId: string | null) => {
    if (associatedShotId) {
      shotPromptSettings.updateField('selectedReferenceId', newRefId);
      markAsInteracted();
    }
    // Also update the project-level per-shot mapping for backwards compatibility
    // (handled by existing handleReferenceSelection)
  }, [associatedShotId, shotPromptSettings, markAsInteracted]);

  // NOTE: currentBeforePromptText, setCurrentBeforePromptText, currentAfterPromptText,
  //       setCurrentAfterPromptText now come from usePromptManagement hook
  // NOTE: prompt count effects and localStorage shot settings now in usePromptManagement hook

  // Consolidated debug logging (enable via VITE_DEBUG_IMAGE_GEN=true)
  useEffect(() => {
    if (!DEBUG_IMAGE_GEN) return;
  }, [DEBUG_IMAGE_GEN, ready, isSaving, associatedShotId, selectedProjectId, prompts.length, shotPromptSettings.status]);

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

  // NOTE: initializedEntitiesRef and prompt initialization effect now in usePromptManagement hook
  // NOTE: actionablePromptsCount now comes from usePromptManagement hook

  const hasApiKey = true; // Always true for wan-local
  
  useImperativeHandle(ref, () => ({
    applySettings: (settings: DisplayableMetadata) => {
      markAsInteracted();
      // Apply settings to the current shot's prompts
      setPrompts([{
        id: generatePromptId(),
        fullPrompt: settings.prompt || '',
        shortPrompt: settings.shortPrompt
      }]);
      setImagesPerPrompt(1);

      if (settings.activeLoras && settings.activeLoras.length > 0 && availableLoras.length > 0) {
        const newSelectedLoras: ActiveLora[] = [];
        settings.activeLoras.forEach(metaLora => {
          const foundFullLora = availableLoras.find(al => al['Model ID'] === metaLora.id);
          if (foundFullLora) {
            newSelectedLoras.push({
              id: metaLora.id,
              name: metaLora.name,
              path: metaLora.path,
              strength: metaLora.strength,
              previewImageUrl: foundFullLora.Images && foundFullLora.Images.length > 0 ? foundFullLora.Images[0].url : metaLora.previewImageUrl
            });
          }
        });
        loraManager.setSelectedLoras(newSelectedLoras);
      } else {
        loraManager.setSelectedLoras([]);
      }
      // Note: beforeEachPromptText/afterEachPromptText are NOT restored - they reset on page load
    },
    getAssociatedShotId: () => associatedShotId,
  }));

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

  // NOTE: Reference handlers (handleStyleReferenceUpload, handleResourceSelect, handleSelectReference,
  //       handleDeleteReference, handleUpdateReference, handleUpdateReferenceName, handleToggleVisibility,
  //       handleRemoveStyleReference, handleStyleStrengthChange, handleSubjectStrengthChange,
  //       handleSubjectDescriptionChange, handleSubjectDescriptionFocus, handleSubjectDescriptionBlur,
  //       handleInThisSceneChange, handleInThisSceneStrengthChange, handleStyleBoostTermsChange,
  //       handleReferenceModeChange) now come from useReferenceManagement hook

  // NOTE: Prompt handlers (handleAddPrompt, handleUpdatePrompt, handleRemovePrompt, handleDeleteAllPrompts,
  //       handleSavePromptsFromModal) now come from usePromptManagement hook

  const handleOpenMagicPrompt = useCallback(() => {
    uiActions.openMagicPrompt();
  }, [uiActions]);

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
  const handleSliderChange = useCallback((setter: React.Dispatch<React.SetStateAction<number>>) => (value: number) => {
    markAsInteracted();
    setter(value);
  }, [markAsInteracted]);

  const handleTextChange = useCallback((setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    markAsInteracted();
    setter(e.target.value);
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
    markAsInteracted();
  };

  // Note: Form fields are NOT automatically synced when selecting a reference
  // This allows users to maintain their current settings when switching references

  // Form fields maintain their current values independent of selected reference
  // This allows users to keep their settings when switching references

  // ============================================================================
  // Context Value (for sections to pull from)
  // ============================================================================

  const coreState = useMemo<FormCoreState>(() => ({
    selectedProjectId,
    associatedShotId,
    effectiveShotId,
    isGenerating: automatedSubmitButton.isSubmitting,
    hasApiKey,
    ready,
  }), [selectedProjectId, associatedShotId, effectiveShotId, automatedSubmitButton.isSubmitting, hasApiKey, ready]);

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

  return (
    <ImageGenerationFormProvider value={contextValue}>
      <form id="image-generation-form" onSubmit={handleSubmit} className="space-y-6">
        {/* Main Content Layout */}
        <div className="flex gap-6 flex-col md:flex-row pb-4">
          {/* Left Column - Prompts and Shot Selector */}
          <div className="flex-1 space-y-6">
            <PromptsSection
              onPromptModeChange={(mode) => {
                markAsInteracted();
                setEffectivePromptMode(mode);
                // Auto-set imagesPerPrompt based on mode
                if (mode === 'automated') {
                  setImagesPerPrompt(8);
                } else if (mode === 'managed') {
                  setImagesPerPrompt(1);
                }
              }}
            />

            <ShotSelector
              shots={shots}
              associatedShotId={associatedShotId}
              isGenerating={automatedSubmitButton.isSubmitting}
              hasApiKey={hasApiKey}
              onChangeShot={handleShotChange}
              onClearShot={() => {
                markAsInteracted();
                setAssociatedShotId(null);
              }}
              onOpenCreateShot={() => uiActions.setCreateShotModalOpen(true)}
              onJumpToShot={navigateToShot}
            />
          </div>
          
          {/* Right Column - Reference Image and Settings */}
          <ModelSection
            // Props not in context
            generationSource={generationSource}
            onGenerationSourceChange={handleGenerationSourceChange}
            selectedTextModel={selectedTextModel}
            onTextModelChange={handleTextModelChange}
            onOpenLoraModal={() => loraManager.setIsLoraModalOpen(true)}
            isLoadingReferenceData={isReferenceDataLoading}
            referenceCount={referenceCount}
          />
        </div>

        {/* Generation Settings (dimensions always, phase config for local only) */}
        <div className="md:col-span-2 mt-2">
          <GenerationSettingsSection
            hiresFixConfig={hiresFixConfig}
            onHiresFixConfigChange={setHiresFixConfig}
            projectResolution={projectResolution}
            projectAspectRatio={projectAspectRatio}
            disabled={automatedSubmitButton.isSubmitting || !hasApiKey}
            isLocalGeneration={isLocalGenerationEnabled}
          />
        </div>

        {/* Spacer to ensure content can scroll above sticky footer (only when not using portal) */}
        {stickyFooter && !footerPortalId && <div className="h-4" />}

        {/* Footer: portaled when footerPortalId provided, sticky when stickyFooter without portal, inline otherwise */}
        {(() => {
          const footerContent = (
            <div className={
              stickyFooter
                ? footerPortalId
                  ? "px-6 py-3 bg-background border-t border-zinc-700" // Portaled footer
                  : "sticky bottom-0 z-50 !mt-0 -mx-6 px-6 py-3 bg-background border-t border-zinc-700" // Sticky footer
                : "border-t border-border pt-6 mt-2" // Inline footer (tool page)
            }>
              <GenerateControls
                imagesPerPrompt={imagesPerPrompt}
                onChangeImagesPerPrompt={handleSliderChange(setImagesPerPrompt)}
                actionablePromptsCount={actionablePromptsCount}
                isGenerating={automatedSubmitButton.isSubmitting}
                hasApiKey={hasApiKey}
                justQueued={automatedSubmitButton.isSuccess}
                promptMode={effectivePromptMode}
                onUseExistingPrompts={handleUseExistingPrompts}
                onNewPromptsLikeExisting={handleNewPromptsLikeExisting}
                promptMultiplier={promptMultiplier}
                onChangePromptMultiplier={setPromptMultiplier}
              />
            </div>
          );

          // Portal footer outside scroll container when footerPortalId is provided
          if (stickyFooter && footerPortalId) {
            const portalTarget = document.getElementById(footerPortalId);
            return portalTarget ? createPortal(footerContent, portalTarget) : footerContent;
          }
          return footerContent;
        })()}
      </form>

      <ChunkLoadErrorBoundary>
        <Suspense fallback={<div className="sr-only">Loading...</div>}>
          <LazyLoraSelectorModal
            isOpen={loraManager.isLoraModalOpen}
            onClose={() => loraManager.setIsLoraModalOpen(false)}
            loras={availableLoras}
            onAddLora={handleAddLora}
            onRemoveLora={handleRemoveLora}
            onUpdateLoraStrength={handleLoraStrengthChange}
            selectedLoras={loraManager.selectedLoras.map(lora => {
              const fullLora = availableLoras.find(loraModel => loraModel['Model ID'] === lora.id);
              return {
                ...fullLora,
                "Model ID": lora.id,
                Name: lora.name,
                strength: lora.strength,
              } as LoraModel & { strength: number };
            })}
            lora_type={generationSource === 'just-text' ? getLoraTypeForModel(selectedTextModel) : BY_REFERENCE_LORA_TYPE}
          />
        </Suspense>
      </ChunkLoadErrorBoundary>

      <ChunkLoadErrorBoundary>
        <Suspense fallback={<div className="sr-only">Loading...</div>}>
          <LazyPromptEditorModal
            isOpen={uiState.isPromptModalOpen}
            onClose={() => uiActions.closePromptModal()}
            prompts={prompts}
            onSave={handleSavePromptsFromModal}
            generatePromptId={generatePromptId}
            apiKey={openaiApiKey}
            openWithAIExpanded={uiState.openPromptModalWithAIExpanded}
            onGenerateAndQueue={handleGenerateAndQueue}
          />
        </Suspense>
      </ChunkLoadErrorBoundary>

      <CreateShotModal
        isOpen={uiState.isCreateShotModalOpen}
        onClose={() => uiActions.setCreateShotModalOpen(false)}
        onSubmit={handleCreateShot}
        isLoading={isCreatingShot}
        projectId={selectedProjectId}
      />
    </ImageGenerationFormProvider>
  );
});

ImageGenerationForm.displayName = 'ImageGenerationForm';