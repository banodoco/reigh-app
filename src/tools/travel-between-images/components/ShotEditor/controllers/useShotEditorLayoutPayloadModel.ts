import { useMemo } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { GenerationRow, Shot } from '@/domains/generation/types';
import type { Project } from '@/types/project';
import type { ShotEditorLayoutProps } from '../ShotEditorLayout';
import type { ShotEditorProps, ShotEditorState } from '../state/types';
import type { ShotEditorActions } from '../state/useShotEditorState';
import type { UseShotSettingsValueProps } from '../hooks/editor-state/useShotSettingsValue';
import type { useShotEditorMediaAndOutputControllers } from './useShotEditorMediaAndOutputControllers';

type MediaEditingState = ReturnType<typeof useShotEditorMediaAndOutputControllers>['editing']['mediaEditing'];
type JoinWorkflowState = ReturnType<typeof useShotEditorMediaAndOutputControllers>['editing']['joinWorkflow'];
type OutputState = ReturnType<typeof useShotEditorMediaAndOutputControllers>['output'];

interface PromptSettingsSlice {
  prompt: string;
  setPrompt: (prompt: string) => void;
  negativePrompt: string;
  setNegativePrompt: (prompt: string) => void;
}

interface MotionSettingsSlice {
  smoothContinuations?: boolean;
}

interface FrameSettingsSlice {
  batchVideoFrames: number;
  setFrames: (frames: number) => void;
}

interface GenerationModeSettingsSlice {
  generationMode: 'batch' | 'timeline' | 'by-pair';
  setGenerationMode: (mode: 'batch' | 'timeline' | 'by-pair') => void;
}

interface UseShotEditorLayoutPayloadModelParams {
  core: {
    selectedShot: Shot | undefined;
    selectedShotId: string;
    projectId: string;
    selectedProjectId: string;
    effectiveAspectRatio: string | undefined;
    projects: Project[];
    state: ShotEditorState;
    actions: ShotEditorActions;
    queryClient: QueryClient;
  };
  images: {
    allShotImages: GenerationRow[];
    timelineImages: GenerationRow[];
    unpositionedImages: GenerationRow[];
    contextImages: GenerationRow[];
    videoOutputs: GenerationRow[];
    simpleFilteredImages: GenerationRow[];
  };
  controllers: {
    mediaEditing: MediaEditingState;
    joinWorkflow: JoinWorkflowState;
    output: Pick<OutputState, 'selectedOutputId' | 'setSelectedOutputId' | 'parentGenerations' | 'segmentProgress' | 'isSegmentOutputsLoading'>;
    generationActions: UseShotSettingsValueProps['generationActions'];
    shotActions: UseShotSettingsValueProps['shotActions'];
    generationController: {
      isGenerationDisabled: UseShotSettingsValueProps['generationMode']['isGenerationDisabled'];
      isSteerableMotionEnqueuing: UseShotSettingsValueProps['generationMode']['isSteerableMotionEnqueuing'];
      steerableMotionJustQueued: UseShotSettingsValueProps['generationMode']['steerableMotionJustQueued'];
      currentMotionSettings: UseShotSettingsValueProps['generationMode']['currentMotionSettings'];
      handleAcceleratedChange: UseShotSettingsValueProps['generationMode']['onAcceleratedChange'];
      handleRandomSeedChange: UseShotSettingsValueProps['generationMode']['onRandomSeedChange'];
      handleGenerateBatch: UseShotSettingsValueProps['generationHandlers']['handleGenerateBatch'];
      handleBatchVideoPromptChangeWithClear: UseShotSettingsValueProps['generationHandlers']['handleBatchVideoPromptChangeWithClear'];
      handleStepsChange: UseShotSettingsValueProps['generationHandlers']['handleStepsChange'];
      clearAllEnhancedPrompts: UseShotSettingsValueProps['generationHandlers']['clearAllEnhancedPrompts'];
    };
    imageManagement: {
      handleReorderImagesInShot: UseShotSettingsValueProps['handleImageReorder'];
      handleImageUpload: UseShotSettingsValueProps['handleImageUpload'];
      handlePendingPositionApplied: ShotEditorLayoutProps['timeline']['onPendingPositionApplied'];
      handleDeleteFinalVideo: ShotEditorLayoutProps['finalVideo']['onDeleteFinalVideo'];
      isClearingFinalVideo: boolean;
    };
    bridge: {
      handleSelectionChangeLocal: ShotEditorLayoutProps['timeline']['onSelectionChange'];
    };
    loraManager: UseShotSettingsValueProps['loraManager'];
    availableLoras: UseShotSettingsValueProps['availableLoras'];
    shots: Shot[] | undefined;
  };
  settings: {
    promptSettings: PromptSettingsSlice;
    motionSettings: MotionSettingsSlice;
    frameSettings: FrameSettingsSlice;
    generationModeSettings: GenerationModeSettingsSlice;
    isPhone: boolean;
    aspectAdjustedColumns: number;
    accelerated: boolean;
    randomSeed: boolean;
  };
  dimensions: UseShotSettingsValueProps['dimensions'];
  sections: {
    onBack: ShotEditorProps['onBack'];
    onPreviousShot: ShotEditorProps['onPreviousShot'];
    onNextShot: ShotEditorProps['onNextShot'];
    hasPrevious: ShotEditorProps['hasPrevious'];
    hasNext: ShotEditorProps['hasNext'];
    onUpdateShotName: ShotEditorProps['onUpdateShotName'];
    headerContainerRef: ShotEditorProps['headerContainerRef'];
    timelineSectionRef: ShotEditorProps['timelineSectionRef'];
    ctaContainerRef: ShotEditorProps['ctaContainerRef'];
    isSticky: ShotEditorProps['isSticky'];
    parentVariantName: ShotEditorProps['variantName'];
    parentOnVariantNameChange: ShotEditorProps['onVariantNameChange'];
    parentIsGeneratingVideo: ShotEditorProps['isGeneratingVideo'];
    parentVideoJustQueued: ShotEditorProps['videoJustQueued'];
    getFinalVideoCount: ShotEditorProps['getFinalVideoCount'];
    getHasStructureVideo: ShotEditorProps['getHasStructureVideo'];
    onDragStateChange?: (isDragging: boolean) => void;
    refs: {
      centerSectionRef: React.RefObject<HTMLDivElement>;
      videoGalleryRef: React.RefObject<HTMLDivElement>;
      generateVideosCardRef: React.RefObject<HTMLDivElement>;
      joinSegmentsSectionRef: React.RefObject<HTMLDivElement>;
      swapButtonRef: React.RefObject<HTMLButtonElement>;
    };
    initialParentGenerations: GenerationRow[];
    applySettingsFromTask: ShotEditorLayoutProps['finalVideo']['onApplySettingsFromTask'];
  };
}

export interface ShotEditorLayoutFinalVideoModel extends Omit<ShotEditorLayoutProps['finalVideo'], 'onJoinSegmentsClick'> {
  onRequestJoinMode: () => void;
}

interface ShotEditorLayoutPayloadModel {
  contextInput: UseShotSettingsValueProps;
  headerModel: ShotEditorLayoutProps['header'];
  finalVideoModel: ShotEditorLayoutFinalVideoModel;
  timelineModel: ShotEditorLayoutProps['timeline'];
  generationModel: ShotEditorLayoutProps['generation'];
  modalsModel: ShotEditorLayoutProps['modals'];
}

export function useShotEditorLayoutPayloadModel({
  core,
  images,
  controllers,
  settings,
  dimensions,
  sections,
}: UseShotEditorLayoutPayloadModelParams): ShotEditorLayoutPayloadModel {
  const contextInput = useMemo<UseShotSettingsValueProps>(
    () => ({
      selectedShot: core.selectedShot!,
      selectedShotId: core.selectedShotId,
      projectId: core.projectId,
      selectedProjectId: core.selectedProjectId,
      effectiveAspectRatio: core.effectiveAspectRatio,
      projects: core.projects,
      state: core.state,
      actions: core.actions,
      loraManager: controllers.loraManager,
      availableLoras: controllers.availableLoras,
      allShotImages: images.allShotImages,
      timelineImages: images.timelineImages,
      unpositionedImages: images.unpositionedImages,
      contextImages: images.contextImages,
      videoOutputs: images.videoOutputs,
      simpleFilteredImages: images.simpleFilteredImages,
      structureVideo: {
        structureGuidance: controllers.mediaEditing.structureGuidance,
        structureVideoPath: controllers.mediaEditing.structureVideoPath,
        structureVideoMetadata: controllers.mediaEditing.structureVideoMetadata,
        structureVideoTreatment: controllers.mediaEditing.structureVideoTreatment,
        structureVideoMotionStrength: controllers.mediaEditing.structureVideoMotionStrength,
        structureVideoType: controllers.mediaEditing.structureVideoType,
        structureVideoResourceId: controllers.mediaEditing.structureVideoResourceId,
        structureVideoUni3cEndPercent: controllers.mediaEditing.structureVideoUni3cEndPercent,
        isLoading: controllers.mediaEditing.isStructureVideoSettingsLoading,
        structureVideos: controllers.mediaEditing.structureVideos,
        addStructureVideo: controllers.mediaEditing.addStructureVideo,
        updateStructureVideo: controllers.mediaEditing.updateStructureVideo,
        removeStructureVideo: controllers.mediaEditing.removeStructureVideo,
        clearAllStructureVideos: controllers.mediaEditing.clearAllStructureVideos,
        setStructureVideos: controllers.mediaEditing.setStructureVideos,
      },
      structureVideoHandlers: {
        handleStructureVideoMotionStrengthChange: controllers.mediaEditing.handleStructureVideoMotionStrengthChange,
        handleStructureTypeChangeFromMotionControl: controllers.mediaEditing.handleStructureTypeChangeFromMotionControl,
        handleUni3cEndPercentChange: controllers.mediaEditing.handleUni3cEndPercentChange,
        handleStructureVideoInputChange: controllers.mediaEditing.handleStructureVideoInputChange,
      },
      audio: {
        audioUrl: controllers.mediaEditing.audioUrl,
        audioMetadata: controllers.mediaEditing.audioMetadata,
        handleAudioChange: controllers.mediaEditing.handleAudioChange,
        isLoading: controllers.mediaEditing.isAudioSettingsLoading,
      },
      generationActions: controllers.generationActions,
      handleImageReorder: controllers.imageManagement.handleReorderImagesInShot,
      handleImageUpload: controllers.imageManagement.handleImageUpload,
      shots: controllers.shots,
      shotActions: controllers.shotActions,
      generationMode: {
        generateMode: controllers.joinWorkflow.generateMode,
        setGenerateMode: controllers.joinWorkflow.setGenerateMode,
        toggleGenerateModePreserveScroll: controllers.joinWorkflow.toggleGenerateModePreserveScroll,
        isGenerationDisabled: controllers.generationController.isGenerationDisabled,
        isSteerableMotionEnqueuing: controllers.generationController.isSteerableMotionEnqueuing,
        steerableMotionJustQueued: controllers.generationController.steerableMotionJustQueued,
        currentMotionSettings: controllers.generationController.currentMotionSettings,
        accelerated: settings.accelerated,
        onAcceleratedChange: controllers.generationController.handleAcceleratedChange,
        randomSeed: settings.randomSeed,
        onRandomSeedChange: controllers.generationController.handleRandomSeedChange,
      },
      generationHandlers: {
        handleGenerateBatch: controllers.generationController.handleGenerateBatch,
        handleBatchVideoPromptChangeWithClear: controllers.generationController.handleBatchVideoPromptChangeWithClear,
        handleStepsChange: controllers.generationController.handleStepsChange,
        clearAllEnhancedPrompts: controllers.generationController.clearAllEnhancedPrompts,
      },
      joinState: {
        joinSettings: {
          settings: controllers.joinWorkflow.joinSettings.settings,
          updateField: controllers.joinWorkflow.joinSettings.updateField,
          updateFields: controllers.joinWorkflow.joinSettings.updateFields,
        },
        joinLoraManager: controllers.joinWorkflow.joinLoraManager,
        joinValidationData: controllers.joinWorkflow.joinValidationData,
        handleJoinSegments: controllers.joinWorkflow.handleJoinSegments,
        isJoiningClips: controllers.joinWorkflow.isJoiningClips,
        joinClipsSuccess: controllers.joinWorkflow.joinClipsSuccess,
        handleRestoreJoinDefaults: controllers.joinWorkflow.handleRestoreJoinDefaults,
      },
      dimensions,
      queryClient: core.queryClient,
    }),
    [core, images, controllers, settings.accelerated, settings.randomSeed, dimensions]
  );

  const headerModel = useMemo<ShotEditorLayoutProps['header']>(
    () => ({
      onBack: sections.onBack,
      onPreviousShot: sections.onPreviousShot,
      onNextShot: sections.onNextShot,
      hasPrevious: sections.hasPrevious,
      hasNext: sections.hasNext,
      onUpdateShotName: sections.onUpdateShotName,
      onNameClick: controllers.mediaEditing.handleNameClick,
      onNameSave: controllers.mediaEditing.handleNameSave,
      onNameCancel: controllers.mediaEditing.handleNameCancel,
      onNameKeyDown: controllers.mediaEditing.handleNameKeyDown,
      headerContainerRef: sections.headerContainerRef,
      centerSectionRef: sections.refs.centerSectionRef,
      isSticky: sections.isSticky,
    }),
    [controllers.mediaEditing, sections]
  );

  const finalVideoModel = useMemo<ShotEditorLayoutFinalVideoModel>(
    () => ({
      selectedShotId: core.selectedShotId,
      projectId: core.projectId,
      effectiveAspectRatio: core.effectiveAspectRatio,
      onApplySettingsFromTask: sections.applySettingsFromTask,
      onRequestJoinMode: () => controllers.joinWorkflow.setGenerateMode('join'),
      selectedOutputId: controllers.output.selectedOutputId,
      onSelectedOutputChange: controllers.output.setSelectedOutputId,
      parentGenerations: controllers.output.parentGenerations,
      initialParentGenerations: sections.initialParentGenerations,
      segmentProgress: controllers.output.segmentProgress,
      isSegmentOutputsLoading: controllers.output.isSegmentOutputsLoading,
      getFinalVideoCount: sections.getFinalVideoCount,
      onDeleteFinalVideo: controllers.imageManagement.handleDeleteFinalVideo,
      isClearingFinalVideo: controllers.imageManagement.isClearingFinalVideo,
      videoGalleryRef: sections.refs.videoGalleryRef,
      generateVideosCardRef: sections.refs.generateVideosCardRef,
    }),
    [core, sections, controllers.joinWorkflow, controllers.output, controllers.imageManagement]
  );

  const timelineModel = useMemo<ShotEditorLayoutProps['timeline']>(
    () => ({
      timelineSectionRef: sections.timelineSectionRef,
      isModeReady: core.state.isModeReady,
      settingsError: core.state.settingsError,
      isPhone: settings.isPhone,
      generationMode: settings.generationModeSettings.generationMode,
      onGenerationModeChange: settings.generationModeSettings.setGenerationMode,
      batchVideoFrames: settings.frameSettings.batchVideoFrames,
      onBatchVideoFramesChange: settings.frameSettings.setFrames,
      aspectAdjustedColumns: settings.aspectAdjustedColumns as 2 | 3 | 4 | 6,
      pendingFramePositions: core.state.pendingFramePositions,
      onPendingPositionApplied: controllers.imageManagement.handlePendingPositionApplied,
      onSelectionChange: controllers.bridge.handleSelectionChangeLocal,
      prompt: settings.promptSettings.prompt,
      onPromptChange: settings.promptSettings.setPrompt,
      negativePrompt: settings.promptSettings.negativePrompt,
      onNegativePromptChange: settings.promptSettings.setNegativePrompt,
      smoothContinuations: settings.motionSettings.smoothContinuations,
      onDragStateChange: sections.onDragStateChange,
      getHasStructureVideo: sections.getHasStructureVideo,
    }),
    [core.state, sections, controllers.imageManagement, controllers.bridge, settings]
  );

  const generationModel = useMemo<ShotEditorLayoutProps['generation']>(
    () => ({
      ctaContainerRef: sections.ctaContainerRef,
      swapButtonRef: sections.refs.swapButtonRef,
      joinSegmentsSectionRef: sections.refs.joinSegmentsSectionRef,
      parentVariantName: sections.parentVariantName,
      parentOnVariantNameChange: sections.parentOnVariantNameChange,
      parentIsGeneratingVideo: sections.parentIsGeneratingVideo,
      parentVideoJustQueued: sections.parentVideoJustQueued,
    }),
    [sections]
  );

  const modalsModel = useMemo<ShotEditorLayoutProps['modals']>(
    () => ({
      isLoraModalOpen: controllers.loraManager.isLoraModalOpen,
      onLoraModalClose: () => controllers.loraManager.setIsLoraModalOpen(false),
      onAddLora: controllers.loraManager.handleAddLora,
      onRemoveLora: controllers.loraManager.handleRemoveLora,
      onUpdateLoraStrength: controllers.loraManager.handleLoraStrengthChange,
      selectedLoras: controllers.loraManager.selectedLoras,
      isSettingsModalOpen: core.state.isSettingsModalOpen,
      onSettingsModalOpenChange: core.actions.setSettingsModalOpen,
    }),
    [controllers.loraManager, core.state.isSettingsModalOpen, core.actions.setSettingsModalOpen]
  );

  return {
    contextInput,
    headerModel,
    finalVideoModel,
    timelineModel,
    generationModel,
    modalsModel,
  };
}
