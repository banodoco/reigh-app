import React from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useShotEditorMediaAndOutputControllers } from './useShotEditorMediaAndOutputControllers';

const mocks = vi.hoisted(() => ({
  useOutputController: vi.fn(),
  useEditingController: vi.fn(),
}));

vi.mock('./useOutputController', () => ({
  useOutputController: mocks.useOutputController,
}));

vi.mock('./useEditingController', () => ({
  useEditingController: mocks.useEditingController,
}));

describe('useShotEditorMediaAndOutputControllers', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useOutputController.mockReturnValue({
      joinSegmentSlots: [{ id: 'slot-1' }],
      joinSelectedParent: { id: 'parent-1' },
      selectedOutputId: 'output-1',
    });

    mocks.useEditingController.mockReturnValue({
      mediaEditing: { audioUrl: 'audio.mp3' },
      joinWorkflow: { isJoiningClips: true },
    });
  });

  function buildArgs() {
    return {
      selectedProjectId: 'project-1',
      selectedShotId: 'shot-1',
      selectedShot: { id: 'shot-1' } as never,
      projectId: 'project-1',
      timelineImages: [{ id: 'image-1' }] as never[],
      effectiveAspectRatio: '16:9',
      swapButtonRef: { current: null } as React.RefObject<HTMLButtonElement>,
      onUpdateShotName: vi.fn(),
      state: {
        isEditingName: false,
        editingName: 'Shot 1',
      } as never,
      actions: {
        setEditingName: vi.fn(),
        setEditingNameValue: vi.fn(),
      } as never,
      generationTypeMode: 'vace' as const,
      setGenerationTypeMode: vi.fn(),
    };
  }

  it('threads output selection data into the editing controller input', () => {
    const args = buildArgs();

    const { result } = renderHook(() => useShotEditorMediaAndOutputControllers(args));

    expect(mocks.useOutputController).toHaveBeenCalledWith({
      selectedProjectId: 'project-1',
      selectedShotId: 'shot-1',
      selectedShot: args.selectedShot,
      projectId: 'project-1',
      timelineImages: args.timelineImages,
    });
    expect(mocks.useEditingController).toHaveBeenCalledWith({
      core: {
        selectedShotId: 'shot-1',
        projectId: 'project-1',
        selectedProjectId: 'project-1',
        selectedShot: args.selectedShot,
        effectiveAspectRatio: '16:9',
        swapButtonRef: args.swapButtonRef,
      },
      nameEditing: {
        onUpdateShotName: args.onUpdateShotName,
        state: args.state,
        actions: args.actions,
      },
      generationType: {
        generationTypeMode: 'vace',
        setGenerationTypeMode: args.setGenerationTypeMode,
      },
      joinInputs: {
        joinSegmentSlots: [{ id: 'slot-1' }],
        joinSelectedParent: { id: 'parent-1' },
      },
    });
    expect(result.current).toEqual({
      output: mocks.useOutputController.mock.results[0].value,
      editing: mocks.useEditingController.mock.results[0].value,
    });
  });
});
