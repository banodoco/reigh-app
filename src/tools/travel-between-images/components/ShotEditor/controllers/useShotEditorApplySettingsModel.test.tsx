// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useShotEditorApplySettingsModel } from './useShotEditorApplySettingsModel';

const mocks = vi.hoisted(() => ({
  useAddImageToShot: vi.fn(),
  useRemoveImageFromShot: vi.fn(),
  useApplySettingsHandler: vi.fn(),
}));

vi.mock('@/shared/hooks/shots', () => ({
  useAddImageToShot: mocks.useAddImageToShot,
  useRemoveImageFromShot: mocks.useRemoveImageFromShot,
}));

vi.mock('../hooks/actions/useApplySettingsHandler', () => ({
  useApplySettingsHandler: mocks.useApplySettingsHandler,
}));

describe('useShotEditorApplySettingsModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAddImageToShot.mockReturnValue({ mutateAsync: vi.fn() });
    mocks.useRemoveImageFromShot.mockReturnValue({ mutateAsync: vi.fn() });
    mocks.useApplySettingsHandler.mockReturnValue({
      applySettingsFromTask: vi.fn(),
    });
  });

  function buildArgs() {
    return {
      core: {
        projectId: 'project-1',
        selectedShot: { id: 'shot-1' } as never,
        simpleFilteredImages: [{ id: 'image-1' }] as never[],
        availableLoras: [{ id: 'lora-1' }] as never,
        loraManager: { selectedLoras: [{ id: 'lora-1' }] } as never,
      },
      settings: {
        promptSettings: {
          prompt: 'Prompt',
          setPrompt: vi.fn(),
          enhancePrompt: false,
          setEnhancePrompt: vi.fn(),
          textBeforePrompts: 'Before',
          setTextBeforePrompts: vi.fn(),
          textAfterPrompts: 'After',
          setTextAfterPrompts: vi.fn(),
        },
        motionSettings: {
          motionMode: 'basic' as const,
          setMotionMode: vi.fn(),
          turboMode: true,
          setTurboMode: vi.fn(),
          amountOfMotion: 50,
          setAmountOfMotion: vi.fn(),
        },
        frameSettings: {
          batchVideoFrames: 61,
          setFrames: vi.fn(),
          batchVideoSteps: 6,
          setSteps: vi.fn(),
        },
        phaseConfigSettings: {
          generationTypeMode: 'vace' as const,
          setGenerationTypeMode: vi.fn(),
          phaseConfig: { num_phases: 3 } as never,
          setPhaseConfig: vi.fn(),
          selectPreset: vi.fn(),
          removePreset: vi.fn(),
          advancedMode: false,
        },
        generationModeSettings: {
          generationMode: 'timeline' as const,
          setGenerationMode: vi.fn(),
        },
        steerableMotionSettings: {
          steerableMotionSettings: { seed: 123, debug: true } as never,
          setSteerableMotionSettings: vi.fn(),
        },
      },
      structureVideo: {
        handleStructureVideoInputChange: vi.fn(),
      },
      generationController: {
        updatePairPromptsByIndex: vi.fn(),
        loadPositions: vi.fn(),
      },
    };
  }

  it('maps grouped editor slices into the apply-settings handler contract', () => {
    const args = buildArgs();

    const { result } = renderHook(() => useShotEditorApplySettingsModel(args));

    expect(mocks.useApplySettingsHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        core: {
          projectId: 'project-1',
          selectedShot: args.core.selectedShot,
          simpleFilteredImages: args.core.simpleFilteredImages,
        },
        contexts: expect.objectContaining({
          model: expect.objectContaining({
            steerableMotionSettings: args.settings.steerableMotionSettings.steerableMotionSettings,
            onSteerableMotionSettingsChange: args.settings.steerableMotionSettings.setSteerableMotionSettings,
          }),
          prompts: expect.objectContaining({
            onBatchVideoPromptChange: args.settings.promptSettings.setPrompt,
            updatePairPromptsByIndex: args.generationController.updatePairPromptsByIndex,
          }),
          generation: expect.objectContaining({
            onBatchVideoFramesChange: args.settings.frameSettings.setFrames,
            onBatchVideoStepsChange: args.settings.frameSettings.setSteps,
          }),
          modes: expect.objectContaining({
            onMotionModeChange: args.settings.motionSettings.setMotionMode,
            onGenerationTypeModeChange: args.settings.phaseConfigSettings.setGenerationTypeMode,
          }),
          advanced: expect.objectContaining({
            onPhasePresetSelect: args.settings.phaseConfigSettings.selectPreset,
            onPhasePresetRemove: args.settings.phaseConfigSettings.removePreset,
            onTurboModeChange: args.settings.motionSettings.setTurboMode,
          }),
          motion: expect.objectContaining({
            onAmountOfMotionChange: args.settings.motionSettings.setAmountOfMotion,
          }),
          structureVideo: expect.objectContaining({
            onStructureVideoInputChange: args.structureVideo.handleStructureVideoInputChange,
          }),
          loras: expect.objectContaining({
            availableLoras: args.core.availableLoras,
            loraManager: args.core.loraManager,
          }),
        }),
        mutations: expect.objectContaining({
          addImageToShotMutation: mocks.useAddImageToShot.mock.results[0].value,
          removeImageFromShotMutation: mocks.useRemoveImageFromShot.mock.results[0].value,
          loadPositions: args.generationController.loadPositions,
        }),
      }),
    );

    const modes = mocks.useApplySettingsHandler.mock.calls[0][0].contexts.modes;
    modes.onAdvancedModeChange(true);
    modes.onAdvancedModeChange(false);

    expect(args.settings.motionSettings.setMotionMode).toHaveBeenNthCalledWith(1, 'advanced');
    expect(args.settings.motionSettings.setMotionMode).toHaveBeenNthCalledWith(2, 'basic');
    expect(result.current).toBe(mocks.useApplySettingsHandler.mock.results[0].value);
  });
});
