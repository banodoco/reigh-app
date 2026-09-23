// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BUILTIN_I2V_PRESET } from '../../components/MotionControl.constants';
import { usePresetAutoSelect } from './usePresetAutoSelect';

describe('usePresetAutoSelect', () => {
  it('does not update canonical settings when a shot has no saved preset', async () => {
    const updateCanonicalSettings = vi.fn();

    renderHook(() => usePresetAutoSelect({
      builtinDefaultPreset: BUILTIN_I2V_PRESET,
      selectedPhasePresetId: null,
      onPhasePresetSelect: updateCanonicalSettings,
      settingsLoading: false,
      motionMode: 'basic',
      enabled: false,
    }));

    await waitFor(() => expect(updateCanonicalSettings).not.toHaveBeenCalled());
  });

  it('retains default auto-selection for noncanonical editors', async () => {
    const updateSettings = vi.fn();

    renderHook(() => usePresetAutoSelect({
      builtinDefaultPreset: BUILTIN_I2V_PRESET,
      selectedPhasePresetId: null,
      onPhasePresetSelect: updateSettings,
      settingsLoading: false,
      motionMode: 'basic',
    }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith(
      BUILTIN_I2V_PRESET.id,
      BUILTIN_I2V_PRESET.metadata.phaseConfig,
      BUILTIN_I2V_PRESET.metadata,
    ));
  });
});
