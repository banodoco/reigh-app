import React from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditingController } from './useEditingController';

const mocks = vi.hoisted(() => ({
  useStructureVideo: vi.fn(),
  useStructureVideoHandlers: vi.fn(),
  useAudio: vi.fn(),
  useNameEditing: vi.fn(),
  useJoinSegmentsSetup: vi.fn(),
  useJoinSegmentsHandler: vi.fn(),
}));

vi.mock('../hooks/video/useStructureVideo', () => ({
  useStructureVideo: mocks.useStructureVideo,
}));

vi.mock('../hooks/video/useStructureVideoHandlers', () => ({
  useStructureVideoHandlers: mocks.useStructureVideoHandlers,
}));

vi.mock('../hooks/video/useAudio', () => ({
  useAudio: mocks.useAudio,
}));

vi.mock('../hooks/editor-state/useNameEditing', () => ({
  useNameEditing: mocks.useNameEditing,
}));

vi.mock('../hooks/actions/useJoinSegmentsSetup', () => ({
  useJoinSegmentsSetup: mocks.useJoinSegmentsSetup,
}));

vi.mock('../hooks/actions/useJoinSegmentsHandler', () => ({
  useJoinSegmentsHandler: mocks.useJoinSegmentsHandler,
}));

describe('useEditingController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useStructureVideo.mockReturnValue({
      structureGuidance: { mode: 'flow' },
      structureVideoPath: 'structure.mp4',
      structureVideoMetadata: { duration_seconds: 2 },
      structureVideoTreatment: 'adjust',
      structureVideoMotionStrength: 0.7,
      structureVideoType: 'flow',
      structureVideoResourceId: 'resource-1',
      structureVideoUni3cEndPercent: 25,
      isLoading: false,
      structureVideos: [{ id: 'structure-1' }],
      addStructureVideo: vi.fn(),
      updateStructureVideo: vi.fn(),
      removeStructureVideo: vi.fn(),
      clearAllStructureVideos: vi.fn(),
      setStructureVideos: vi.fn(),
      updateStructureGuidanceControls: vi.fn(),
    });

    mocks.useStructureVideoHandlers.mockReturnValue({
      handleUni3cEndPercentChange: vi.fn(),
      handleStructureVideoMotionStrengthChange: vi.fn(),
      handleStructureTypeChangeFromMotionControl: vi.fn(),
      handleStructureVideoInputChange: vi.fn(),
    });

    mocks.useAudio.mockReturnValue({
      audioUrl: 'audio.mp3',
      audioMetadata: { duration: 12 },
      handleAudioChange: vi.fn(),
      isLoading: true,
    });

    mocks.useNameEditing.mockReturnValue({
      handleNameClick: vi.fn(),
      handleNameSave: vi.fn(),
      handleNameCancel: vi.fn(),
      handleNameKeyDown: vi.fn(),
    });

    mocks.useJoinSegmentsSetup.mockReturnValue({
      generateMode: 'join',
      setGenerateMode: vi.fn(),
      toggleGenerateModePreserveScroll: vi.fn(),
      joinSettings: { settings: {}, updateField: vi.fn(), updateFields: vi.fn() },
      joinSettingsForHook: { prompt: 'join prompt' },
      joinLoraManager: { selectedLoras: [{ id: 'lora-1' }] },
    });

    mocks.useJoinSegmentsHandler.mockReturnValue({
      isJoiningClips: true,
      joinClipsSuccess: false,
      joinValidationData: { shortestClipFrames: 61, videoCount: 2 },
      handleJoinSegments: vi.fn(),
      handleRestoreJoinDefaults: vi.fn(),
    });
  });

  function buildArgs() {
    return {
      core: {
        selectedShotId: 'shot-1',
        projectId: 'project-1',
        selectedProjectId: 'project-1',
        selectedShot: { id: 'shot-1', name: 'Shot 1' } as never,
        effectiveAspectRatio: '16:9',
        swapButtonRef: { current: null } as React.RefObject<HTMLButtonElement>,
      },
      nameEditing: {
        onUpdateShotName: vi.fn(),
        state: {
          isEditingName: true,
          editingName: 'Original name',
        },
        actions: {
          setEditingName: vi.fn(),
          setEditingNameValue: vi.fn(),
          setIsEditingName: vi.fn(),
        } as never,
      },
      generationType: {
        generationTypeMode: 'vace' as const,
        setGenerationTypeMode: vi.fn(),
      },
      joinInputs: {
        joinSegmentSlots: [{ id: 'slot-1' }],
        joinSelectedParent: { id: 'parent-1' },
      },
    };
  }

  it('composes structure, audio, name, and join hooks into grouped controller outputs', () => {
    const args = buildArgs();

    const { result } = renderHook(() => useEditingController(args));

    expect(mocks.useStructureVideo).toHaveBeenCalledWith({
      projectId: 'project-1',
      shotId: 'shot-1',
    });
    expect(mocks.useStructureVideoHandlers).toHaveBeenCalledWith(
      expect.objectContaining({
        structureVideos: [{ id: 'structure-1' }],
        structureVideoPath: 'structure.mp4',
        structureVideoType: 'flow',
        structureVideoUni3cEndPercent: 25,
        generationTypeMode: 'vace',
        setGenerationTypeMode: args.generationType.setGenerationTypeMode,
      }),
    );
    expect(mocks.useAudio).toHaveBeenCalledWith({
      projectId: 'project-1',
      shotId: 'shot-1',
    });
    expect(mocks.useNameEditing).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedShot: args.core.selectedShot,
        state: args.nameEditing.state,
        onUpdateShotName: args.nameEditing.onUpdateShotName,
      }),
    );
    expect(mocks.useJoinSegmentsSetup).toHaveBeenCalledWith({
      selectedShotId: 'shot-1',
      projectId: 'project-1',
      swapButtonRef: args.core.swapButtonRef,
    });
    expect(mocks.useJoinSegmentsHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        selectedProjectId: 'project-1',
        selectedShotId: 'shot-1',
        effectiveAspectRatio: '16:9',
        audioUrl: 'audio.mp3',
        joinSegmentSlots: args.joinInputs.joinSegmentSlots,
        joinSelectedParent: args.joinInputs.joinSelectedParent,
        joinLoraManager: { selectedLoras: [{ id: 'lora-1' }] },
        joinSettings: { prompt: 'join prompt' },
      }),
    );

    expect(result.current.mediaEditing).toMatchObject({
      structureVideoPath: 'structure.mp4',
      structureVideoType: 'flow',
      audioUrl: 'audio.mp3',
      isAudioSettingsLoading: true,
      handleNameClick: expect.any(Function),
      handleStructureVideoInputChange: expect.any(Function),
    });
    expect(result.current.joinWorkflow).toMatchObject({
      generateMode: 'join',
      joinSettingsForHook: { prompt: 'join prompt' },
      joinLoraManager: { selectedLoras: [{ id: 'lora-1' }] },
      isJoiningClips: true,
      joinValidationData: { shortestClipFrames: 61, videoCount: 2 },
      handleJoinSegments: expect.any(Function),
      handleRestoreJoinDefaults: expect.any(Function),
    });
  });
});
