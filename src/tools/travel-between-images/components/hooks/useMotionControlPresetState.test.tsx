// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUILTIN_DEFAULT_I2V_ID,
  BUILTIN_DEFAULT_VACE_ID,
} from '../MotionControl.constants';

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  usePresetAutoSelect: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mocks.useQuery(...args),
}));

vi.mock('../../hooks/settings/usePresetAutoSelect', () => ({
  usePresetAutoSelect: (...args: unknown[]) => mocks.usePresetAutoSelect(...args),
}));

import { useMotionControlPresetState } from './useMotionControlPresetState';

describe('useMotionControlPresetState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useQuery.mockReturnValue({
      data: [
        {
          id: 'preset-1',
          metadata: {
            name: 'Preset One',
            description: 'Featured preset',
            phaseConfig: { cadence: 4 },
            sample_generations: [{ id: 'sample-1' }],
          },
        },
        {
          id: 'preset-invalid',
          metadata: null,
        },
      ],
    });
  });

  it('builds builtin and featured preset options and forwards selection actions', () => {
    const onPhasePresetSelect = vi.fn();
    const onPhasePresetRemove = vi.fn();
    const onMotionModeChange = vi.fn();

    const { result } = renderHook(() => useMotionControlPresetState({
      generationTypeMode: 'i2v',
      featuredPresetIds: ['preset-1', 'preset-invalid'],
      selectedPhasePresetId: 'preset-1',
      onPhasePresetSelect,
      onPhasePresetRemove,
      motionMode: 'basic',
      settingsLoading: false,
      onMotionModeChange,
    }));

    expect(result.current.builtinDefaultId).toBe(BUILTIN_DEFAULT_I2V_ID);
    expect(result.current.isCustomConfig).toBe(false);
    expect(result.current.isSelectedPresetKnown).toBe(true);
    expect(result.current.allPresets.map((preset) => preset.id)).toEqual([
      BUILTIN_DEFAULT_I2V_ID,
      'preset-1',
    ]);
    expect(mocks.usePresetAutoSelect).toHaveBeenCalled();

    act(() => {
      result.current.openPresetModal();
    });
    expect(result.current.isPresetModalOpen).toBe(true);

    act(() => {
      result.current.handlePresetSelect(result.current.allPresets[1]);
      result.current.handleCustomClick();
      result.current.handleSwitchToAdvanced();
    });

    expect(onPhasePresetSelect).toHaveBeenCalledWith(
      'preset-1',
      { cadence: 4 },
      expect.objectContaining({ name: 'Preset One' }),
    );
    expect(onPhasePresetRemove).toHaveBeenCalledTimes(1);
    expect(onMotionModeChange).toHaveBeenCalledWith('advanced');
    expect(result.current.isPresetModalOpen).toBe(false);
  });

  it('uses the VACE builtin preset id and flags unknown selections', () => {
    const { result } = renderHook(() => useMotionControlPresetState({
      generationTypeMode: 'vace',
      featuredPresetIds: [],
      selectedPhasePresetId: 'unknown-preset',
      onPhasePresetSelect: vi.fn(),
      onPhasePresetRemove: vi.fn(),
      motionMode: 'advanced',
      settingsLoading: false,
      onMotionModeChange: vi.fn(),
    }));

    expect(result.current.builtinDefaultId).toBe(BUILTIN_DEFAULT_VACE_ID);
    expect(result.current.isSelectedPresetKnown).toBe(false);
  });

  it('keeps the built-in default visually selected without persisting it on canonical mount', () => {
    const onPhasePresetSelect = vi.fn();
    const { result } = renderHook(() => useMotionControlPresetState({
      generationTypeMode: 'i2v',
      featuredPresetIds: [],
      selectedPhasePresetId: null,
      onPhasePresetSelect,
      onPhasePresetRemove: vi.fn(),
      motionMode: 'basic',
      settingsLoading: false,
      autoSelectDefaultPreset: false,
      onMotionModeChange: vi.fn(),
    }));

    expect(result.current.displaySelectedPhasePresetId).toBe(BUILTIN_DEFAULT_I2V_ID);
    expect(result.current.isCustomConfig).toBe(false);
    expect(mocks.usePresetAutoSelect).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    expect(onPhasePresetSelect).not.toHaveBeenCalled();

    act(() => result.current.handlePresetSelect(result.current.allPresets[0]));
    expect(onPhasePresetSelect).toHaveBeenCalledWith(
      BUILTIN_DEFAULT_I2V_ID,
      result.current.allPresets[0].metadata.phaseConfig,
      result.current.allPresets[0].metadata,
    );
  });
});
