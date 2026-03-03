import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { JoinClipsGrid } from './JoinClipsGrid';

const mocks = vi.hoisted(() => ({
  SortableClip: vi.fn(() => <div data-testid="sortable-clip" />),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div data-testid="dnd-context">{children}</div>,
  closestCenter: vi.fn(),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div data-testid="sortable-context">{children}</div>,
  rectSortingStrategy: vi.fn(),
}));

vi.mock('@/shared/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('@/tools/join-clips/components/SortableClip', () => ({
  SortableClip: (props: unknown) => mocks.SortableClip(props),
}));

describe('JoinClipsGrid', () => {
  function buildJoinSettings(overrides: Record<string, unknown> = {}) {
    return {
      status: 'ready',
      settings: {
        clips: [],
        useIndividualPrompts: false,
        loopFirstClip: false,
      },
      updateField: vi.fn(),
      ...overrides,
    } as never;
  }

  function buildClipManager(overrides: Record<string, unknown> = {}) {
    return {
      clips: [],
      cachedClipsCount: 2,
      isLoadingPersistedMedia: false,
      sensors: [],
      handleDragEnd: vi.fn(),
      uploadingClipId: null,
      draggingOverClipId: null,
      isScrolling: false,
      videoRefs: { current: [] },
      fileInputRefs: { current: [] },
      transitionPrompts: {},
      handleRemoveClip: vi.fn(),
      handleClearVideo: vi.fn(),
      handleVideoUpload: vi.fn(),
      handleDragOver: vi.fn(),
      handleDragEnter: vi.fn(),
      handleDragLeave: vi.fn(),
      handleDrop: vi.fn(),
      handlePromptChange: vi.fn(),
      setClips: vi.fn(),
      setLightboxClip: vi.fn(),
      ...overrides,
    } as never;
  }

  it('renders skeleton grid while loading settings', () => {
    render(
      <JoinClipsGrid
        joinSettings={buildJoinSettings({ status: 'loading' })}
        clipManager={buildClipManager({ cachedClipsCount: 3 })}
        settingsLoaded={false}
      />,
    );

    expect(screen.queryByTestId('dnd-context')).toBeNull();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(6);
  });

  it('renders skeleton when persisted clips exist but media has not hydrated yet', () => {
    render(
      <JoinClipsGrid
        joinSettings={buildJoinSettings({ settings: { clips: [{ id: 'persisted-1' }] } })}
        clipManager={buildClipManager({ clips: [] })}
        settingsLoaded
      />,
    );

    expect(screen.queryByTestId('sortable-clip')).toBeNull();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(3);
  });

  it('renders sortable clips and passes loop toggle through updateField', () => {
    const joinSettings = buildJoinSettings({
      settings: {
        clips: [],
        useIndividualPrompts: true,
        loopFirstClip: true,
      },
    });
    const clipManager = buildClipManager({
      clips: [
        { id: 'clip-1', finalFrameUrl: 'f1.png' },
        { id: 'clip-2', finalFrameUrl: 'f2.png' },
      ],
    });

    render(
      <JoinClipsGrid
        joinSettings={joinSettings}
        clipManager={clipManager}
        settingsLoaded
      />,
    );

    expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
    expect(screen.getAllByTestId('sortable-clip')).toHaveLength(2);

    const firstClipProps = mocks.SortableClip.mock.calls[0][0];
    expect(firstClipProps).toEqual(
      expect.objectContaining({
        firstClipFinalFrameUrl: 'f1.png',
        useIndividualPrompts: true,
        loopFirstClip: true,
      }),
    );

    firstClipProps.onLoopFirstClipChange(false);
    expect(joinSettings.updateField).toHaveBeenCalledWith('loopFirstClip', false);
  });
});
