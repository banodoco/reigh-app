// @vitest-environment jsdom
import React, { forwardRef, useImperativeHandle } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoEditorShell } from '@/tools/video-editor/components/VideoEditorShell';

const useTimelineEditorDataMock = vi.fn();
const useTimelineEditorOpsMock = vi.fn();
const useTimelinePlaybackContextMock = vi.fn();
const useTimelineChromeContextMock = vi.fn();
const usePanesMock = vi.fn();
const useTimelineRealtimeMock = vi.fn();

vi.mock('@/tools/video-editor/contexts/TimelineEditorContext', async () => {
  const actual = await vi.importActual<typeof import('@/tools/video-editor/contexts/TimelineEditorContext')>(
    '@/tools/video-editor/contexts/TimelineEditorContext',
  );

  return {
    ...actual,
    useTimelineEditorData: () => useTimelineEditorDataMock(),
    useTimelineEditorOps: () => useTimelineEditorOpsMock(),
  };
});

vi.mock('@/tools/video-editor/contexts/TimelinePlaybackContext', async () => {
  const actual = await vi.importActual<typeof import('@/tools/video-editor/contexts/TimelinePlaybackContext')>(
    '@/tools/video-editor/contexts/TimelinePlaybackContext',
  );

  return {
    ...actual,
    useTimelinePlaybackContext: () => useTimelinePlaybackContextMock(),
  };
});

vi.mock('@/tools/video-editor/contexts/TimelineChromeContext', async () => {
  const actual = await vi.importActual<typeof import('@/tools/video-editor/contexts/TimelineChromeContext')>(
    '@/tools/video-editor/contexts/TimelineChromeContext',
  );

  return {
    ...actual,
    useTimelineChromeContext: () => useTimelineChromeContextMock(),
  };
});

vi.mock('@/shared/contexts/PanesContext', async () => {
  const actual = await vi.importActual<typeof import('@/shared/contexts/PanesContext')>(
    '@/shared/contexts/PanesContext',
  );

  return {
    ...actual,
    usePanes: () => usePanesMock(),
  };
});

vi.mock('@/tools/video-editor/hooks/useTimelineRealtime', () => ({
  useTimelineRealtime: () => useTimelineRealtimeMock(),
}));

vi.mock('@/tools/video-editor/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('@/tools/video-editor/hooks/usePerfDiagnostics', () => ({
  useRenderDiagnostic: vi.fn(),
  useEffectDiagnostic: () => vi.fn(),
}));

vi.mock('@/tools/video-editor/lib/perf-diagnostics', () => ({
  bootDiagnostics: vi.fn(),
  MemoryPressureDetector: {
    start: vi.fn(),
    stop: vi.fn(),
  },
}));

vi.mock('@/shared/lib/typedEvents', () => ({
  dispatchAppEvent: vi.fn(),
}));

vi.mock('@/tools/video-editor/components/AgentChat', () => ({
  AgentChat: () => <div data-testid="agent-chat" />,
}));

vi.mock('@/tools/video-editor/components/TimelineEditor/TimelineEditor', () => ({
  TimelineEditor: () => <div data-testid="timeline-editor" />,
}));

vi.mock('@/tools/video-editor/components/PropertiesPanel/PropertiesPanel', () => ({
  PropertiesPanel: () => <div data-testid="properties-panel" />,
}));

vi.mock('@/tools/video-editor/components/PreviewPanel/OverlayEditor', () => ({
  default: () => <div data-testid="overlay-editor" />,
}));

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, variant: _variant, size: _size, asChild: _asChild, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/components/ui/badge', () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock('@/shared/components/ui/slider', () => ({
  Slider: ({ value, onValueChange: _onValueChange, min: _min, max: _max, step: _step, ...props }: any) => (
    <div data-testid="slider" data-value={JSON.stringify(value)} {...props} />
  ),
}));

vi.mock('@/shared/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: any) => <>{children}</>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, ...props }: any) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: any) => <div>{children}</div>,
  DropdownMenuSeparator: () => <div data-testid="dropdown-separator" />,
}));

vi.mock('@/shared/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: any) => <>{children}</>,
  AlertDialogAction: ({ children, ...props }: any) => <button type="button" {...props}>{children}</button>,
  AlertDialogCancel: ({ children, ...props }: any) => <button type="button" {...props}>{children}</button>,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@remotion/player', () => ({
  Player: forwardRef(function MockPlayer(_props: any, ref) {
    const api = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      seekTo: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      toggle: vi.fn(),
      isPlaying: vi.fn(() => false),
    };

    useImperativeHandle(ref, () => api, []);

    return <div data-testid="mock-player" />;
  }),
}));

function renderShell(mode: 'compact' | 'full') {
  return render(
    <MemoryRouter
      initialEntries={['/tools/video-editor?timeline=timeline-1']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <VideoEditorShell mode={mode} timelineId="timeline-1" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  const selectedClipIds = new Set<string>();
  const previewRef = { current: null };
  const playerContainerRef = { current: null };

  useTimelineEditorDataMock.mockReturnValue({
    data: {
      rows: [],
      meta: {},
    },
    resolvedConfig: {
      output: {
        fps: 30,
        resolution: '1280x720',
      },
      clips: [
        {
          id: 'clip-1',
          at: 0,
          from: 0,
          to: 1,
        },
      ],
      registry: {},
    },
    selectedClipId: null,
    selectedClipIds,
    trackScaleMap: {},
    compositionSize: { width: 1280, height: 720 },
  });

  useTimelineEditorOpsMock.mockReturnValue({
    moveSelectedClipsToTrack: vi.fn(),
    handleToggleMuteClips: vi.fn(),
    handleSplitSelectedClip: vi.fn(),
    handleDeleteClips: vi.fn(),
    clearSelection: vi.fn(),
    selectClips: vi.fn(),
    setSelectedClipId: vi.fn(),
    onOverlayChange: vi.fn(),
    onDoubleClickAsset: vi.fn(),
  });

  useTimelinePlaybackContextMock.mockReturnValue({
    currentTime: 0,
    previewRef,
    playerContainerRef,
    onPreviewTimeUpdate: vi.fn(),
    formatTime: vi.fn(() => '0:00'),
  });

  useTimelineChromeContextMock.mockReturnValue({
    timelineName: 'Persistence Test',
    saveStatus: 'saved',
    isConflictExhausted: false,
    renderStatus: 'idle',
    renderLog: '',
    renderDirty: false,
    renderProgress: null,
    renderResultUrl: null,
    renderResultFilename: null,
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    checkpoints: [],
    jumpToCheckpoint: vi.fn(),
    createManualCheckpoint: vi.fn(),
    setScaleWidth: vi.fn(),
    handleAddTrack: vi.fn(),
    handleClearUnusedTracks: vi.fn(),
    unusedTrackCount: 0,
    handleAddText: vi.fn(),
    handleAddTextAt: vi.fn(),
    reloadFromServer: vi.fn(),
    retrySaveAfterConflict: vi.fn(),
    startRender: vi.fn(),
  });

  usePanesMock.mockReturnValue({
    isGenerationsPaneLocked: false,
    setIsGenerationsPaneLocked: vi.fn(),
  });

  useTimelineRealtimeMock.mockReturnValue({
    isOpen: false,
    setOpen: vi.fn(),
    keepLocalChanges: vi.fn(),
    discardAndReload: vi.fn(),
  });
});

describe('VideoEditorShell preview persistence', () => {
  it('keeps the same preview DOM node mounted across compact/full transitions', () => {
    const view = renderShell('compact');

    const initialNode = screen.getByTestId('mock-player');
    expect(screen.getAllByTestId('mock-player')).toHaveLength(1);
    expect(screen.queryByText('1280x720')).not.toBeInTheDocument();

    view.rerender(
      <MemoryRouter
        initialEntries={['/tools/video-editor?timeline=timeline-1']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <VideoEditorShell mode="full" timelineId="timeline-1" />
      </MemoryRouter>,
    );

    const sameNode = screen.getByTestId('mock-player');
    expect(screen.getAllByTestId('mock-player')).toHaveLength(1);
    expect(sameNode).toBe(initialNode);
    expect(screen.getByText('1280x720')).toBeInTheDocument();
  });
});
