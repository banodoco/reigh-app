import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseAutoSaveSettings = vi.fn();

vi.mock('@/shared/settings/hooks/useAutoSaveSettings', () => ({
  useAutoSaveSettings: (...args: unknown[]) => mockUseAutoSaveSettings(...args),
}));

import { usePersistentPromptSettings } from './usePersistentPromptSettings';

function buildPersistedState(overrides: Record<string, unknown> = {}) {
  return {
    settings: {
      generationSettings: {
        overallPromptText: '',
        remixPromptText: 'More like this',
        rulesToRememberText: '',
        numberToGenerate: 16,
        includeExistingContext: true,
        addSummary: true,
        replaceCurrentPrompts: false,
        temperature: 0.8,
        showAdvanced: false,
      },
      bulkEditSettings: {
        editInstructions: '',
        modelType: 'smart',
      },
      activeTab: 'generate',
    },
    updateField: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockUseAutoSaveSettings.mockReset();
  mockUseAutoSaveSettings.mockReturnValue(buildPersistedState());
});

describe('usePersistentPromptSettings', () => {
  it('passes project-scoped autosave config and returns persisted values', () => {
    const { result } = renderHook(() =>
      usePersistentPromptSettings({ selectedProjectId: 'project-1' }),
    );

    expect(mockUseAutoSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: 'prompt-editor-controls',
        projectId: 'project-1',
        scope: 'project',
        enabled: true,
        debounceMs: 150,
      }),
    );

    expect(result.current.activeTab).toBe('generate');
    expect(result.current.generationControlValues.numberToGenerate).toBe(16);
    expect(result.current.bulkEditControlValues.modelType).toBe('smart');
  });

  it('does not update generation settings when values are unchanged', () => {
    const persisted = buildPersistedState();
    mockUseAutoSaveSettings.mockReturnValue(persisted);

    const { result } = renderHook(() =>
      usePersistentPromptSettings({ selectedProjectId: 'project-1' }),
    );

    act(() => {
      result.current.handleGenerationValuesChange({ ...persisted.settings.generationSettings });
    });

    expect(persisted.updateField).not.toHaveBeenCalled();

    act(() => {
      result.current.handleGenerationValuesChange({
        ...persisted.settings.generationSettings,
        numberToGenerate: 4,
      });
    });

    expect(persisted.updateField).toHaveBeenCalledWith(
      'generationSettings',
      expect.objectContaining({ numberToGenerate: 4 }),
    );
  });

  it('does not update bulk-edit settings when values are unchanged', () => {
    const persisted = buildPersistedState();
    mockUseAutoSaveSettings.mockReturnValue(persisted);

    const { result } = renderHook(() =>
      usePersistentPromptSettings({ selectedProjectId: 'project-1' }),
    );

    act(() => {
      result.current.handleBulkEditValuesChange({ ...persisted.settings.bulkEditSettings });
    });
    expect(persisted.updateField).not.toHaveBeenCalled();

    act(() => {
      result.current.handleBulkEditValuesChange({
        ...persisted.settings.bulkEditSettings,
        editInstructions: 'Shorten every prompt',
      });
    });

    expect(persisted.updateField).toHaveBeenCalledWith(
      'bulkEditSettings',
      expect.objectContaining({ editInstructions: 'Shorten every prompt' }),
    );
  });

  it('always persists active tab changes and disables persistence without project id', () => {
    const persisted = buildPersistedState();
    mockUseAutoSaveSettings.mockReturnValue(persisted);

    const { result } = renderHook(() =>
      usePersistentPromptSettings({ selectedProjectId: null }),
    );

    expect(mockUseAutoSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: null,
        enabled: false,
      }),
    );

    act(() => {
      result.current.handleActiveTabChange('bulk-edit');
    });

    expect(persisted.updateField).toHaveBeenCalledWith('activeTab', 'bulk-edit');
  });
});
