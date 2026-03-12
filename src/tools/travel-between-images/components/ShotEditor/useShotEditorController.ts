import { useEffect, useRef, useCallback } from "react";
import { useUpdateShotImageOrder, useAddImageToShot, useRemoveImageFromShot } from "@/shared/hooks/shots";
import { useShotCreation } from "@/shared/hooks/shotCreation/useShotCreation";
import { useIsMobile } from "@/shared/hooks/mobile";
import { Shot } from '@/domains/generation/types';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useToolSettings } from '@/shared/hooks/settings/useToolSettings';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useShotNavigation } from '@/shared/hooks/shots/useShotNavigation';
import { useQueryClient } from '@tanstack/react-query';

// Import modular components and hooks
import { ShotEditorProps, GenerationsPaneSettings } from './state/types';
import { useShotEditorState } from './state/useShotEditorState';
import { useGenerationActions } from './hooks/actions/useGenerationActions';
import { useLoraSync } from './hooks/editor-state/useLoraSync';
import { useModeReadiness } from './hooks/video/useModeReadiness';
import { useShotActions } from './hooks/actions/useShotActions';
import { useShotEditorSetup } from './hooks/editor-state/useShotEditorSetup';
import { useShotEditorBridge } from './hooks/editor-state/useShotEditorBridge';
import { useLastVideoGeneration } from './hooks/video/useLastVideoGeneration';
import { useAspectAdjustedColumns } from './hooks/editor-state/useAspectAdjustedColumns';
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
import { ShotEditorLayoutProps } from './ShotEditorLayout';
import { useGenerationController } from './controllers/useGenerationController';
import { useImageManagementController } from './controllers/useImageManagementController';
import { useGenerationControllerInputModel } from './controllers/useGenerationControllerInputModel';
import { useShotEditorMediaAndOutputControllers } from './controllers/useShotEditorMediaAndOutputControllers';
import {
  buildShotEditorContextInput,
  useShotEditorLayoutModel,
} from './controllers/useShotEditorLayoutModel';
import { useApplySettingsHandler } from './hooks/actions/useApplySettingsHandler';
import { useShotSettingsValue } from './hooks/editor-state/useShotSettingsValue';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';

interface ShotEditorControllerResult {
  hasSelectedShot: boolean;
  layoutProps: ShotEditorLayoutProps;
}

export function useShotEditorController({
  selectedShotId,
  projectId,
  optimisticShotData,
  onShotImagesUpdate,
  onBack,
  dimensionSource,
  onDimensionSourceChange,
  customWidth,
  onCustomWidthChange,
  customHeight,
  onCustomHeightChange,
  onPreviousShot,
  onNextShot,
  hasPrevious,
  hasNext,
  onUpdateShotName,
  getFinalVideoCount,
  getHasStructureVideo,
  headerContainerRef: parentHeaderRef,
  timelineSectionRef: parentTimelineRef,
  ctaContainerRef: parentCtaRef,
  onSelectionChange: parentOnSelectionChange,
  getGenerationDataRef: parentGetGenerationDataRef,
  generateVideoRef: parentGenerateVideoRef,
  nameClickRef: parentNameClickRef,
  isSticky,
  variantName: parentVariantName,
  onVariantNameChange: parentOnVariantNameChange,
  isGeneratingVideo: parentIsGeneratingVideo,
  videoJustQueued: parentVideoJustQueued,
  onDragStateChange,
}: ShotEditorProps): ShotEditorControllerResult {
  const promptSettings = usePromptSettings();
  const motionSettings = useMotionSettings();
  const frameSettings = useFrameSettings();
  const phaseConfigSettings = usePhaseConfigSettings();
  const generationModeSettings = useGenerationModeSettings();
  const steerableMotionSettingsFromContext = useSteerableMotionSettings();
  const loraSettingsFromContext = useLoraSettings();
  const { isLoading: settingsLoadingFromContext } = useVideoTravelSettings();

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

  const queryClient = useQueryClient();
  const { setCurrentShotId } = useCurrentShot();
  const { navigateToShot } = useShotNavigation();
  const { createShot } = useShotCreation();
  const addImageToShotMutation = useAddImageToShot();
  const removeImageFromShotMutation = useRemoveImageFromShot();
  const { mutateAsync: addToShotMutation, mutateAsyncWithoutPosition: addToShotWithoutPositionMutation } = addImageToShotMutation;

  const createShotRef = useRef(createShot);
  createShotRef.current = createShot;
  const addToShotMutationRef = useRef(addToShotMutation);
  addToShotMutationRef.current = addToShotMutation;
  const addToShotWithoutPositionMutationRef = useRef(addToShotWithoutPositionMutation);
  addToShotWithoutPositionMutationRef.current = addToShotWithoutPositionMutation;

  const handleDragStateChange = useCallback((isDragging: boolean) => {
    onDragStateChange?.(isDragging);
  }, [onDragStateChange]);

  const lastVideoGeneration = useLastVideoGeneration(selectedShotId);

  const updateShotImageOrderMutation = useUpdateShotImageOrder();
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

  const { update: updateShotGenerationsPaneSettings } = useToolSettings<GenerationsPaneSettings>(SETTINGS_IDS.GENERATIONS_PANE, {
    shotId: selectedShotId,
    enabled: !!selectedShotId
  });

  const { state, actions } = useShotEditorState();

  const setIsGenerationsPaneLockedRef = useRef(setIsGenerationsPaneLocked);
  setIsGenerationsPaneLockedRef.current = setIsGenerationsPaneLocked;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const updateShotGenerationsPaneSettingsRef = useRef(updateShotGenerationsPaneSettings);
  updateShotGenerationsPaneSettingsRef.current = updateShotGenerationsPaneSettings;

  const centerSectionRef = useRef<HTMLDivElement>(null);
  const videoGalleryRef = useRef<HTMLDivElement>(null);
  const generateVideosCardRef = useRef<HTMLDivElement>(null);
  const joinSegmentsSectionRef = useRef<HTMLDivElement>(null);
  const swapButtonRef = useRef<HTMLButtonElement>(null);

  const { loraManager } = useLoraSync({
    selectedLoras: loraSettingsFromContext.selectedLoras,
    onSelectedLorasChange: loraSettingsFromContext.setSelectedLoras,
    projectId: selectedProjectId,
    availableLoras: loraSettingsFromContext.availableLoras,
    batchVideoPrompt: promptSettings.prompt,
    onBatchVideoPromptChange: promptSettings.setPrompt,
  });
  const isShotLoraSettingsLoading = false;

  const { output, editing } = useShotEditorMediaAndOutputControllers({
    selectedProjectId,
    selectedShotId,
    selectedShot: selectedShot ?? null,
    projectId,
    timelineImages,
    effectiveAspectRatio,
    swapButtonRef,
    onUpdateShotName,
    state: { isEditingName: state.isEditingName, editingName: state.editingName },
    actions,
    generationTypeMode: phaseConfigSettings.generationTypeMode,
    setGenerationTypeMode: phaseConfigSettings.setGenerationTypeMode,
  });
  const { mediaEditing, joinWorkflow } = editing;
  const selectedOutputId = output.selectedOutputId;
  const demoteOrphanedVariants = output.demoteOrphanedVariants;

  const generationActions = useGenerationActions({
    state,
    actions,
    selectedShot: selectedShot || {} as Shot,
    projectId,
    batchVideoFrames: frameSettings.batchVideoFrames,
    orderedShotImages: allShotImages,
  });

  const selectedShotIdRef = useRef(selectedShotId);
  selectedShotIdRef.current = selectedShotId;
  
  const updateGenerationsPaneSettings = useCallback((settings: Partial<GenerationsPaneSettings>) => {
    const shotId = selectedShotIdRef.current;
    if (shotId) {
      const updatedSettings: GenerationsPaneSettings = {
        selectedShotFilter: settings.selectedShotFilter || shotId,
        excludePositioned: settings.excludePositioned ?? true,
        userHasCustomized: true
      };
      updateShotGenerationsPaneSettingsRef.current('shot', updatedSettings);
    }
  }, []);

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

  const accelerated = shotUISettings?.acceleratedMode ?? false;
  const randomSeed = shotUISettings?.randomSeed ?? false;

  const simpleFilteredImages = timelineImages;
  const turboMode = motionSettings.turboMode;
  const setTurboMode = motionSettings.setTurboMode;

  useEffect(() => {
    if (simpleFilteredImages.length > 2 && turboMode) {
      setTurboMode(false);
    }
  }, [simpleFilteredImages.length, setTurboMode, turboMode]);

  const generationControllerInput = useGenerationControllerInputModel({
    core: {
      projectId,
      selectedProjectId,
      selectedShotId,
      selectedShot: selectedShot ?? null,
      queryClient,
      onShotImagesUpdate,
      effectiveAspectRatio,
    },
    promptSettings,
    motionSettings,
    frameSettings,
    phaseConfigSettings,
    generationModeSettings,
    steerableMotionSettings: steerableMotionSettingsFromContext,
    loraManager,
    mediaEditing,
    selectedOutputId,
    joinWorkflow,
    runtime: {
      accelerated,
      randomSeed,
      isShotUISettingsLoading,
      settingsLoadingFromContext,
      updateShotUISettings,
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

  const applySettingsFromTask = useApplySettingsHandler({
    core: {
      projectId,
      selectedShot: selectedShot ?? undefined,
      simpleFilteredImages,
    },
    contexts: {
      model: {
        steerableMotionSettings: steerableMotionSettingsFromContext.steerableMotionSettings,
        onSteerableMotionSettingsChange: steerableMotionSettingsFromContext.setSteerableMotionSettings,
      },
      prompts: {
        onBatchVideoPromptChange: promptSettings.setPrompt,
        onSteerableMotionSettingsChange: steerableMotionSettingsFromContext.setSteerableMotionSettings,
        updatePairPromptsByIndex,
      },
      generation: {
        onBatchVideoFramesChange: frameSettings.setFrames,
        onBatchVideoStepsChange: frameSettings.setSteps,
      },
      modes: {
        onGenerationModeChange: generationModeSettings.setGenerationMode,
        onAdvancedModeChange: (advanced: boolean) => motionSettings.setMotionMode(advanced ? 'advanced' : 'basic'),
        onMotionModeChange: motionSettings.setMotionMode,
        onGenerationTypeModeChange: phaseConfigSettings.setGenerationTypeMode,
      },
      advanced: {
        onPhaseConfigChange: phaseConfigSettings.setPhaseConfig,
        onPhasePresetSelect: phaseConfigSettings.selectPreset,
        onPhasePresetRemove: phaseConfigSettings.removePreset,
        onTurboModeChange: motionSettings.setTurboMode,
        onEnhancePromptChange: promptSettings.setEnhancePrompt,
      },
      textAddons: {
        onTextBeforePromptsChange: promptSettings.setTextBeforePrompts,
        onTextAfterPromptsChange: promptSettings.setTextAfterPrompts,
      },
      motion: {
        onAmountOfMotionChange: motionSettings.setAmountOfMotion,
      },
      loras: {
        availableLoras: loraSettingsFromContext.availableLoras,
        loraManager,
      },
      structureVideo: {
        onStructureVideoInputChange: mediaEditing.handleStructureVideoInputChange,
      },
    },
    mutations: {
      addImageToShotMutation,
      removeImageFromShotMutation,
      loadPositions,
    },
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
    structureVideoPath: mediaEditing.structureVideoPath,
    structureVideoType: mediaEditing.structureVideoType,
    structureVideoTreatment: mediaEditing.structureVideoTreatment,
    structureVideoMotionStrength: mediaEditing.structureVideoMotionStrength,
    effectiveAspectRatio,
    selectedLoras: loraManager.selectedLoras,
    clearAllEnhancedPrompts,
    handleGenerateBatch,
    handleNameClick: mediaEditing.handleNameClick,
    textBeforePrompts: promptSettings.textBeforePrompts,
    textAfterPrompts: promptSettings.textAfterPrompts,
    prompt: promptSettings.prompt,
    negativePrompt: promptSettings.negativePrompt,
    enhancePrompt: promptSettings.enhancePrompt,
    batchVideoFrames: frameSettings.batchVideoFrames,
    lastVideoGeneration,
  });

  const sharedModelArgs = {
    core: {
      selectedShot,
      selectedShotId,
      projectId,
      selectedProjectId,
      effectiveAspectRatio,
      projects,
      state,
      actions,
      queryClient,
    },
    controllers: {
      mediaEditing,
      joinWorkflow,
      output: {
        selectedOutputId: output.selectedOutputId,
        setSelectedOutputId: output.setSelectedOutputId,
        parentGenerations: output.parentGenerations,
        segmentProgress: output.segmentProgress,
        isSegmentOutputsLoading: output.isSegmentOutputsLoading,
      },
      generationActions,
      shotActions,
      generationController: {
        isGenerationDisabled,
        isSteerableMotionEnqueuing,
        steerableMotionJustQueued,
        currentMotionSettings,
        handleAcceleratedChange,
        handleRandomSeedChange,
        handleGenerateBatch,
        handleBatchVideoPromptChangeWithClear,
        handleStepsChange,
        clearAllEnhancedPrompts,
      },
      imageManagement: {
        handleReorderImagesInShot,
        handleImageUpload,
        handlePendingPositionApplied,
        handleDeleteFinalVideo,
        isClearingFinalVideo,
      },
      bridge: {
        handleSelectionChangeLocal,
      },
      loraManager,
      availableLoras: loraSettingsFromContext.availableLoras,
      shots,
    },
    settings: {
      promptSettings,
      motionSettings,
      frameSettings,
      generationModeSettings,
      isPhone,
      aspectAdjustedColumns,
      accelerated,
      randomSeed,
    },
  };

  const contextInput = buildShotEditorContextInput({
    ...sharedModelArgs,
    images: {
      allShotImages,
      timelineImages,
      unpositionedImages,
      contextImages,
      videoOutputs,
      simpleFilteredImages,
    },
    dimensions: {
      dimensionSource,
      onDimensionSourceChange,
      customWidth,
      onCustomWidthChange,
      customHeight,
      onCustomHeightChange,
    },
  });

  const contextValue = useShotSettingsValue(contextInput);

  const layoutProps: ShotEditorLayoutProps = useShotEditorLayoutModel({
    ...sharedModelArgs,
    contextValue,
    sections: {
      onBack,
      onPreviousShot,
      onNextShot,
      hasPrevious,
      hasNext,
      onUpdateShotName,
      headerContainerRef: parentHeaderRef,
      timelineSectionRef: parentTimelineRef,
      ctaContainerRef: parentCtaRef,
      isSticky,
      parentVariantName,
      parentOnVariantNameChange,
      parentIsGeneratingVideo,
      parentVideoJustQueued,
      getFinalVideoCount,
      getHasStructureVideo,
      onDragStateChange: handleDragStateChange,
      refs: {
        centerSectionRef,
        videoGalleryRef,
        generateVideosCardRef,
        joinSegmentsSectionRef,
        swapButtonRef,
      },
      initialParentGenerations,
      applySettingsFromTask,
    },
  });

  return {
    hasSelectedShot: Boolean(selectedShot),
    layoutProps,
  };
}
