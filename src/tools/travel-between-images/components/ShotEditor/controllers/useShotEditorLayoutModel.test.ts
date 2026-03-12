import { describe, expect, it, vi } from 'vitest';

import { __internal, buildShotEditorContextInput } from './useShotEditorLayoutModel';

function createLayoutArgs() {
  const noop = vi.fn();

  return {
    core: {
      selectedShot: { id: 'shot-1' },
      selectedShotId: 'shot-1',
      projectId: 'project-1',
      selectedProjectId: 'project-1',
      effectiveAspectRatio: '16:9',
      projects: [],
      state: {
        pendingFramePositions: new Map(),
        isModeReady: true,
        settingsError: null,
        isSettingsModalOpen: false,
      },
      actions: {
        setSettingsModalOpen: noop,
      },
      queryClient: { invalidateQueries: noop },
    },
    images: {
      allShotImages: [],
      timelineImages: [],
      unpositionedImages: [],
      contextImages: [],
      videoOutputs: [],
      simpleFilteredImages: [],
    },
    controllers: {
      mediaEditing: {
        structureGuidance: null,
        structureVideoPath: 'video.mp4',
        structureVideoMetadata: null,
        structureVideoTreatment: 'adjust',
        structureVideoMotionStrength: 0.7,
        structureVideoType: 'flow',
        structureVideoResourceId: 'resource-1',
        structureVideoUni3cEndPercent: 50,
        isStructureVideoSettingsLoading: false,
        structureVideos: [],
        addStructureVideo: noop,
        updateStructureVideo: noop,
        removeStructureVideo: noop,
        clearAllStructureVideos: noop,
        setStructureVideos: noop,
        handleStructureVideoMotionStrengthChange: noop,
        handleStructureTypeChangeFromMotionControl: noop,
        handleUni3cEndPercentChange: noop,
        handleStructureVideoInputChange: noop,
        audioUrl: null,
        audioMetadata: null,
        handleAudioChange: noop,
        isAudioSettingsLoading: false,
        handleNameClick: noop,
        handleNameSave: noop,
        handleNameCancel: noop,
        handleNameKeyDown: noop,
      },
      joinWorkflow: {
        generateMode: 'batch',
        setGenerateMode: noop,
        toggleGenerateModePreserveScroll: noop,
        joinSettings: {
          settings: {},
          updateField: noop,
          updateFields: noop,
        },
        joinLoraManager: {},
        joinValidationData: {},
        handleJoinSegments: noop,
        isJoiningClips: false,
        joinClipsSuccess: false,
        handleRestoreJoinDefaults: noop,
      },
      output: {
        selectedOutputId: 'output-1',
        setSelectedOutputId: noop,
        parentGenerations: [],
        segmentProgress: {},
        isSegmentOutputsLoading: false,
      },
      generationActions: {},
      shotActions: {},
      generationController: {
        isGenerationDisabled: false,
        isSteerableMotionEnqueuing: false,
        steerableMotionJustQueued: false,
        currentMotionSettings: { amountOfMotion: 50 },
        handleAcceleratedChange: noop,
        handleRandomSeedChange: noop,
        handleGenerateBatch: noop,
        handleBatchVideoPromptChangeWithClear: noop,
        handleStepsChange: noop,
        clearAllEnhancedPrompts: noop,
      },
      imageManagement: {
        handleReorderImagesInShot: noop,
        handleImageUpload: noop,
        handlePendingPositionApplied: noop,
        handleDeleteFinalVideo: noop,
        isClearingFinalVideo: false,
      },
      bridge: {
        handleSelectionChangeLocal: noop,
      },
      loraManager: {
        isLoraModalOpen: true,
        setIsLoraModalOpen: noop,
        handleAddLora: noop,
        handleRemoveLora: noop,
        handleLoraStrengthChange: noop,
        selectedLoras: [],
      },
      availableLoras: [],
      shots: [],
    },
    settings: {
      promptSettings: {
        prompt: 'Prompt',
        setPrompt: noop,
        negativePrompt: 'Nope',
        setNegativePrompt: noop,
      },
      motionSettings: {
        smoothContinuations: true,
      },
      frameSettings: {
        batchVideoFrames: 61,
        setFrames: noop,
      },
      generationModeSettings: {
        generationMode: 'timeline',
        setGenerationMode: noop,
      },
      isPhone: false,
      aspectAdjustedColumns: 4,
      accelerated: true,
      randomSeed: false,
    },
    dimensions: {
      dimensionSource: 'preset',
      onDimensionSourceChange: noop,
      customWidth: '',
      onCustomWidthChange: noop,
      customHeight: '',
      onCustomHeightChange: noop,
    },
    sections: {
      onBack: noop,
      onPreviousShot: noop,
      onNextShot: noop,
      hasPrevious: false,
      hasNext: true,
      onUpdateShotName: noop,
      headerContainerRef: { current: null },
      timelineSectionRef: { current: null },
      ctaContainerRef: { current: null },
      isSticky: false,
      parentVariantName: 'Variant',
      parentOnVariantNameChange: noop,
      parentIsGeneratingVideo: false,
      parentVideoJustQueued: false,
      getFinalVideoCount: noop,
      getHasStructureVideo: noop,
      onDragStateChange: noop,
      refs: {
        centerSectionRef: { current: null },
        videoGalleryRef: { current: null },
        generateVideosCardRef: { current: null },
        joinSegmentsSectionRef: { current: null },
        swapButtonRef: { current: null },
      },
      initialParentGenerations: [],
      applySettingsFromTask: noop,
    },
  };
}

describe('useShotEditorLayoutModel builders', () => {
  it('builds the shot settings context input from grouped controller slices', () => {
    const args = createLayoutArgs();

    const result = buildShotEditorContextInput({
      core: args.core as never,
      images: args.images as never,
      controllers: args.controllers as never,
      settings: args.settings as never,
      dimensions: args.dimensions as never,
    });

    expect(result.structureVideo.structureVideoPath).toBe('video.mp4');
    expect(result.generationMode.accelerated).toBe(true);
    expect(result.joinState.handleJoinSegments).toBe(args.controllers.joinWorkflow.handleJoinSegments);
    expect(result.dimensions).toBe(args.dimensions);
  });

  it('builds one screen model that feeds both context and layout consumers', () => {
    const args = createLayoutArgs();

    const result = __internal.buildShotEditorScreenModel({
      core: args.core as never,
      images: args.images as never,
      controllers: args.controllers as never,
      settings: args.settings as never,
      dimensions: args.dimensions as never,
      sections: args.sections as never,
    });

    expect(result.contextInput.selectedShotId).toBe(args.core.selectedShotId);
    expect(result.contextInput.structureVideo.structureVideoPath).toBe('video.mp4');
    expect(result.layoutParams.controllers.output.selectedOutputId).toBe('output-1');
    expect(result.layoutParams.sections.applySettingsFromTask).toBe(args.sections.applySettingsFromTask);
  });

  it('builds section props without forcing the top-level hook to hand-wire every subsection inline', () => {
    const args = createLayoutArgs();
    const contextValue = { test: true };

    const result = __internal.buildShotEditorLayoutSections({
      core: args.core as never,
      controllers: args.controllers as never,
      settings: args.settings as never,
      sections: args.sections as never,
      contextValue: contextValue as never,
      handleJoinSegmentsClick: vi.fn(),
    });

    expect(result.contextValue).toBe(contextValue);
    expect(result.timeline.prompt).toBe('Prompt');
    expect(result.finalVideo.selectedOutputId).toBe('output-1');
    expect(result.modals.isLoraModalOpen).toBe(true);
  });
});
