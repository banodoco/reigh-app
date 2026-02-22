import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShotSettingsEditor } from './index';

vi.mock('@/shared/hooks/useShots', () => ({
  useUpdateShotImageOrder: () => ({ mutateAsync: vi.fn() }),
  useAddImageToShotWithoutPosition: () => ({ mutateAsync: vi.fn() }),
  useAddImageToShot: () => ({ mutateAsync: vi.fn() }),
  useRemoveImageFromShot: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/shared/hooks/useShotCreation', () => ({
  useShotCreation: () => ({ createShot: vi.fn() }),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => false,
  useDeviceInfo: () => ({ isPhone: false, mobileColumns: 3 }),
}));

vi.mock('@/shared/contexts/PanesContext', () => ({
  usePanes: () => ({ setIsGenerationsPaneLocked: vi.fn() }),
}));

vi.mock('@/shared/hooks/useTimelineCore', () => ({
  useTimelineCore: () => ({
    clearAllEnhancedPrompts: vi.fn(async () => {}),
    updatePairPromptsByIndex: vi.fn(async () => {}),
    refetch: vi.fn(async () => {}),
  }),
}));

vi.mock('@/shared/hooks/useToolSettings', () => ({
  useToolSettings: () => ({
    settings: {},
    update: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('@/shared/contexts/CurrentShotContext', () => ({
  useCurrentShot: () => ({ setCurrentShotId: vi.fn() }),
}));

vi.mock('@/shared/hooks/useShotNavigation', () => ({
  useShotNavigation: () => ({ navigateToShot: vi.fn() }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
  useQuery: () => ({ data: null }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ then: undefined }) }),
    }),
  },
}));

vi.mock('../../hooks/useSegmentOutputsForShot', () => ({
  useSegmentOutputsForShot: () => ({
    segmentSlots: [],
    segments: [],
    selectedParent: null,
    parentGenerations: [],
    segmentProgress: {},
    isLoading: false,
  }),
}));

vi.mock('../../hooks/useDemoteOrphanedVariants', () => ({
  useDemoteOrphanedVariants: () => ({ demoteOrphanedVariants: vi.fn() }),
}));

vi.mock('./ShotSettingsContext', () => ({
  ShotSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./sections', () => ({
  HeaderSection: () => <div data-testid="header-section">header</div>,
  TimelineSection: () => <div data-testid="timeline-section">timeline</div>,
  ModalsSection: () => <div data-testid="modals-section">modals</div>,
  GenerationSection: () => <div data-testid="generation-section">generation</div>,
}));

vi.mock('../FinalVideoSection', () => ({
  FinalVideoSection: () => <div data-testid="final-video-section">final-video</div>,
}));

vi.mock('@/tools/travel-between-images/providers', () => ({
  usePromptSettings: () => ({
    prompt: '',
    setPrompt: vi.fn(),
    negativePrompt: '',
    setNegativePrompt: vi.fn(),
    enhancePrompt: false,
    setEnhancePrompt: vi.fn(),
    textBeforePrompts: '',
    setTextBeforePrompts: vi.fn(),
    textAfterPrompts: '',
    setTextAfterPrompts: vi.fn(),
  }),
  useMotionSettings: () => ({
    motionMode: 'basic',
    setMotionMode: vi.fn(),
    amountOfMotion: 50,
    setAmountOfMotion: vi.fn(),
    turboMode: false,
    setTurboMode: vi.fn(),
    smoothContinuations: false,
  }),
  useFrameSettings: () => ({
    batchVideoFrames: 61,
    setFrames: vi.fn(),
    batchVideoSteps: 6,
    setSteps: vi.fn(),
  }),
  usePhaseConfigSettings: () => ({
    generationTypeMode: 'i2v',
    setGenerationTypeMode: vi.fn(),
    phaseConfig: undefined,
    setPhaseConfig: vi.fn(),
    selectedPhasePresetId: null,
    selectPreset: vi.fn(),
    removePreset: vi.fn(),
    advancedMode: false,
  }),
  useGenerationModeSettings: () => ({
    generationMode: 'timeline',
    setGenerationMode: vi.fn(),
  }),
  useSteerableMotionSettings: () => ({
    steerableMotionSettings: { model_name: 'wan', negative_prompt: '', seed: 1, debug: false, show_input_images: false },
    setSteerableMotionSettings: vi.fn(),
  }),
  useLoraSettings: () => ({
    selectedLoras: [],
    setSelectedLoras: vi.fn(),
    availableLoras: [],
  }),
  useVideoTravelSettings: () => ({ isLoading: false }),
}));

vi.mock('./hooks', () => ({
  useShotEditorSetup: () => {
    const shot = { id: 'shot-1', name: 'Shot 1', position: 0, images: [] };
    return {
      selectedShot: shot,
      shots: [shot],
      selectedProjectId: 'project-1',
      projects: [{ id: 'project-1', aspectRatio: '16:9' }],
      effectiveAspectRatio: '16:9',
      allShotImages: [],
      timelineImages: [],
      unpositionedImages: [],
      videoOutputs: [],
      contextImages: [],
      initialParentGenerations: [],
      refs: {
        selectedShotRef: { current: shot },
        projectIdRef: { current: 'project-1' },
        allShotImagesRef: { current: [] },
        batchVideoFramesRef: { current: 61 },
      },
    };
  },
  useLoraSync: () => ({
    loraManager: {
      selectedLoras: [],
      isLoraModalOpen: false,
      setIsLoraModalOpen: vi.fn(),
      handleAddLora: vi.fn(),
      handleRemoveLora: vi.fn(),
      handleLoraStrengthChange: vi.fn(),
    },
  }),
  useStructureVideo: () => ({
    structureVideoPath: null,
    structureVideoMetadata: null,
    structureVideoTreatment: 'adjust',
    structureVideoMotionStrength: 1,
    structureVideoType: 'flow',
    structureVideoResourceId: null,
    structureVideoUni3cEndPercent: 0.1,
    isLoading: false,
    structureVideos: [],
    addStructureVideo: vi.fn(),
    updateStructureVideo: vi.fn(),
    removeStructureVideo: vi.fn(),
    clearAllStructureVideos: vi.fn(),
    setStructureVideos: vi.fn(),
  }),
  useStructureVideoHandlers: () => ({
    handleUni3cEndPercentChange: vi.fn(),
    handleStructureVideoMotionStrengthChange: vi.fn(),
    handleStructureTypeChangeFromMotionControl: vi.fn(),
    handleStructureVideoInputChange: vi.fn(),
  }),
  useAudio: () => ({
    audioUrl: null,
    audioMetadata: null,
    handleAudioChange: vi.fn(),
    isLoading: false,
  }),
  useJoinSegmentsSetup: () => ({
    joinSettings: {},
    joinPrompt: '',
    joinNegativePrompt: '',
    joinContextFrames: 0,
    joinGapFrames: 0,
    joinReplaceMode: false,
    joinKeepBridgingImages: false,
    joinEnhancePrompt: false,
    joinModel: '',
    joinNumInferenceSteps: 0,
    joinGuidanceScale: 0,
    joinSeed: 0,
    joinMotionMode: 'basic',
    joinPhaseConfig: undefined,
    joinSelectedPhasePresetId: null,
    joinRandomSeed: false,
    joinPriority: 'normal',
    joinUseInputVideoResolution: false,
    joinUseInputVideoFps: false,
    joinNoisedInputVideo: false,
    joinLoopFirstClip: false,
    generateMode: 'batch',
    joinSelectedLoras: [],
    stitchAfterGenerate: false,
    setGenerateMode: vi.fn(),
    toggleGenerateModePreserveScroll: vi.fn(),
    joinSettingsForHook: {},
    joinLoraManager: { selectedLoras: [] },
  }),
  useOutputSelection: () => ({
    selectedOutputId: null,
    setSelectedOutputId: vi.fn(),
    isReady: true,
  }),
  useJoinSegmentsHandler: () => ({
    isJoiningClips: false,
    joinClipsSuccess: false,
    joinValidationData: { canJoin: false },
    handleJoinSegments: vi.fn(),
    handleRestoreJoinDefaults: vi.fn(),
  }),
  useGenerationActions: () => ({
    handleBatchImageDrop: vi.fn(async () => {}),
  }),
  useShotActions: () => ({
    handleAddToShot: vi.fn(),
  }),
  useModeReadiness: vi.fn(),
  useNameEditing: () => ({
    handleNameClick: vi.fn(),
    handleNameSave: vi.fn(),
    handleNameCancel: vi.fn(),
    handleNameKeyDown: vi.fn(),
  }),
  useApplySettingsHandler: () => vi.fn(),
  useImageManagement: () => ({
    isClearingFinalVideo: false,
    handleDeleteFinalVideo: vi.fn(),
    handleReorderImagesInShot: vi.fn(),
    handlePendingPositionApplied: vi.fn(),
  }),
  useGenerateBatch: () => ({
    handleGenerateBatch: vi.fn(async () => {}),
    isSteerableMotionEnqueuing: false,
    steerableMotionJustQueued: false,
    isGenerationDisabled: false,
  }),
  useSteerableMotionHandlers: () => ({
    handleRandomSeedChange: vi.fn(),
    handleAcceleratedChange: vi.fn(),
    handleStepsChange: vi.fn(),
  }),
  useLastVideoGeneration: () => null,
  useAspectAdjustedColumns: () => ({
    isPhone: false,
    aspectAdjustedColumns: 3,
  }),
  useEnsureSelectedOutput: vi.fn(),
  useShotEditorBridge: () => ({
    handleSelectionChangeLocal: vi.fn(),
    currentMotionSettings: {
      textBeforePrompts: '',
      textAfterPrompts: '',
      basePrompt: '',
      negativePrompt: '',
      enhancePrompt: false,
      durationFrames: 61,
      selectedLoras: [],
    },
  }),
  useShotSettingsValue: () => ({}),
}));

vi.mock('./state/useShotEditorState', () => ({
  useShotEditorState: () => ({
    state: {
      isEditingName: false,
      editingName: '',
      pendingFramePositions: new Map(),
      isModeReady: true,
      settingsError: null,
      isSettingsModalOpen: false,
      isUploadingImage: false,
      uploadProgress: 0,
      duplicatingImageId: null,
      duplicateSuccessImageId: null,
      showStepsNotification: false,
    },
    actions: {
      setSettingsModalOpen: vi.fn(),
      setShowStepsNotification: vi.fn(),
    },
  }),
}));

describe('ShotSettingsEditor', () => {
  it('renders the modular sections with a direct component test harness', () => {
    render(
      <ShotSettingsEditor
        selectedShotId="shot-1"
        projectId="project-1"
        onShotImagesUpdate={() => {}}
        onBack={() => {}}
      />,
    );

    expect(screen.getByTestId('header-section')).toBeInTheDocument();
    expect(screen.getByTestId('final-video-section')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-section')).toBeInTheDocument();
    expect(screen.getByTestId('generation-section')).toBeInTheDocument();
    expect(screen.getByTestId('modals-section')).toBeInTheDocument();
  });

  it('renders section content text', () => {
    render(
      <ShotSettingsEditor
        selectedShotId="shot-1"
        projectId="project-1"
        onShotImagesUpdate={() => {}}
        onBack={() => {}}
      />,
    );

    expect(screen.getByText('header')).toBeInTheDocument();
    expect(screen.getByText('final-video')).toBeInTheDocument();
    expect(screen.getByText('timeline')).toBeInTheDocument();
    expect(screen.getByText('generation')).toBeInTheDocument();
    expect(screen.getByText('modals')).toBeInTheDocument();
  });

  it('accepts required props', () => {
    expect(ShotSettingsEditor).toBeDefined();
    // React.memo wraps the component — typeof is 'object', not 'function'
    expect(typeof ShotSettingsEditor).toBe('object');
    expect(ShotSettingsEditor).toHaveProperty('$$typeof');
  });

  it('renders all sections as children of the layout', () => {
    const { container } = render(
      <ShotSettingsEditor
        selectedShotId="shot-1"
        projectId="project-1"
        onShotImagesUpdate={() => {}}
        onBack={() => {}}
      />,
    );

    const headerSection = screen.getByTestId('header-section');
    const finalVideoSection = screen.getByTestId('final-video-section');
    const timelineSection = screen.getByTestId('timeline-section');
    const generationSection = screen.getByTestId('generation-section');
    const modalsSection = screen.getByTestId('modals-section');

    expect(headerSection.textContent).toBe('header');
    expect(finalVideoSection.textContent).toBe('final-video');
    expect(timelineSection.textContent).toBe('timeline');
    expect(generationSection.textContent).toBe('generation');
    expect(modalsSection.textContent).toBe('modals');
    expect(container.querySelector('[data-testid]')).not.toBeNull();
  });
});
