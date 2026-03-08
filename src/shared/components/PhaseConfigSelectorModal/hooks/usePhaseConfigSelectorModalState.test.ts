import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePhaseConfigSelectorModalState } from './usePhaseConfigSelectorModalState';

function buildPreset(id: string = 'preset-1') {
  return {
    id,
    type: 'phase-config',
    metadata: {
      name: 'Preset',
      description: '',
      created_by: { is_you: true },
      is_public: true,
      created_at: '2026-01-01T00:00:00.000Z',
      phaseConfig: {
        num_phases: 2,
        steps_per_phase: [2, 2],
        flow_shift: 5,
        sample_solver: 'euler',
        model_switch_phase: 1,
        phases: [
          { phase: 1, guidance_scale: 1, loras: [] },
          { phase: 2, guidance_scale: 1, loras: [] },
        ],
      },
    },
  };
}

describe('usePhaseConfigSelectorModalState', () => {
  it('initializes state from tab/intent and syncs showMyPresetsOnly for overwrite intent', () => {
    const { result, rerender } = renderHook(
      ({ isOpen, initialTab, intent }) =>
        usePhaseConfigSelectorModalState({ isOpen, initialTab, intent }),
      {
        initialProps: { isOpen: true, initialTab: 'browse' as const, intent: 'load' as const },
      },
    );

    expect(result.current.state.activeTab).toBe('browse');
    expect(result.current.state.showMyPresetsOnly).toBe(false);

    rerender({ isOpen: true, initialTab: 'browse', intent: 'overwrite' });
    expect(result.current.state.showMyPresetsOnly).toBe(true);
  });

  it('handles editing and overwrite flows, then clears when switching back to browse', () => {
    const { result } = renderHook(() =>
      usePhaseConfigSelectorModalState({ isOpen: true, initialTab: 'browse', intent: 'load' }),
    );

    const preset = buildPreset();

    act(() => {
      result.current.handleEdit(preset as never);
    });
    expect(result.current.state.activeTab).toBe('add-new');
    expect(result.current.state.editingPreset?.id).toBe('preset-1');
    expect(result.current.state.isOverwriting).toBe(false);

    act(() => {
      result.current.handleOverwrite(buildPreset('preset-2') as never);
    });
    expect(result.current.state.editingPreset?.id).toBe('preset-2');
    expect(result.current.state.isOverwriting).toBe(true);

    act(() => {
      result.current.handleSwitchToBrowse();
    });
    expect(result.current.state.activeTab).toBe('browse');
    expect(result.current.state.editingPreset).toBeNull();
    expect(result.current.state.isOverwriting).toBe(false);
  });

  it('normalizes setActiveTab values and supports manual clear edit', () => {
    const { result } = renderHook(() =>
      usePhaseConfigSelectorModalState({ isOpen: true, initialTab: 'browse', intent: 'load' }),
    );

    act(() => {
      result.current.setActiveTab('add-new');
    });
    expect(result.current.state.activeTab).toBe('add-new');

    act(() => {
      result.current.setActiveTab('unexpected-tab');
    });
    expect(result.current.state.activeTab).toBe('browse');

    act(() => {
      result.current.handleEdit(buildPreset() as never);
      result.current.handleClearEdit();
    });
    expect(result.current.state.editingPreset).toBeNull();
    expect(result.current.state.isOverwriting).toBe(false);
  });

  it('updates toggle, processed length, and pagination state', () => {
    const { result } = renderHook(() =>
      usePhaseConfigSelectorModalState({ isOpen: true, initialTab: 'browse', intent: 'load' }),
    );

    act(() => {
      result.current.toggleShowMyPresetsOnly();
      result.current.toggleShowSelectedPresetOnly();
      result.current.setProcessedPresetsLength(42);
    });

    expect(result.current.state.showMyPresetsOnly).toBe(true);
    expect(result.current.state.showSelectedPresetOnly).toBe(true);
    expect(result.current.state.processedPresetsLength).toBe(42);

    const setPage = (page: number) => page;
    act(() => {
      result.current.handlePageChange(2, 5, setPage);
    });

    expect(result.current.state.currentPage).toBe(2);
    expect(result.current.state.totalPages).toBe(5);
    expect(result.current.state.onPageChange).toBe(setPage);
  });
});
