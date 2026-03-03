import { useEffect, useRef, useCallback, useMemo } from "react";
import { useUpdateShotImageOrder, useAddImageToShotWithoutPosition } from "@/shared/hooks/shots";
import { useShotCreation } from "@/shared/hooks/useShotCreation";
import { useIsMobile } from "@/shared/hooks/mobile";
import { Shot } from '@/domains/generation/types';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { useQueryClient } from '@tanstack/react-query';

// Import modular components and hooks
import { ShotEditorProps, GenerationsPaneSettings } from './state/types';
import { useShotEditorState } from './state/useShotEditorState';
import {
  useGenerationActions,
  useLoraSync,
  useApplySettingsHandler,
  useModeReadiness,
  useShotActions,
  useShotEditorSetup,
  useShotSettingsValue,
  useShotEditorBridge,
  useLastVideoGeneration,
  useAspectAdjustedColumns,
} from './hooks';
// Direct context hooks (no more props fallback - context is always available)
import {
  usePromptSettings,
  useMotionSettings,
  useFrameSettings,
  usePhaseConfigSettings,
  useGenerationModeSettings,
  useSteerableMotionSettings,
  useLoraSettings,
  useVideoTravelSettings,
} from '@/tools/travel-between-images/providers';
import { useAddImageToShot, useRemoveImageFromShot } from '@/shared/hooks/shots';
import { ShotEditorLayoutProps } from './ShotEditorLayout';
import { useOutputController } from './controllers/useOutputController';
import { useEditingController } from './controllers/useEditingController';
import { useGenerationController } from './controllers/useGenerationController';
import { useImageManagementController } from './controllers/useImageManagementController';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';

interface ShotEditorControllerResult {
  hasSelectedShot: boolean;
  layoutProps: ShotEditorLayoutProps;
}

type ShotEditorGenerationControllerInput = Parameters<typeof useGenerationController>[0];

function buildShotEditorGenerationControllerInput(
  slices: {
    core: ShotEditorGenerationControllerInput['core'];
    prompt: ShotEditorGenerationControllerInput['prompt'];
    motion: ShotEditorGenerationControllerInput['motion'];
    join: ShotEditorGenerationControllerInput['join'];
    runtime: ShotEditorGenerationControllerInput['runtime'];
  },
): ShotEditorGenerationControllerInput {
  return {
    core: slices.core,
    prompt: slices.prompt,
    motion: slices.motion,
    join: slices.join,
    runtime: slices.runtime,
  };
}

export function useShotEditorController({
  // Core identifiers
  selectedShotId,
  projectId,
  optimisticShotData,
  // Callbacks
  onShotImagesUpdate,
  onBack,
  // Dimension settings (not in context yet)
  dimensionSource,
  onDimensionSourceChange,
  customWidth,
  onCustomWidthChange,
  customHeight,
  onCustomHeightChange,
  // Navigation
  onPreviousShot,
  onNextShot,
  // onPreviousShotNoScroll, // Currently unused
  // onNextShotNoScroll, // Currently unused
  hasPrevious,
  hasNext,
  onUpdateShotName,
  // Cache & video counts
  // getShotVideoCount, // Currently unused
  getFinalVideoCount,
  getHasStructureVideo,
  // invalidateVideoCountsCache, // Currently unused
  // Parent refs for floating UI
  headerContainerRef: parentHeaderRef,
  timelineSectionRef: parentTimelineRef,
  ctaContainerRef: parentCtaRef,
  onSelectionChange: parentOnSelectionChange,
  getGenerationDataRef: parentGetGenerationDataRef,
  generateVideoRef: parentGenerateVideoRef,
  nameClickRef: parentNameClickRef,
  // UI state
  isSticky,
  variantName: parentVariantName,
  onVariantNameChange: parentOnVariantNameChange,
  isGeneratingVideo: parentIsGeneratingVideo,
  videoJustQueued: parentVideoJustQueued,
  onDragStateChange,
}: ShotEditorProps): ShotEditorControllerResult {

  // ============================================================================
  // SETTINGS FROM CONTEXT (VideoTravelSettingsProvider is required)
  // ============================================================================
  // All settings come from VideoTravelSettingsProvider context.
  // This component MUST be wrapped in VideoTravelSettingsProvider.

  const promptSettings = usePromptSettings();
  const motionSettings = useMotionSettings();
  const frameSettings = useFrameSettings();
  const phaseConfigSettings = usePhaseConfigSettings();
  const generationModeSettings = useGenerationModeSettings();
  const steerableMotionSettingsFromContext = useSteerableMotionSettings();
  const loraSettingsFromContext = useLoraSettings();
  const { isLoading: settingsLoadingFromContext } = useVideoTravelSettings();
  // Note: useSettingsSave provides onBlurSave but it's handled by context consumers

  // Derive advancedMode from motionMode - single source of truth
  const advancedMode = motionSettings.motionMode === 'advanced';

  // ============================================================================
  // SETUP HOOK - Shot resolution, image queries, and stability refs
  // ============================================================================
  const {
    selectedShot,
    shots,
    selectedProjectId,
    projects,
    effectiveAspectRatio,
    allShotImages,
    timelineImages,
    unpositionedImages,
    videoOutputs,
    contextImages,
    initialParentGenerations,
    refs: { selectedShotRef, projectIdRef, allShotImagesRef, batchVideoFramesRef },
  } = useShotEditorSetup({
    selectedShotId,
    projectId,
    optimisticShotData: optimisticShotData as Shot | undefined,
    batchVideoFrames: frameSettings.batchVideoFrames,
  });

  // Call all hooks first (Rules of Hooks)
  const queryClient = useQueryClient();

  // Navigation hooks
  const { setCurrentShotId } = useCurrentShot(); // For navigating to shots
  const { navigateToShot } = useShotNavigation(); // For proper navigation with URL update

  // Shot management hooks for external generation viewing
  const { createShot } = useShotCreation();
  const { mutateAsync: addToShotMutation } = useAddImageToShot();
  const { mutateAsync: addToShotWithoutPositionMutation } = useAddImageToShotWithoutPosition();

  // Refs for mutation functions — React Query mutations change reference on
  // state transitions (idle -> pending -> success), which would recreate callbacks.
  const createShotRef = useRef(createShot);
  createShotRef.current = createShot;
  const addToShotMutationRef = useRef(addToShotMutation);
  addToShotMutationRef.current = addToShotMutation;
  const addToShotWithoutPositionMutationRef = useRef(addToShotWithoutPositionMutation);
  addToShotWithoutPositionMutationRef.current = addToShotWithoutPositionMutation;

  // Forward drag state to parent
  const handleDragStateChange = useCallback((isDragging: boolean) => {
    onDragStateChange?.(isDragging);
  }, [onDragStateChange]);

  // Note: effectiveAspectRatio is provided by useShotEditorSetup

  // Note: Image queries (useShotImages, useTimelineImages, etc.) are now
  // handled by useShotEditorSetup. Values available: allShotImages, timelineImages,
  // unpositionedImages, videoOutputs, contextImages, isLoadingFullImages, initialParentGenerations

  const lastVideoGeneration = useLastVideoGeneration(selectedShotId);

  // Note: Image selectors (timelineImages, unpositionedImages, videoOutputs, etc.) and
  // stability refs (allShotImagesRef, batchVideoFramesRef) now come from useShotEditorSetup

  const updateShotImageOrderMutation = useUpdateShotImageOrder();
  // Shot-specific UI settings stored in database
  const { 
    settings: shotUISettings, 
    update: updateShotUISettings,
    isLoading: isShotUISettingsLoading 
  } = useToolSettings<{
    acceleratedMode?: boolean;
    randomSeed?: boolean;
  }>(SETTINGS_IDS.TRAVEL_UI_STATE, { 
    projectId: selectedProjectId, 
    shotId: selectedShot?.id,
    enabled: !!selectedShot?.id 
  });

  const isMobile = useIsMobile();
  const { isPhone, aspectAdjustedColumns } = useAspectAdjustedColumns(effectiveAspectRatio);
  const { setIsGenerationsPaneLocked } = usePanes();


  // Use shots.settings to store GenerationsPane settings (shared with useGenerationsPageLogic)
  const { update: updateShotGenerationsPaneSettings } = useToolSettings<GenerationsPaneSettings>(SETTINGS_IDS.GENERATIONS_PANE, {
    shotId: selectedShotId,
    enabled: !!selectedShotId
  });

  // Use the new modular state management
  const { state, actions } = useShotEditorState();

  // Refs for context/hook values to keep callbacks stable
  const setIsGenerationsPaneLockedRef = useRef(setIsGenerationsPaneLocked);
  setIsGenerationsPaneLockedRef.current = setIsGenerationsPaneLocked;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const updateShotGenerationsPaneSettingsRef = useRef(updateShotGenerationsPaneSettings);
  updateShotGenerationsPaneSettingsRef.current = updateShotGenerationsPaneSettings;

  // ============================================================================
  // REFS FOR PARENT-CONTROLLED FLOATING UI
  // ============================================================================
  // Other local refs
  const centerSectionRef = useRef<HTMLDivElement>(null);
  const videoGalleryRef = useRef<HTMLDivElement>(null);
  const generateVideosCardRef = useRef<HTMLDivElement>(null);
  const joinSegmentsSectionRef = useRef<HTMLDivElement>(null);
  const swapButtonRef = useRef<HTMLButtonElement>(null);

  // STICKY HEADER & FLOATING CTA LOGIC MOVED TO PARENT (VideoTravelToolPage)
  // Parent manages:
  // - Scroll detection via useStickyHeader and useFloatingCTA hooks
  // - Rendering of floating elements
  // - Element visibility and positioning
  // - Click handlers for floating UI that scroll and trigger actions

  // Use the LoRA sync hook - now using context values
  // These values come from VideoTravelSettingsProvider via bridge hooks
  const { loraManager } = useLoraSync({
    selectedLoras: loraSettingsFromContext.selectedLoras,
    onSelectedLorasChange: loraSettingsFromContext.setSelectedLoras,
    projectId: selectedProjectId,
    availableLoras: loraSettingsFromContext.availableLoras,
    batchVideoPrompt: promptSettings.prompt,
    onBatchVideoPromptChange: promptSettings.setPrompt,
  });
  
  // LoRA loading state - set to false since the new hook doesn't have async loading
  // (the old implementation had shot-specific LoRA settings from database)
  const isShotLoraSettingsLoading = false;

  // ============================================================================
  // OUTPUT + EDITING CONTROLLERS
  // ============================================================================
  const {
    selectedOutputId,
    setSelectedOutputId,
    parentGenerations,
    segmentProgress,
    isSegmentOutputsLoading,
    joinSegmentSlots,
    joinSelectedParent,
    demoteOrphanedVariants,
  } = useOutputController({
    selectedProjectId,
    selectedShotId,
    selectedShot: selectedShot ?? null,
    projectId,
    timelineImages,
  });

  const { mediaEditing, joinWorkflow } = useEditingController({
    core: {
      selectedShotId,
      projectId,
      selectedProjectId,
      selectedShot: selectedShot ?? null,
      effectiveAspectRatio,
      swapButtonRef,
    },
    nameEditing: {
      onUpdateShotName,
      state: { isEditingName: state.isEditingName, editingName: state.editingName },
      actions,
    },
    generationType: {
      generationTypeMode: phaseConfigSettings.generationTypeMode,
      setGenerationTypeMode: phaseConfigSettings.setGenerationTypeMode,
    },
    joinInputs: {
      joinSegmentSlots,
      joinSelectedParent,
    },
  });

  const {
    structureVideoPath,
    structureVideoMetadata,
    structureVideoTreatment,
    structureVideoMotionStrength,
    structureVideoType,
    structureVideoResourceId,
    structureVideoUni3cEndPercent,
    isStructureVideoSettingsLoading,
    structureVideos,
    addStructureVideo,
    updateStructureVideo,
    removeStructureVideo,
    clearAllStructureVideos,
    setStructureVideos,
    handleUni3cEndPercentChange,
    handleStructureVideoMotionStrengthChange,
    handleStructureTypeChangeFromMotionControl,
    handleStructureVideoInputChange,
    audioUrl,
    audioMetadata,
    handleAudioChange,
    isAudioSettingsLoading,
    handleNameClick,
    handleNameSave,
    handleNameCancel,
    handleNameKeyDown,
  } = mediaEditing;

  const {
    joinSettings,
    joinPrompt,
    joinNegativePrompt,
    joinContextFrames,
    joinGapFrames,
    joinReplaceMode,
    joinKeepBridgingImages,
    joinEnhancePrompt,
    joinModel,
    joinNumInferenceSteps,
    joinGuidanceScale,
    joinSeed,
    joinMotionMode,
    joinPhaseConfig,
    joinSelectedPhasePresetId,
    joinRandomSeed,
    joinPriority,
    joinUseInputVideoResolution,
    joinUseInputVideoFps,
    joinNoisedInputVideo,
    joinLoopFirstClip,
    generateMode,
    joinSelectedLoras,
    stitchAfterGenerate,
    setGenerateMode,
    toggleGenerateModePreserveScroll,
    joinLoraManager,
    isJoiningClips,
    joinClipsSuccess,
    joinValidationData,
    handleJoinSegments,
    handleRestoreJoinDefaults,
  } = joinWorkflow;

  // Use generation actions hook
  const generationActions = useGenerationActions({
    state,
    actions,
    selectedShot: selectedShot || {} as Shot,
    projectId,
    batchVideoFrames: frameSettings.batchVideoFrames,
    orderedShotImages: allShotImages, // Pass all images; hook uses ref for stability
  });

  // REMOVED: Local optimistic list sync - no longer needed with two-phase loading

  // Function to update GenerationsPane settings for current shot
  // Wrap in useCallback to prevent recreation on every render
  const selectedShotIdRef = useRef(selectedShotId);
  selectedShotIdRef.current = selectedShotId;
  
  const updateGenerationsPaneSettings = useCallback((settings: Partial<GenerationsPaneSettings>) => {
    const shotId = selectedShotIdRef.current;
    if (shotId) {
      const updatedSettings: GenerationsPaneSettings = {
        selectedShotFilter: settings.selectedShotFilter || shotId,
        excludePositioned: settings.excludePositioned ?? true,
        userHasCustomized: true // Mark as customized since this is being called programmatically
      };
      updateShotGenerationsPaneSettingsRef.current('shot', updatedSettings);
    }
  }, []); // Uses refs for all dependencies

  // ============================================================================
  // SHOT ACTIONS (extracted to useShotActions hook)
  // ============================================================================
  const shotActions = useShotActions({
    projectIdRef,
    selectedShotRef,
    allShotImagesRef,
    addToShotMutationRef,
    addToShotWithoutPositionMutationRef,
    createShotRef,
    setIsGenerationsPaneLockedRef,
    shots,
    navigateToShot,
    setCurrentShotId,
    updateGenerationsPaneSettings,
    isMobile,
    selectedShot,
  });

  // ============================================================================
  // MODE READINESS (extracted to useModeReadiness hook)
  // ============================================================================
  useModeReadiness({
    selectedShot,
    contextImages,
    settingsLoading: settingsLoadingFromContext || false,
    isShotUISettingsLoading,
    isShotLoraSettingsLoading,
    isPhone,
    isMobile,
    generationMode: generationModeSettings.generationMode || 'batch',
    state,
    actions,
    onGenerationModeChange: generationModeSettings.setGenerationMode,
  });

  // Accelerated mode and random seed from database settings
  const accelerated = shotUISettings?.acceleratedMode ?? false;
  const randomSeed = shotUISettings?.randomSeed ?? false;

  // Alias for backwards compatibility with existing code
  const simpleFilteredImages = timelineImages;
  const turboMode = motionSettings.turboMode;
  const setTurboMode = motionSettings.setTurboMode;

  // Auto-disable turbo mode when there are more than 2 images
  useEffect(() => {
    if (simpleFilteredImages.length > 2 && turboMode) {
      setTurboMode(false);
    }
  }, [simpleFilteredImages.length, setTurboMode, turboMode]);

  // All modes are always available - no restrictions based on image count
  // Note: Model selection is handled by useGenerateBatch hook

  // Generation controller
  const generationControllerInput = buildShotEditorGenerationControllerInput({
    core: {
      projectId,
      selectedProjectId,
      selectedShotId,
      selectedShot: selectedShot ?? null,
      queryClient,
      onShotImagesUpdate,
      effectiveAspectRatio,
      generationMode: generationModeSettings.generationMode,
    },
    prompt: {
      prompt: promptSettings.prompt,
      onPromptChange: promptSettings.setPrompt,
      enhancePrompt: promptSettings.enhancePrompt,
      textBeforePrompts: promptSettings.textBeforePrompts,
      textAfterPrompts: promptSettings.textAfterPrompts,
      negativePrompt: promptSettings.negativePrompt,
    },
    motion: {
      amountOfMotion: motionSettings.amountOfMotion,
      motionMode: motionSettings.motionMode || 'basic',
      advancedMode,
      phaseConfig: phaseConfigSettings.phaseConfig,
      selectedPhasePresetId: phaseConfigSettings.selectedPhasePresetId,
      steerableMotionSettings: steerableMotionSettingsFromContext.steerableMotionSettings,
      randomSeed,
      turboMode: motionSettings.turboMode,
      generationTypeMode: phaseConfigSettings.generationTypeMode,
      smoothContinuations: motionSettings.smoothContinuations,
      batchVideoFrames: frameSettings.batchVideoFrames,
      selectedLoras: loraManager.selectedLoras,
      structureVideos,
      selectedOutputId,
    },
    join: {
      stitchAfterGenerate,
      joinContextFrames,
      joinGapFrames,
      joinReplaceMode,
      joinKeepBridgingImages,
      joinPrompt,
      joinNegativePrompt,
      joinEnhancePrompt,
      joinModel,
      joinNumInferenceSteps,
      joinGuidanceScale,
      joinSeed,
      joinRandomSeed,
      joinMotionMode,
      joinPhaseConfig,
      joinSelectedPhasePresetId,
      joinSelectedLoras,
      joinPriority,
      joinUseInputVideoResolution,
      joinUseInputVideoFps,
      joinNoisedInputVideo,
      joinLoopFirstClip,
    },
    runtime: {
      accelerated,
      isShotUISettingsLoading,
      settingsLoadingFromContext,
      updateShotUISettings,
      setSteerableMotionSettings: steerableMotionSettingsFromContext.setSteerableMotionSettings,
      setSteps: frameSettings.setSteps,
      setShowStepsNotification: actions.setShowStepsNotification,
    },
  });

  const {
    clearAllEnhancedPrompts,
    updatePairPromptsByIndex,
    loadPositions,
    handleBatchVideoPromptChangeWithClear,
    handleRandomSeedChange,
    handleAcceleratedChange,
    handleStepsChange,
    handleGenerateBatch,
    isSteerableMotionEnqueuing,
    steerableMotionJustQueued,
    isGenerationDisabled,
  } = useGenerationController(generationControllerInput);

  // Mutations for applying settings/images from a task
  const addImageToShotMutation = useAddImageToShot();
  const removeImageFromShotMutation = useRemoveImageFromShot();

  // Apply settings from a completed video task (for "use these settings" feature)
  const applySettingsFromTask = useApplySettingsHandler({
    projectId,
    selectedShotId: selectedShot?.id || '',
    simpleFilteredImages,
    selectedShot: selectedShot ?? undefined,
    availableLoras: loraSettingsFromContext.availableLoras,
    onBatchVideoPromptChange: promptSettings.setPrompt,
    onSteerableMotionSettingsChange: steerableMotionSettingsFromContext.setSteerableMotionSettings,
    onBatchVideoFramesChange: frameSettings.setFrames,
    // onBatchVideoContextChange, // Removed
    onBatchVideoStepsChange: frameSettings.setSteps,
    onDimensionSourceChange,
    onCustomWidthChange,
    onCustomHeightChange,
    onGenerationModeChange: generationModeSettings.setGenerationMode,
    // onAdvancedModeChange now derived - convert to motionMode change
    onAdvancedModeChange: (advanced: boolean) => motionSettings.setMotionMode(advanced ? 'advanced' : 'basic'),
    onMotionModeChange: motionSettings.setMotionMode,
    onGenerationTypeModeChange: phaseConfigSettings.setGenerationTypeMode,
    onPhaseConfigChange: phaseConfigSettings.setPhaseConfig,
    onPhasePresetSelect: phaseConfigSettings.selectPreset,
    onPhasePresetRemove: phaseConfigSettings.removePreset,
    onTurboModeChange: motionSettings.setTurboMode,
    onEnhancePromptChange: promptSettings.setEnhancePrompt,
    onAmountOfMotionChange: motionSettings.setAmountOfMotion,
    onTextBeforePromptsChange: promptSettings.setTextBeforePrompts,
    onTextAfterPromptsChange: promptSettings.setTextAfterPrompts,
    onStructureVideoInputChange: handleStructureVideoInputChange,
    generationMode: generationModeSettings.generationMode,
    generationTypeMode: phaseConfigSettings.generationTypeMode,
    advancedMode: phaseConfigSettings.advancedMode,
    motionMode: motionSettings.motionMode,
    turboMode: motionSettings.turboMode,
    enhancePrompt: promptSettings.enhancePrompt,
    amountOfMotion: motionSettings.amountOfMotion,
    textBeforePrompts: promptSettings.textBeforePrompts,
    textAfterPrompts: promptSettings.textAfterPrompts,
    batchVideoSteps: frameSettings.batchVideoSteps,
    batchVideoFrames: frameSettings.batchVideoFrames,
    // batchVideoContext, // Removed
    steerableMotionSettings: steerableMotionSettingsFromContext.steerableMotionSettings,
    loraManager,
    addImageToShotMutation,
    removeImageFromShotMutation,
    updatePairPromptsByIndex,
    loadPositions,
  });

  // Image management controller
  const {
    isClearingFinalVideo,
    handleDeleteFinalVideo,
    handleReorderImagesInShot,
    handlePendingPositionApplied,
    handleImageUpload,
  } = useImageManagementController({
    queryClient,
    selectedShotRef,
    projectIdRef,
    allShotImagesRef,
    batchVideoFramesRef,
    updateShotImageOrderMutation,
    demoteOrphanedVariants,
    actionsRef,
    pendingFramePositions: state.pendingFramePositions,
    generationActions,
  });

  const { handleSelectionChangeLocal, currentMotionSettings } = useShotEditorBridge({
    parentGetGenerationDataRef,
    parentGenerateVideoRef,
    parentNameClickRef,
    parentOnSelectionChange,
    structureVideoPath,
    structureVideoType,
    structureVideoTreatment,
    structureVideoMotionStrength,
    effectiveAspectRatio,
    selectedLoras: loraManager.selectedLoras,
    clearAllEnhancedPrompts,
    handleGenerateBatch,
    handleNameClick,
    textBeforePrompts: promptSettings.textBeforePrompts,
    textAfterPrompts: promptSettings.textAfterPrompts,
    prompt: promptSettings.prompt,
    negativePrompt: promptSettings.negativePrompt,
    enhancePrompt: promptSettings.enhancePrompt,
    batchVideoFrames: frameSettings.batchVideoFrames,
    lastVideoGeneration,
  });

  // ============================================================================
  // CONTEXT VALUE - Built via extracted hook (memoized)
  // ============================================================================
  // Must be called before early return (Rules of Hooks)
  // If selectedShot is undefined, we return early and this value is never used

  // Memoize domain objects so useShotSettingsValue's useMemo doesn't recompute
  // every render. Without this, inline object literals create new references each
  // render, causing the context value to change and all consumers to re-render.
  const structureVideoMemo = useMemo(() => ({
    structureVideoPath,
    structureVideoMetadata,
    structureVideoTreatment,
    structureVideoMotionStrength,
    structureVideoType,
    structureVideoResourceId,
    structureVideoUni3cEndPercent,
    isLoading: isStructureVideoSettingsLoading,
    structureVideos,
    addStructureVideo,
    updateStructureVideo,
    removeStructureVideo,
    clearAllStructureVideos,
    setStructureVideos,
  }), [
    structureVideoPath, structureVideoMetadata, structureVideoTreatment,
    structureVideoMotionStrength, structureVideoType, structureVideoResourceId,
    structureVideoUni3cEndPercent, isStructureVideoSettingsLoading, structureVideos,
    addStructureVideo, updateStructureVideo, removeStructureVideo,
    clearAllStructureVideos, setStructureVideos,
  ]);

  const structureVideoHandlersMemo = useMemo(() => ({
    handleStructureVideoMotionStrengthChange,
    handleStructureTypeChangeFromMotionControl,
    handleUni3cEndPercentChange,
    handleStructureVideoInputChange,
  }), [
    handleStructureVideoMotionStrengthChange, handleStructureTypeChangeFromMotionControl,
    handleUni3cEndPercentChange, handleStructureVideoInputChange,
  ]);

  const audioMemo = useMemo(() => ({
    audioUrl,
    audioMetadata,
    handleAudioChange,
    isLoading: isAudioSettingsLoading,
  }), [audioUrl, audioMetadata, handleAudioChange, isAudioSettingsLoading]);

  const generationModeMemo = useMemo(() => ({
    generateMode,
    setGenerateMode,
    toggleGenerateModePreserveScroll,
    isGenerationDisabled,
    isSteerableMotionEnqueuing,
    steerableMotionJustQueued,
    currentMotionSettings,
    accelerated,
    onAcceleratedChange: handleAcceleratedChange,
    randomSeed,
    onRandomSeedChange: handleRandomSeedChange,
  }), [
    generateMode, setGenerateMode, toggleGenerateModePreserveScroll,
    isGenerationDisabled, isSteerableMotionEnqueuing, steerableMotionJustQueued,
    currentMotionSettings, accelerated, handleAcceleratedChange,
    randomSeed, handleRandomSeedChange,
  ]);

  const generationHandlersMemo = useMemo(() => ({
    handleGenerateBatch,
    handleBatchVideoPromptChangeWithClear,
    handleStepsChange,
    clearAllEnhancedPrompts,
  }), [handleGenerateBatch, handleBatchVideoPromptChangeWithClear, handleStepsChange, clearAllEnhancedPrompts]);

  const joinSettingsForContext = useMemo(() => ({
    settings: joinSettings.settings,
    updateField: joinSettings.updateField,
    updateFields: joinSettings.updateFields,
  }), [joinSettings.settings, joinSettings.updateField, joinSettings.updateFields]);

  const joinStateMemo = useMemo(() => ({
    joinSettings: joinSettingsForContext,
    joinLoraManager,
    joinValidationData,
    handleJoinSegments,
    isJoiningClips,
    joinClipsSuccess,
    handleRestoreJoinDefaults,
  }), [
    joinSettingsForContext, joinLoraManager, joinValidationData,
    handleJoinSegments, isJoiningClips, joinClipsSuccess, handleRestoreJoinDefaults,
  ]);

  const dimensionsMemo = useMemo(() => ({
    dimensionSource,
    onDimensionSourceChange,
    customWidth,
    onCustomWidthChange,
    customHeight,
    onCustomHeightChange,
  }), [dimensionSource, onDimensionSourceChange, customWidth, onCustomWidthChange, customHeight, onCustomHeightChange]);

  const contextValue = useShotSettingsValue({
    // Core
    selectedShot: selectedShot!,
    selectedShotId,
    projectId,
    selectedProjectId,
    effectiveAspectRatio,
    projects,
    // UI state
    state,
    actions,
    // LoRA
    loraManager,
    availableLoras: loraSettingsFromContext.availableLoras,
    // Images
    allShotImages,
    timelineImages,
    unpositionedImages,
    contextImages,
    videoOutputs,
    simpleFilteredImages,
    // Structure video
    structureVideo: structureVideoMemo,
    structureVideoHandlers: structureVideoHandlersMemo,
    // Audio
    audio: audioMemo,
    // Image handlers
    generationActions,
    handleImageReorder: handleReorderImagesInShot,
    handleImageUpload,
    // Shot management
    shots,
    shotActions,
    // Generation mode state
    generationMode: generationModeMemo,
    // Generation handlers
    generationHandlers: generationHandlersMemo,
    // Join state
    joinState: joinStateMemo,
    // Dimension settings
    dimensions: dimensionsMemo,
    // Query client
    queryClient,
  });

  const layoutProps: ShotEditorLayoutProps = {
    contextValue,
    header: {
      onBack,
      onPreviousShot,
      onNextShot,
      hasPrevious,
      hasNext,
      onUpdateShotName,
      onNameClick: handleNameClick,
      onNameSave: handleNameSave,
      onNameCancel: handleNameCancel,
      onNameKeyDown: handleNameKeyDown,
      headerContainerRef: parentHeaderRef,
      centerSectionRef,
      isSticky,
    },
    finalVideo: {
      selectedShotId,
      projectId,
      effectiveAspectRatio,
      onApplySettingsFromTask: applySettingsFromTask,
      onJoinSegmentsClick: () => {
        setGenerateMode('join');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const target = generateVideosCardRef.current;
            if (target) {
              const rect = target.getBoundingClientRect();
              const scrollTop = window.scrollY + rect.top - 20;
              window.scrollTo({ top: scrollTop, behavior: 'smooth' });
            }
          });
        });
      },
      selectedOutputId,
      onSelectedOutputChange: setSelectedOutputId,
      parentGenerations,
      initialParentGenerations,
      segmentProgress,
      isSegmentOutputsLoading,
      getFinalVideoCount,
      onDeleteFinalVideo: handleDeleteFinalVideo,
      isClearingFinalVideo,
      videoGalleryRef,
      generateVideosCardRef,
    },
    timeline: {
      timelineSectionRef: parentTimelineRef,
      isModeReady: state.isModeReady,
      settingsError: state.settingsError,
      isPhone,
      generationMode: generationModeSettings.generationMode,
      onGenerationModeChange: generationModeSettings.setGenerationMode,
      batchVideoFrames: frameSettings.batchVideoFrames,
      onBatchVideoFramesChange: frameSettings.setFrames,
      aspectAdjustedColumns: aspectAdjustedColumns as 2 | 3 | 4 | 6,
      pendingFramePositions: state.pendingFramePositions,
      onPendingPositionApplied: handlePendingPositionApplied,
      onSelectionChange: handleSelectionChangeLocal,
      prompt: promptSettings.prompt,
      onPromptChange: promptSettings.setPrompt,
      negativePrompt: promptSettings.negativePrompt,
      onNegativePromptChange: promptSettings.setNegativePrompt,
      smoothContinuations: motionSettings.smoothContinuations,
      onDragStateChange: handleDragStateChange,
      getHasStructureVideo,
    },
    generation: {
      ctaContainerRef: parentCtaRef,
      swapButtonRef,
      joinSegmentsSectionRef,
      parentVariantName,
      parentOnVariantNameChange,
      parentIsGeneratingVideo,
      parentVideoJustQueued,
    },
    modals: {
      isLoraModalOpen: loraManager.isLoraModalOpen,
      onLoraModalClose: () => loraManager.setIsLoraModalOpen(false),
      onAddLora: loraManager.handleAddLora,
      onRemoveLora: loraManager.handleRemoveLora,
      onUpdateLoraStrength: loraManager.handleLoraStrengthChange,
      selectedLoras: loraManager.selectedLoras,
      isSettingsModalOpen: state.isSettingsModalOpen,
      onSettingsModalOpenChange: actions.setSettingsModalOpen,
    },
  };

  return {
    hasSelectedShot: Boolean(selectedShot),
    layoutProps,
  };
}
