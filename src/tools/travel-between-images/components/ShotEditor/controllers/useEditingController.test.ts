import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useStructureVideo: vi.fn(),
  useStructureVideoHandlers: vi.fn(),
  useAudio: vi.fn(),
  useNameEditing: vi.fn(),
  useJoinSegmentsSetup: vi.fn(),
  useJoinSegmentsHandler: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useStructureVideo: mocks.useStructureVideo,
  useStructureVideoHandlers: mocks.useStructureVideoHandlers,
  useAudio: mocks.useAudio,
  useNameEditing: mocks.useNameEditing,
  useJoinSegmentsSetup: mocks.useJoinSegmentsSetup,
  useJoinSegmentsHandler: mocks.useJoinSegmentsHandler,
}));

import { useEditingController } from './useEditingController';

describe('useEditingController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useStructureVideo.mockReturnValue({
      structureVideoPath: 's3://structure.mp4',
      structureVideoMetadata: { duration: 10 },
      structureVideoTreatment: 'append',
      structureVideoMotionStrength: 0.5,
      structureVideoType: 'image',
      structureVideoResourceId: 'resource-1',
      structureVideoUni3cEndPercent: 50,
      isLoading: false,
      structureVideos: [],
      addStructureVideo: vi.fn(),
      updateStructureVideo: vi.fn(),
      removeStructureVideo: vi.fn(),
      clearAllStructureVideos: vi.fn(),
      setStructureVideos: vi.fn(),
    });

    mocks.useStructureVideoHandlers.mockReturnValue({
      handleUni3cEndPercentChange: vi.fn(),
      handleStructureVideoMotionStrengthChange: vi.fn(),
      handleStructureTypeChangeFromMotionControl: vi.fn(),
      handleStructureVideoInputChange: vi.fn(),
    });

    mocks.useAudio.mockReturnValue({
      audioUrl: 's3://audio.mp3',
      audioMetadata: { duration: 5 },
      handleAudioChange: vi.fn(),
      isLoading: false,
    });

    mocks.useNameEditing.mockReturnValue({
      handleNameClick: vi.fn(),
      handleNameSave: vi.fn(),
      handleNameCancel: vi.fn(),
      handleNameKeyDown: vi.fn(),
    });

    mocks.useJoinSegmentsSetup.mockReturnValue({
      joinSettings: {},
      joinPrompt: 'join prompt',
      joinNegativePrompt: 'neg',
      joinContextFrames: 8,
      joinGapFrames: 5,
      joinReplaceMode: false,
      joinKeepBridgingImages: true,
      joinEnhancePrompt: false,
      joinModel: 'model-a',
      joinNumInferenceSteps: 30,
      joinGuidanceScale: 6,
      joinSeed: 42,
      joinMotionMode: 'auto',
      joinPhaseConfig: {},
      joinSelectedPhasePresetId: 'preset-1',
      joinRandomSeed: false,
      joinPriority: 'normal',
      joinUseInputVideoResolution: true,
      joinUseInputVideoFps: true,
      joinNoisedInputVideo: false,
      joinLoopFirstClip: false,
      generateMode: 'standard',
      joinSelectedLoras: [],
      stitchAfterGenerate: true,
      setGenerateMode: vi.fn(),
      toggleGenerateModePreserveScroll: vi.fn(),
      joinSettingsForHook: { key: 'value' },
      joinLoraManager: { manager: true },
    });

    mocks.useJoinSegmentsHandler.mockReturnValue({
      isJoiningClips: false,
      joinClipsSuccess: false,
      joinValidationData: { ok: true },
      handleJoinSegments: vi.fn(),
      handleRestoreJoinDefaults: vi.fn(),
    });
  });

  it('wires editing/join hooks and returns composed controller surface', () => {
    const setGenerationTypeMode = vi.fn();
    const { result } = renderHook(() =>
      useEditingController({
        core: {
          selectedShotId: 'shot-1',
          projectId: 'project-1',
          selectedProjectId: 'project-1',
          selectedShot: { id: 'shot-1' } as never,
          effectiveAspectRatio: '16:9',
          swapButtonRef: { current: null },
        },
        nameEditing: {
          onUpdateShotName: vi.fn(),
          state: { isEditingName: false, editingName: '' },
          actions: {
            setEditingName: vi.fn(),
            setEditingNameValue: vi.fn(),
          },
        } as never,
        generationType: {
          generationTypeMode: 'i2v',
          setGenerationTypeMode,
        },
        joinInputs: {
          joinSegmentSlots: ['slot-a'] as never,
          joinSelectedParent: 'parent-a' as never,
        },
      }),
    );

    expect(mocks.useStructureVideo).toHaveBeenCalledWith({
      projectId: 'project-1',
      shotId: 'shot-1',
    });
    expect(mocks.useJoinSegmentsSetup).toHaveBeenCalledWith({
      selectedShotId: 'shot-1',
      projectId: 'project-1',
      swapButtonRef: { current: null },
    });
    expect(mocks.useJoinSegmentsHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedShotId: 'shot-1',
        joinSettings: { key: 'value' },
        joinSegmentSlots: ['slot-a'],
      }),
    );

    expect(result.current.mediaEditing.structureVideoPath).toBe('s3://structure.mp4');
    expect(result.current.mediaEditing.audioUrl).toBe('s3://audio.mp3');
    expect(result.current.joinWorkflow.joinPrompt).toBe('join prompt');
    expect(result.current.joinWorkflow.generateMode).toBe('standard');
    expect(result.current.joinWorkflow.joinValidationData).toEqual({ ok: true });
  });
});
