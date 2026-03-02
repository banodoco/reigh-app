import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useTimelineCore: vi.fn(),
  useSteerableMotionHandlers: vi.fn(),
  useGenerateBatch: vi.fn(),
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/shared/hooks/useTimelineCore', () => ({
  useTimelineCore: mocks.useTimelineCore,
}));

vi.mock('../hooks', () => ({
  useSteerableMotionHandlers: mocks.useSteerableMotionHandlers,
  useGenerateBatch: mocks.useGenerateBatch,
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: mocks.normalizeAndPresentError,
}));

import { useGenerationController } from './useGenerationController';

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
      isSteerableMotionEnqueuing: false,
      steerableMotionJustQueued: false,
      isGenerationDisabled: false,
    });
  });

  function createParams() {
    return {
      core: {
        projectId: 'project-1',
        selectedProjectId: 'project-1',
        selectedShotId: 'shot-1',
        selectedShot: { id: 'shot-1' },
        queryClient: {} as never,
        onShotImagesUpdate: vi.fn(),
        effectiveAspectRatio: '16:9',
        generationMode: 'batch' as const,
      },
      prompt: {
        prompt: 'base prompt',
        onPromptChange: vi.fn(),
        enhancePrompt: true,
        textBeforePrompts: 'before',
        textAfterPrompts: 'after',
        negativePrompt: 'negative',
      },
      motion: {
        amountOfMotion: 42,
        motionMode: 'advanced' as const,
        advancedMode: true,
        phaseConfig: { phase: 1 } as never,
        selectedPhasePresetId: 'preset-1',
        steerableMotionSettings: { model_name: 'model-a', num_inference_steps: 25, seed: 7 },
        randomSeed: false,
        turboMode: false,
        generationTypeMode: 'i2v' as const,
        smoothContinuations: true,
        batchVideoFrames: 81,
        selectedLoras: [{ id: 'l1', path: 'loras/a.safetensors', strength: 0.7 }],
        structureVideos: [{ id: 's1' }] as never,
        selectedOutputId: 'out-1',
      },
      join: {
        stitchAfterGenerate: true,
        joinContextFrames: 12,
        joinGapFrames: 5,
        joinReplaceMode: false,
        joinKeepBridgingImages: true,
        joinPrompt: 'join prompt',
        joinNegativePrompt: 'join neg',
        joinEnhancePrompt: false,
        joinModel: 'join-model',
        joinNumInferenceSteps: 30,
        joinGuidanceScale: 6,
        joinSeed: 9,
        joinRandomSeed: false,
        joinMotionMode: 'basic' as const,
        joinPhaseConfig: { join: true } as never,
        joinSelectedPhasePresetId: 'join-preset',
        joinSelectedLoras: [{ id: 'jl1', path: 'loras/join.safetensors', strength: 0.5 }],
        joinPriority: 1,
        joinUseInputVideoResolution: true,
        joinUseInputVideoFps: false,
        joinNoisedInputVideo: 2,
        joinLoopFirstClip: false,
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

  it('wires batch request and prompt-clear behavior through child hooks', async () => {
    const params = createParams();
    const { result } = renderHook(() => useGenerationController(params as never));

    expect(mocks.useTimelineCore).toHaveBeenCalledWith('shot-1');
    expect(mocks.useGenerateBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        core: expect.objectContaining({
          selectedShotId: 'shot-1',
          generationMode: 'batch',
        }),
        request: expect.objectContaining({
          prompt: expect.objectContaining({ basePrompt: 'base prompt' }),
          stitchAfterGenerate: expect.objectContaining({
            contextFrameCount: 12,
            selectedLoras: [{ path: 'loras/join.safetensors', strength: 0.5 }],
          }),
        }),
      }),
    );

    await act(async () => {
      await result.current.handleBatchVideoPromptChangeWithClear('updated prompt');
    });

    expect(params.prompt.onPromptChange).toHaveBeenCalledWith('updated prompt');
    const timelineCoreResult = mocks.useTimelineCore.mock.results[0].value as {
      clearAllEnhancedPrompts: ReturnType<typeof vi.fn>;
    };
    expect(timelineCoreResult.clearAllEnhancedPrompts).toHaveBeenCalledTimes(1);
  });

  it('normalizes prompt-clear failures without throwing', async () => {
    const error = new Error('clear failed');
    mocks.useTimelineCore.mockReturnValue({
      clearAllEnhancedPrompts: vi.fn().mockRejectedValue(error),
      updatePairPromptsByIndex: vi.fn(),
      refetch: vi.fn(),
    });

    const params = createParams();
    const { result } = renderHook(() => useGenerationController(params as never));

    await act(async () => {
      await result.current.handleBatchVideoPromptChangeWithClear('retry prompt');
    });

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      error,
      { context: 'PromptClearLog', showToast: false },
    );
  });
});
