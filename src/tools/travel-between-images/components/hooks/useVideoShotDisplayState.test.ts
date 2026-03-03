import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useVideoShotDisplayState } from './useVideoShotDisplayState';

describe('useVideoShotDisplayState', () => {
  it('handles local editing state and selection synchronization', () => {
    const { result, rerender } = renderHook(
      (props: { locked: boolean; selectedShotId?: string | null; shotName: string }) =>
        useVideoShotDisplayState({
          shotId: 'shot-1',
          shotName: props.shotName,
          selectedShotId: props.selectedShotId,
          isGenerationsPaneLocked: props.locked,
        }),
      {
        initialProps: {
          locked: false,
          selectedShotId: null,
          shotName: 'First shot',
        },
      },
    );

    expect(result.current.editableName).toBe('First shot');
    expect(result.current.isSelectedForAddition).toBe(false);

    act(() => {
      result.current.startNameEdit();
      result.current.setEditableName('Renamed shot');
      result.current.finishNameEdit();
      result.current.setDeleteDialogOpen(true);
      result.current.setSkipConfirmationChecked(true);
      result.current.setDeleteDialogOpen(false);
    });

    expect(result.current.isEditingName).toBe(false);
    expect(result.current.editableName).toBe('Renamed shot');
    expect(result.current.skipConfirmationChecked).toBe(false);

    rerender({
      locked: true,
      selectedShotId: 'shot-1',
      shotName: 'Synced name',
    });

    expect(result.current.isSelectedForAddition).toBe(true);
    expect(result.current.editableName).toBe('Synced name');
  });
});
