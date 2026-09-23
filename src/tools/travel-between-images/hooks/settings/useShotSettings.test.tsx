import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultVideoTravelSettings, type VideoTravelSettings } from '../../settings';
import type { CustomLoadSave } from '@/shared/settings/hooks/useAutoSaveSettings';

const { inheritedDefaults, lastEditedLora } = vi.hoisted(() => ({
  inheritedDefaults: { current: null as unknown },
  lastEditedLora: {
    id: 'lora-1',
    name: 'Last edited LoRA',
    path: '/lora-1',
    strength: 1,
  },
}));

vi.mock('@/shared/hooks/settings/useToolSettings', () => ({
  useToolSettings: () => ({
    settings: null,
    isLoading: false,
    error: null,
    update: vi.fn(),
    hasShotSettings: false,
  }),
}));

vi.mock('@/shared/lib/lastEditedLora', () => ({
  readLastEditedLoraFromLocalStorage: () => lastEditedLora,
  readLastEditedLoraFromProject: vi.fn(async () => null),
}));

vi.mock('@/shared/dev/devSession', () => ({
  hasLocalModeUrlParams: () => true,
}));

vi.mock('./inheritedDefaults', () => ({
  useSessionInheritedDefaults: () => inheritedDefaults.current,
}));

import { useShotSettings } from './useShotSettings';

describe('useShotSettings canonical persistence', () => {
  let domainId = 0;

  beforeEach(() => {
    inheritedDefaults.current = null;
    localStorage.clear();
    domainId += 1;
  });

  function createPersistence() {
    const persistence: CustomLoadSave<VideoTravelSettings> = {
      entityId: `shot-${domainId}`,
      domainKey: `canonical-settings-no-mount-write-${domainId}`,
      load: vi.fn(async () => null),
      save: vi.fn(async () => {}),
    };
    return persistence;
  }

  it('does not persist automatic LoRA seeding when a canonical shot mounts clean', async () => {
    const persistence = createPersistence();

    const { result } = renderHook(() => useShotSettings('shot-1', 'project-1', {
      customLoadSave: persistence,
    }));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));

    expect(persistence.save).not.toHaveBeenCalled();
    expect(result.current.settings.loras).toEqual([]);
  });

  it('keeps session-inherited defaults local on canonical popup mount', async () => {
    const persistence = createPersistence();
    inheritedDefaults.current = {
      ...createDefaultVideoTravelSettings(),
      prompt: 'session-inherited prompt',
    };

    const { result } = renderHook(() => useShotSettings('shot-1', 'project-1', {
      customLoadSave: persistence,
    }));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));

    expect(persistence.save).not.toHaveBeenCalled();
    expect(result.current.settings.prompt).toBe('session-inherited prompt');
  });

  it('persists a deliberate canonical settings edit', async () => {
    const persistence = createPersistence();
    const { result } = renderHook(() => useShotSettings('shot-2', 'project-1', {
      customLoadSave: persistence,
    }));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.updateField('prompt', 'user-edited prompt'));

    await waitFor(() => expect(persistence.save).toHaveBeenCalledTimes(1));
    expect(persistence.save).toHaveBeenCalledWith(
      persistence.entityId,
      expect.objectContaining({ prompt: 'user-edited prompt' }),
    );
  });

  it('preserves the edited draft after a stale canonical publish fails', async () => {
    const persistence = createPersistence();
    vi.mocked(persistence.save).mockRejectedValueOnce(new Error('stale head'));
    const { result } = renderHook(() => useShotSettings('shot-3', 'project-1', {
      customLoadSave: persistence,
    }));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.updateField('prompt', 'draft survives conflict'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(persistence.save).toHaveBeenCalledTimes(1);
    expect(result.current.settings.prompt).toBe('draft survives conflict');
    expect(result.current.isDirty).toBe(true);
  });
});
