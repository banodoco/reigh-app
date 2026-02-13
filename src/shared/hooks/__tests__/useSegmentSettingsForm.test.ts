import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockSettings = { prompt: 'test prompt', numFrames: 25 };
const mockUpdateSettings = vi.fn();
const mockSaveSettings = vi.fn().mockResolvedValue(true);
const mockResetSettings = vi.fn();
const mockSaveAsShotDefaults = vi.fn().mockResolvedValue(true);
const mockSaveFieldAsDefault = vi.fn().mockResolvedValue(true);
const mockGetSettingsForTaskCreation = vi.fn(() => mockSettings);
const mockClearEnhancedPrompt = vi.fn();
const mockSaveEnhancePromptEnabled = vi.fn().mockResolvedValue(true);

vi.mock('../useSegmentSettings', () => ({
  useSegmentSettings: vi.fn(() => ({
    settings: mockSettings,
    updateSettings: mockUpdateSettings,
    saveSettings: mockSaveSettings,
    resetSettings: mockResetSettings,
    saveAsShotDefaults: mockSaveAsShotDefaults,
    saveFieldAsDefault: mockSaveFieldAsDefault,
    getSettingsForTaskCreation: mockGetSettingsForTaskCreation,
    isLoading: false,
    isDirty: false,
    hasOverride: { prompt: true },
    shotDefaults: { prompt: 'default prompt' },
    enhancedPrompt: undefined,
    basePromptForEnhancement: undefined,
    clearEnhancedPrompt: mockClearEnhancedPrompt,
    enhancePromptEnabled: false,
    saveEnhancePromptEnabled: mockSaveEnhancePromptEnabled,
  })),
}));

import { useSegmentSettingsForm } from '../useSegmentSettingsForm';

describe('useSegmentSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns expected shape', () => {
    const { result } = renderHook(() =>
      useSegmentSettingsForm({
        pairShotGenerationId: 'psg-1',
        shotId: 'shot-1',
        defaults: { prompt: '', numFrames: 25 },
      })
    );

    expect(result.current.formProps).toBeDefined();
    expect(typeof result.current.getSettingsForTaskCreation).toBe('function');
    expect(typeof result.current.saveSettings).toBe('function');
    expect(typeof result.current.updateSettings).toBe('function');
    expect(result.current.settings).toEqual(mockSettings);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isDirty).toBe(false);
    expect(typeof result.current.effectiveEnhanceEnabled).toBe('boolean');
    expect(result.current.enhancePromptRef).toBeDefined();
    expect(typeof result.current.handleEnhancePromptChange).toBe('function');
  });

  it('formProps includes settings and onChange', () => {
    const { result } = renderHook(() =>
      useSegmentSettingsForm({
        pairShotGenerationId: 'psg-1',
        shotId: 'shot-1',
        defaults: { prompt: '', numFrames: 25 },
      })
    );

    expect(result.current.formProps.settings).toEqual(mockSettings);
    expect(result.current.formProps.onChange).toBe(mockUpdateSettings);
    expect(result.current.formProps.onRestoreDefaults).toBe(mockResetSettings);
    expect(result.current.formProps.onSaveAsShotDefaults).toBe(mockSaveAsShotDefaults);
  });

  it('formProps passes through display options', () => {
    const { result } = renderHook(() =>
      useSegmentSettingsForm({
        pairShotGenerationId: 'psg-1',
        shotId: 'shot-1',
        defaults: { prompt: '', numFrames: 25 },
        segmentIndex: 3,
        startImageUrl: 'start.jpg',
        endImageUrl: 'end.jpg',
        modelName: 'wan-2.1',
        resolution: '720p',
        isRegeneration: true,
        buttonLabel: 'Generate',
        showHeader: true,
        maxFrames: 100,
      })
    );

    expect(result.current.formProps.segmentIndex).toBe(3);
    expect(result.current.formProps.startImageUrl).toBe('start.jpg');
    expect(result.current.formProps.endImageUrl).toBe('end.jpg');
    expect(result.current.formProps.modelName).toBe('wan-2.1');
    expect(result.current.formProps.resolution).toBe('720p');
    expect(result.current.formProps.isRegeneration).toBe(true);
    expect(result.current.formProps.buttonLabel).toBe('Generate');
    expect(result.current.formProps.showHeader).toBe(true);
    expect(result.current.formProps.maxFrames).toBe(100);
  });

  it('effectiveEnhanceEnabled defaults to false when undefined', () => {
    const { result } = renderHook(() =>
      useSegmentSettingsForm({
        pairShotGenerationId: 'psg-1',
        shotId: 'shot-1',
        defaults: { prompt: '' },
      })
    );

    expect(result.current.effectiveEnhanceEnabled).toBe(false);
  });

  it('handleEnhancePromptChange updates ref synchronously', () => {
    const { result } = renderHook(() =>
      useSegmentSettingsForm({
        pairShotGenerationId: 'psg-1',
        shotId: 'shot-1',
        defaults: { prompt: '' },
      })
    );

    expect(result.current.enhancePromptRef.current).toBe(false);

    result.current.handleEnhancePromptChange(true);

    expect(result.current.enhancePromptRef.current).toBe(true);
    expect(mockSaveEnhancePromptEnabled).toHaveBeenCalledWith(true);
  });

  it('getSettingsForTaskCreation delegates to segment settings', () => {
    const { result } = renderHook(() =>
      useSegmentSettingsForm({
        pairShotGenerationId: 'psg-1',
        shotId: 'shot-1',
        defaults: { prompt: '' },
      })
    );

    const settings = result.current.getSettingsForTaskCreation();
    expect(settings).toEqual(mockSettings);
  });

  it('passes structure video callbacks through formProps', () => {
    const onAdd = vi.fn();
    const onUpdate = vi.fn();
    const onRemove = vi.fn();

    const { result } = renderHook(() =>
      useSegmentSettingsForm({
        pairShotGenerationId: 'psg-1',
        shotId: 'shot-1',
        defaults: { prompt: '' },
        isTimelineMode: true,
        onAddSegmentStructureVideo: onAdd,
        onUpdateSegmentStructureVideo: onUpdate,
        onRemoveSegmentStructureVideo: onRemove,
      })
    );

    expect(result.current.formProps.isTimelineMode).toBe(true);
    expect(result.current.formProps.onAddSegmentStructureVideo).toBe(onAdd);
    expect(result.current.formProps.onUpdateSegmentStructureVideo).toBe(onUpdate);
    expect(result.current.formProps.onRemoveSegmentStructureVideo).toBe(onRemove);
  });
});
