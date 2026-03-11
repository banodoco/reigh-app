import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGenerationController } from './useGenerationController';

const mocks = vi.hoisted(() => ({
  useTimelineCore: vi.fn(),
  normalizeAndPresentError: vi.fn(),
  useSteerableMotionHandlers: vi.fn(),
  useGenerateBatch: vi.fn(),
}));

vi.mock('@/shared/hooks/timeline/useTimelineCore', () => ({
  useTimelineCore: mocks.useTimelineCore,
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: mocks.normalizeAndPresentError,
}));

vi.mock('../hooks/actions/useSteerableMotionHandlers', () => ({
  useSteerableMotionHandlers: mocks.useSteerableMotionHandlers,
}));

vi.mock('../hooks/actions/useGenerateBatch', () => ({
  useGenerateBatch: mocks.useGenerateBatch,
}));

describe('useGenerationController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useTimelineCore.mockReturnValue({
      clearAllEnhancedPrompts: vi.fn().mockResolvedValue(undefined),
      updatePairPromptsByIndex: vi.fn(),
      refetch: vi.fn(),
    });

    mocks.useSteerableMotionHandlers.mockReturnValue({
      handleRandomSeedChange: vi.fn(),
      handleAcceleratedChange: vi.fn(),
      handleStepsChange: vi.fn(),
    });

    mocks.useGenerateBatch.mockReturnValue({
      handleGenerateBatch: vi.fn(),
      isSteerableMotionEnqueuing: true,
      steerableMotionJustQueued: false,
      isGenerationDisabled: true,
    });
  });

  function buildArgs() {
    return {
      core: {
        projectId: 'project-1',
        selectedProjectId: 'project-1',
        selectedShotId: 'shot-1',
        selectedShot: { id: 'shot-1', name: 'Shot 1' } as never,
        queryClient: { invalidateQueries: vi.fn() } as never,
        onShotImagesUpdate: vi.fn(),
        effectiveAspectRatio: '16:9',
        generationMode: 'join' as const,
      },
      prompt: {
        prompt: 'Base prompt',
        onPromptChange: vi.fn(),
        enhancePrompt: true,
        textBeforePrompts: 'Before',
        textAfterPrompts: 'After',
        negativePrompt: 'Negative',
      },
      motion: {
        amountOfMotion: 55,
        motionMode: 'advanced' as const,
        advancedMode: true,
        phaseConfig: { num_phases: 3 } as never,
        selectedPhasePresetId: 'preset-1',
        steerableMotionSettings: { model_name: 'wan', num_inference_steps: 8, seed: 123 },
        randomSeed: false,
        turboMode: true,
        generationTypeMode: 'vace' as const,
        smoothContinuations: true,
        batchVideoFrames: 77,
        selectedLoras: [{ id: 'lora-1', path: '/lora-1', strength: 0.5 }],
        structureGuidance: { mode: 'flow' } as never,
        structureVideos: [{ id: 'structure-1' }] as never,
        selectedOutputId: 'parent-1',
      },
      join: {
        stitchAfterGenerate: true,
        joinContextFrames: 12,
        joinGapFrames: 4,
        joinReplaceMode: true,
        joinKeepBridgingImages: false,
        joinPrompt: 'Join prompt',
        joinNegativePrompt: 'Join negative',
        joinEnhancePrompt: false,
        joinModel: 'wan-join',
        joinNumInferenceSteps: 6,
        joinGuidanceScale: 4,
        joinSeed: 789,
        joinRandomSeed: true,
        joinMotionMode: 'basic' as const,
        joinPhaseConfig: { num_phases: 2 } as never,
        joinSelectedPhasePresetId: 'join-preset',
        joinSelectedLoras: [
          { id: 'join-lora-1', path: '/join-lora-1', strength: 0.9, name: 'Join LoRA' },
        ],
        joinPriority: 2,
        joinUseInputVideoResolution: true,
        joinUseInputVideoFps: true,
        joinNoisedInputVideo: 0.35,
        joinLoopFirstClip: true,
      },
      runtime: {
        accelerated: false,
        isShotUISettingsLoading: false,
        settingsLoadingFromContext: false,
        updateShotUISettings: vi.fn(),
        setSteerableMotionSettings: vi.fn(),
        setSteps: vi.fn(),
        setShowStepsNotification: vi.fn(),
      },
    };
  }

  it('builds the batch generation request and exposes the downstream handlers', async () => {
    const args = buildArgs();

    const { result } = renderHook(() => useGenerationController(args));

    expect(mocks.useTimelineCore).toHaveBeenCalledWith('shot-1');
    expect(mocks.useSteerableMotionHandlers).toHaveBeenCalledWith(
      expect.objectContaining({
        accelerated: false,
        randomSeed: false,
        turboMode: true,
        selectedShotId: 'shot-1',
      }),
    );
    expect(mocks.useGenerateBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        core: expect.objectContaining({
          projectId: 'project-1',
          selectedShotId: 'shot-1',
          generationMode: 'join',
        }),
        request: expect.objectContaining({
          prompt: expect.objectContaining({
            basePrompt: 'Base prompt',
            negativePrompt: 'Negative',
          }),
          motion: expect.objectContaining({
            amountOfMotion: 55,
            motionMode: 'advanced',
            selectedPhasePresetId: 'preset-1',
          }),
          model: expect.objectContaining({
            generationTypeMode: 'vace',
            smoothContinuations: true,
            turboMode: true,
          }),
          batchVideoFrames: 77,
          selectedLoras: [{ id: 'lora-1', path: '/lora-1', strength: 0.5 }],
          selectedOutputId: 'parent-1',
          stitchAfterGenerate: expect.objectContaining({
            contextFrameCount: 12,
            gapFrames: 4,
            selectedLoras: [{ path: '/join-lora-1', strength: 0.9 }],
            loopFirstClip: true,
          }),
        }),
      }),
    );

    await act(async () => {
      await result.current.handleBatchVideoPromptChangeWithClear('Updated prompt');
    });

    expect(args.prompt.onPromptChange).toHaveBeenCalledWith('Updated prompt');
    expect(mocks.useTimelineCore.mock.results[0].value.clearAllEnhancedPrompts).toHaveBeenCalledTimes(1);
    expect(result.current.handleGenerateBatch).toBe(
      mocks.useGenerateBatch.mock.results[0].value.handleGenerateBatch,
    );
    expect(result.current.handleRandomSeedChange).toBe(
      mocks.useSteerableMotionHandlers.mock.results[0].value.handleRandomSeedChange,
    );
  });

  it('normalizes prompt-clear failures without breaking the prompt update flow', async () => {
    const args = buildArgs();
    const clearAllEnhancedPrompts = vi.fn().mockRejectedValue(new Error('clear failed'));
    mocks.useTimelineCore.mockReturnValueOnce({
      clearAllEnhancedPrompts,
      updatePairPromptsByIndex: vi.fn(),
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useGenerationController(args));

    await act(async () => {
      await result.current.handleBatchVideoPromptChangeWithClear('Retry prompt');
    });

    expect(args.prompt.onPromptChange).toHaveBeenCalledWith('Retry prompt');
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      { context: 'PromptClearLog', showToast: false },
    );
  });
});
