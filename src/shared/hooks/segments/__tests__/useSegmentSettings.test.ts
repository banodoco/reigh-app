import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock sub-hooks — use vi.hoisted to avoid hoisting issues
const {
  mockSavePairMetadata,
  mockSaveAsShotDefaults,
  mockSaveFieldAsDefault,
  mockClearEnhancedPrompt,
  mockSaveEnhancePromptEnabled,
} = vi.hoisted(() => ({
  mockSavePairMetadata: vi.fn().mockResolvedValue(true),
  mockSaveAsShotDefaults: vi.fn().mockResolvedValue(true),
  mockSaveFieldAsDefault: vi.fn().mockResolvedValue(true),
  mockClearEnhancedPrompt: vi.fn().mockResolvedValue(true),
  mockSaveEnhancePromptEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock('../usePairMetadata', () => ({
  usePairMetadata: vi.fn().mockReturnValue({
    data: null,
    isLoading: false,
  }),
}));

vi.mock('../useShotVideoSettings', () => ({
  useShotVideoSettings: vi.fn().mockReturnValue({
    data: null,
    isLoading: false,
  }),
}));

vi.mock('../useSegmentMutations', () => ({
  useSegmentMutations: vi.fn().mockReturnValue({
    savePairMetadata: mockSavePairMetadata,
    saveAsShotDefaults: mockSaveAsShotDefaults,
    saveFieldAsDefault: mockSaveFieldAsDefault,
    clearEnhancedPrompt: mockClearEnhancedPrompt,
    saveEnhancePromptEnabled: mockSaveEnhancePromptEnabled,
  }),
}));

vi.mock('../../useServerForm', () => ({
  useServerForm: vi.fn().mockImplementation(({ serverData, isLoading }: { serverData: unknown; isLoading: boolean }) => ({
    data: serverData || { prompt: '', negativePrompt: '', numFrames: 25, randomSeed: true, makePrimaryVariant: false },
    localData: null,
    isDirty: false,
    isLoading,
    update: vi.fn(),
    save: vi.fn().mockResolvedValue(true),
    saveData: vi.fn().mockResolvedValue(true),
    reset: vi.fn(),
  })),
}));

vi.mock('@/shared/utils/settingsMigration', () => ({
  readSegmentOverrides: vi.fn().mockReturnValue({}),
  writeSegmentOverrides: vi.fn().mockReturnValue({}),
}));

import { useSegmentSettings } from '../useSegmentSettings';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

describe('useSegmentSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the correct shape', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        useSegmentSettings({
          pairShotGenerationId: 'pair-1',
          shotId: 'shot-1',
          defaults: {
            prompt: '',
            negativePrompt: '',
            numFrames: 25,
          },
        }),
      { wrapper }
    );

    expect(result.current).toHaveProperty('settings');
    expect(result.current).toHaveProperty('updateSettings');
    expect(result.current).toHaveProperty('saveSettings');
    expect(result.current).toHaveProperty('resetSettings');
    expect(result.current).toHaveProperty('saveAsShotDefaults');
    expect(result.current).toHaveProperty('saveFieldAsDefault');
    expect(result.current).toHaveProperty('getSettingsForTaskCreation');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('isDirty');
    expect(result.current).toHaveProperty('hasOverride');
    expect(result.current).toHaveProperty('shotDefaults');
    expect(result.current).toHaveProperty('enhancedPrompt');
    expect(result.current).toHaveProperty('clearEnhancedPrompt');
    expect(result.current).toHaveProperty('enhancePromptEnabled');
    expect(result.current).toHaveProperty('saveEnhancePromptEnabled');
  });

  it('provides shot defaults with fallback values', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        useSegmentSettings({
          pairShotGenerationId: 'pair-1',
          shotId: 'shot-1',
          defaults: {
            prompt: '',
            negativePrompt: '',
          },
        }),
      { wrapper }
    );

    expect(result.current.shotDefaults).toEqual({
      prompt: '',
      negativePrompt: '',
      motionMode: 'basic',
      amountOfMotion: 50,
      phaseConfig: undefined,
      loras: [],
      selectedPhasePresetId: null,
      textBeforePrompts: '',
      textAfterPrompts: '',
    });
  });

  it('builds shot defaults from shot video settings', async () => {
    const { useShotVideoSettings } = await import('../useShotVideoSettings');
    (useShotVideoSettings as unknown).mockReturnValue({
      data: {
        prompt: 'shot prompt',
        negativePrompt: 'shot neg',
        motionMode: 'advanced',
        amountOfMotion: 75,
        phaseConfig: { phases: [] },
        loras: [{ path: 'lora1', strength: 0.5 }],
        selectedPhasePresetId: 'preset-1',
        textBeforePrompts: 'before',
        textAfterPrompts: 'after',
      },
      isLoading: false,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        useSegmentSettings({
          pairShotGenerationId: 'pair-1',
          shotId: 'shot-1',
          defaults: { prompt: '', negativePrompt: '' },
        }),
      { wrapper }
    );

    expect(result.current.shotDefaults.prompt).toBe('shot prompt');
    expect(result.current.shotDefaults.negativePrompt).toBe('shot neg');
    expect(result.current.shotDefaults.motionMode).toBe('advanced');
    expect(result.current.shotDefaults.amountOfMotion).toBe(75);
    expect(result.current.shotDefaults.loras).toHaveLength(1);
    expect(result.current.shotDefaults.selectedPhasePresetId).toBe('preset-1');
    expect(result.current.shotDefaults.textBeforePrompts).toBe('before');
    expect(result.current.shotDefaults.textAfterPrompts).toBe('after');
  });

  it('getSettingsForTaskCreation merges with shot defaults', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        useSegmentSettings({
          pairShotGenerationId: 'pair-1',
          shotId: 'shot-1',
          defaults: { prompt: '', negativePrompt: '' },
        }),
      { wrapper }
    );

    const taskSettings = result.current.getSettingsForTaskCreation();

    // Should have all required fields
    expect(taskSettings).toHaveProperty('prompt');
    expect(taskSettings).toHaveProperty('negativePrompt');
    expect(taskSettings).toHaveProperty('motionMode');
    expect(taskSettings).toHaveProperty('amountOfMotion');
    expect(taskSettings).toHaveProperty('numFrames');
    expect(taskSettings).toHaveProperty('randomSeed');
    expect(taskSettings).toHaveProperty('makePrimaryVariant');
  });

  it('exposes enhanced prompt from pair metadata', async () => {
    const { usePairMetadata } = await import('../usePairMetadata');
    (usePairMetadata as unknown).mockReturnValue({
      data: {
        enhanced_prompt: '  enhanced text  ',
        base_prompt_for_enhancement: 'base text',
        enhance_prompt_enabled: true,
      },
      isLoading: false,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        useSegmentSettings({
          pairShotGenerationId: 'pair-1',
          shotId: 'shot-1',
          defaults: { prompt: '', negativePrompt: '' },
        }),
      { wrapper }
    );

    expect(result.current.enhancedPrompt).toBe('enhanced text');
    expect(result.current.basePromptForEnhancement).toBe('base text');
    expect(result.current.enhancePromptEnabled).toBe(true);
  });

  it('returns undefined enhancedPrompt when not present', async () => {
    const { usePairMetadata } = await import('../usePairMetadata');
    (usePairMetadata as unknown).mockReturnValue({
      data: {},
      isLoading: false,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        useSegmentSettings({
          pairShotGenerationId: 'pair-1',
          shotId: 'shot-1',
          defaults: { prompt: '', negativePrompt: '' },
        }),
      { wrapper }
    );

    expect(result.current.enhancedPrompt).toBeUndefined();
  });

  it('converts shot settings to legacy ShotBatchSettings', async () => {
    const { useShotVideoSettings } = await import('../useShotVideoSettings');
    (useShotVideoSettings as unknown).mockReturnValue({
      data: {
        prompt: 'test',
        negativePrompt: 'neg',
        motionMode: 'basic',
        amountOfMotion: 50,
        loras: [],
        phaseConfig: undefined,
      },
      isLoading: false,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        useSegmentSettings({
          pairShotGenerationId: 'pair-1',
          shotId: 'shot-1',
          defaults: { prompt: '', negativePrompt: '' },
        }),
      { wrapper }
    );

    expect(result.current.shotBatchSettings).not.toBeNull();
    // amountOfMotion should be divided by 100 for legacy format
    expect(result.current.shotBatchSettings!.amountOfMotion).toBe(0.5);
    expect(result.current.shotBatchSettings!.prompt).toBe('test');
  });

  it('returns null shotBatchSettings when no shot settings', async () => {
    const { useShotVideoSettings } = await import('../useShotVideoSettings');
    (useShotVideoSettings as unknown).mockReturnValue({
      data: null,
      isLoading: false,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        useSegmentSettings({
          pairShotGenerationId: 'pair-1',
          shotId: 'shot-1',
          defaults: { prompt: '', negativePrompt: '' },
        }),
      { wrapper }
    );

    expect(result.current.shotBatchSettings).toBeNull();
  });
});
