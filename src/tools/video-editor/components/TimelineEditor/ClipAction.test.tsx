// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClipMeta } from '@/tools/video-editor/lib/timeline-data';
import type { TimelineAction } from '@/tools/video-editor/types/timeline-canvas';
import { ClipAction } from './ClipAction';

function buildProps(overrides: Partial<ComponentProps<typeof ClipAction>> = {}) {
  const action: TimelineAction = {
    id: 'clip-1',
    start: 1,
    end: 3,
    effectId: 'effect-1',
  };
  const clipMeta: ClipMeta = {
    asset: 'asset-1',
    track: 'V1',
    clipType: 'media',
  };

  return {
    action,
    clipMeta,
    isSelected: true,
    isPrimary: true,
    selectedClipIds: ['clip-1', 'clip-2'],
    onSelect: vi.fn(),
    onSplitHere: vi.fn(),
    onSplitClipsAtPlayhead: vi.fn(),
    onDeleteClip: vi.fn(),
    onDeleteClips: vi.fn(),
    onToggleMuteClips: vi.fn(),
    canCreateShotFromSelection: true,
    existingShots: [],
    onCreateShotFromSelection: vi.fn(),
    onGenerateVideoFromSelection: vi.fn(),
    onNavigateToShot: vi.fn(),
    onOpenGenerateVideo: vi.fn(),
    isCreatingShot: false,
    ...overrides,
  };
}

describe('ClipAction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds create-shot actions without disturbing existing batch actions', () => {
    const props = buildProps();
    const { container } = render(<ClipAction {...props} />);

    fireEvent.contextMenu(container.querySelector('[data-clip-id="clip-1"]') as HTMLElement);

    expect(screen.getByText('Mute/Unmute 2 clips')).toBeInTheDocument();
    expect(screen.getByText('Split 2 clips at playhead')).toBeInTheDocument();
    expect(screen.getByText('Create Shot')).toBeInTheDocument();
    expect(screen.getByText('Generate Video')).toBeInTheDocument();
    expect(screen.getByText('Delete 2 clips')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Create Shot'));

    expect(props.onCreateShotFromSelection).toHaveBeenCalledTimes(1);
  });

  it('hides create-shot actions when the selection is not eligible', () => {
    const props = buildProps({
      canCreateShotFromSelection: false,
    });
    const { container } = render(<ClipAction {...props} />);

    fireEvent.contextMenu(container.querySelector('[data-clip-id="clip-1"]') as HTMLElement);

    expect(screen.queryByText('Create Shot')).not.toBeInTheDocument();
    expect(screen.queryByText('Generate Video')).not.toBeInTheDocument();
    expect(screen.getByText('Mute/Unmute 2 clips')).toBeInTheDocument();
    expect(screen.getByText('Delete 2 clips')).toBeInTheDocument();
  });

  it('selects an unselected clip before opening its context menu', () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    }) as typeof window.requestAnimationFrame;

    const props = buildProps({
      isSelected: false,
      selectedClipIds: [],
      onDeleteClip: vi.fn(),
    });
    const { container } = render(<ClipAction {...props} />);

    fireEvent.contextMenu(container.querySelector('[data-clip-id="clip-1"]') as HTMLElement);

    expect(props.onSelect).toHaveBeenCalledWith('clip-1', 'V1');
    expect(screen.getByText('Delete Clip')).toBeInTheDocument();

    window.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it('shows existing shots and updates the menu from live props while it is open', () => {
    const existingShot = { id: 'shot-9', name: 'Shot 9' };
    const props = buildProps({
      existingShots: [existingShot],
    });
    const { container, rerender } = render(<ClipAction {...props} />);

    fireEvent.contextMenu(container.querySelector('[data-clip-id="clip-1"]') as HTMLElement);

    expect(screen.getByText('Shot 9')).toBeInTheDocument();
    expect(screen.getByTitle('Jump to shot')).toBeInTheDocument();
    expect(screen.getByTitle('Generate Video')).toBeInTheDocument();
    expect(screen.getByText('Create Shot')).toBeInTheDocument();

    rerender(<ClipAction {...props} existingShots={[]} />);

    expect(screen.queryByText('Shot 9')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Jump to shot')).not.toBeInTheDocument();
  });
});
