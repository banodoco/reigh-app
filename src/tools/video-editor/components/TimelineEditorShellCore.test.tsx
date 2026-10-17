import { useKeyboardShortcuts } from '@/tools/video-editor/hooks/useKeyboardShortcuts.ts';
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import type { VideoEditorRenderContext } from '@/tools/video-editor/runtime/extensionSurface';

// ---------------------------------------------------------------------------
// Mutable slot renderer registry for fine-grained test control
// ---------------------------------------------------------------------------

type SlotRendererFn = (context: VideoEditorRenderContext) => ReactNode;

let __slotRenderers: Partial<Record<string, SlotRendererFn>> = {};
const __startRender = vi.fn();

function __setSlotRenderers(renderers: Partial<Record<string, SlotRendererFn>>) {
  __slotRenderers = { ...renderers };
}

function __clearSlotRenderers() {
  __slotRenderers = {};
}

/** Device class reported by the mocked timeline store; drives the shell layout branch. */
let __deviceClass: 'desktop' | 'tablet' | 'phone' = 'desktop';
let __selectedTrackId: string | null = null;
let __selectedDataItems: readonly { laneId: string; itemId: string }[] = [];
let __selectedClipIds = new Set<string>();
let __useActualTargetEquality = false;
let __editorPreferences: Record<string, any> = {
  selectedRightPanelId: 'host:properties',
  rightPanelLayoutSlotsByPanelId: {},
  showDataLanes: false,
};
/** Per-test overrides merged into the mocked chrome slice. */
let __chromeOverrides: Record<string, unknown> = {};
/** Interaction mode reported by the mocked timeline store. */
let __interactionMode: 'browse' | 'select' | 'move' | 'trim' | 'precision' = 'browse';
const __seek = vi.fn();
const __previewRef = { current: { togglePlayPause: vi.fn(), seek: __seek } };
let __playback = {
  currentTime: 0,
  previewRef: __previewRef,
  formatTime: (time: number) => `${time.toFixed(1)}s`,
};
const __playbackListeners = new Set<() => void>();
function __setPlaybackTime(currentTime: number) {
  __playback = { ...__playback, currentTime };
  __playbackListeners.forEach((listener) => listener());
}

/** Stable op spies, so tests can assert what a rendered control actually calls. */
const __editorOps = {
  applyEdit: vi.fn(),
  handleDeleteClips: vi.fn(),
  moveSelectedClipsToTrack: vi.fn(),
  handleToggleMuteClips: vi.fn(),
  handleSplitSelectedClip: vi.fn(),
  clearSelection: vi.fn(),
  setInspectorTarget: vi.fn(),
  setContextTarget: vi.fn(),
  setPrecisionEnabled: vi.fn(),
  setInteractionMode: vi.fn(),
  setSelectedRightPanelId: vi.fn(),
  setRightPanelLayoutSlot: vi.fn(),
  setShowDataLanes: vi.fn(),
};

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const __liveInspectorTarget = { value: { kind: 'timeline' as const } };

vi.mock('@/tools/video-editor/hooks/timelineStore.ts', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return ({
    useTimelineEditorData: () => ({
      dataRef: { current: null },
      data: null,
      selectedClipIds: __selectedClipIds,
      selectedDataItems: __selectedDataItems,
      selectedTrackId: __selectedTrackId,
      preferences: __editorPreferences,
      resolvedConfig: null,
      deviceClass: __deviceClass,
      precisionEnabled: false,
      interactionMode: __interactionMode,
      gestureOwner: null,
      // Live store value; tests mutate `__liveInspectorTarget.value` to prove
      // the shell's snap-back guard (groken LIVE-1).
      get inspectorTarget() {
        return __liveInspectorTarget.value;
      },
    }),
    useTimelineEditorOps: () => __editorOps,
    useTimelineChromeContext: () => ({
      saveStatus: 'saved' as const,
      isConflictExhausted: false,
      retrySaveAfterConflict: vi.fn(),
      reloadFromServer: vi.fn(),
      recoveryDraft: null,
      retryRecoveredDraft: vi.fn(),
      discardRecoveredDraft: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: false,
      canRedo: false,
      checkpoints: [],
      jumpToCheckpoint: vi.fn(),
      createManualCheckpoint: vi.fn(),
      timelineName: 'Test Timeline',
      setScaleWidth: vi.fn(),
      startRender: __startRender,
      renderStatus: 'idle' as const,
      renderProgress: null,
      renderResultUrl: null,
      renderResultFilename: null,
      renderDirty: false,
      loadError: null,
      retryLoad: vi.fn(),
      ...__chromeOverrides,
    }),
    useTimelinePlaybackSelector: (selector: (playback: typeof __playback) => unknown) => {
      return React.useSyncExternalStore(
        (listener: () => void) => {
          __playbackListeners.add(listener);
          return () => __playbackListeners.delete(listener);
        },
        () => selector(__playback),
        () => selector(__playback),
      );
    },
    useTimelineStoreApi: () => ({ getState: () => ({ playback: __playback }) }),
    useProposalRuntimeFromStoreSafe: () => null,
    useProposalImportDiagnosticsFromStoreSafe: () => null,
  });
});

vi.mock('@/tools/video-editor/components/ProposalPanel/ProposalPanel.tsx', () => ({
  ProposalPanel: ({ proposalRuntime, proposalImportDiagnostics }: any) =>
    proposalRuntime
      ? <div data-testid="proposal-panel">ProposalPanel</div>
      : null,
}));

vi.mock('@/tools/video-editor/hooks/useKeyboardShortcuts.ts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('@/tools/video-editor/hooks/useTimelineRealtime.ts', () => ({
  useTimelineRealtime: () => ({
    isOpen: false,
    setOpen: vi.fn(),
    keepLocalChanges: vi.fn(),
    discardAndReload: vi.fn(),
  }),
}));

vi.mock('@/tools/video-editor/hooks/useEditorSync.ts', () => ({
  useEditorSync: () => ({
    syncState: 'idle' as const,
    syncError: null,
    isSyncAvailable: false,
    performSync: vi.fn(),
    lastSyncResult: null,
  }),
}));

vi.mock('@/tools/video-editor/hooks/usePerfDiagnostics.ts', () => ({
  useRenderDiagnostic: vi.fn(),
}));

vi.mock('@/tools/video-editor/components/CommandPalette/CommandPalette.tsx', () => ({
  CommandPalette: ({ open }: { open: boolean }) =>
    open ? <div data-testid="command-palette">Command Palette</div> : null,
}));

vi.mock('@/tools/video-editor/lib/perf-diagnostics.ts', () => ({
  bootDiagnostics: vi.fn(),
  MemoryPressureDetector: { start: vi.fn(), stop: vi.fn() },
}));

let __exportExtensions: any = { slots: {}, dialogHost: { dialogs: [] }, registry: { panels: [], inspectorSections: [] }, outputFormats: [] };
let __assetPanels: any[] = [];

function __setExportExtensions(extensions: any) {
  __exportExtensions = {
    slots: {},
    dialogHost: { dialogs: [] },
    registry: { panels: [], inspectorSections: [] },
    outputFormats: [],
    ...extensions,
  };
}

function __clearExportExtensions() {
  __exportExtensions = { slots: {}, dialogHost: { dialogs: [] }, registry: { panels: [], inspectorSections: [] }, outputFormats: [] };
  __assetPanels = [];
}

vi.mock('@/tools/video-editor/runtime/useVideoEditorRenderContext.ts', () => ({
  useVideoEditorSlotRenderers: () => __slotRenderers,
  useVideoEditorRenderContext: () => ({
    provider: {} as any,
    timelineId: 'test-timeline',
    timelineName: 'Test Timeline',
    userId: 'user-1',
    extensions: __exportExtensions,
    data: {} as any,
    ops: {} as any,
    chrome: {} as any,
    playback: {} as any,
  }),
  useVideoEditorAssetPanels: () => __assetPanels,
  useVideoEditorDialogDescriptors: () => [],
  useVideoEditorPanelRegistry: () => ({ panels: [], inspectorSections: [] }),
  useResolvedVideoEditorPanelRegistry: () => ({
    assetPanels: [],
    inspectorSections: { all: [], beforeDefault: [], afterDefault: [] },
  }),
  useVideoEditorInspectorSections: () => [],
}));

vi.mock('@/tools/video-editor/components/PreviewPanel/PreviewPanel.tsx', () => ({
  PreviewPanel: () => <div data-testid="preview-panel">Preview</div>,
  default: () => <div data-testid="preview-panel">Preview</div>,
}));

vi.mock('@/tools/video-editor/components/PreviewPanel/useVideoEditorPreviewSurface.tsx', () => ({
  useVideoEditorPreviewSurface: () => ({
    slotRef: { current: null },
    portal: <div data-testid="preview-portal">Preview portal</div>,
  }),
}));

vi.mock('@/tools/video-editor/components/PropertiesPanel/PropertiesPanel.tsx', () => ({
  PropertiesPanel: () => <div data-testid="properties-panel">Properties</div>,
}));

vi.mock('@/tools/video-editor/components/PropertiesPanel/VideoEditorAssetPanelSurface.tsx', () => ({
  VideoEditorAssetPanelSurface: ({ activePanelKey }: { activePanelKey?: string | null }) =>
    activePanelKey ? <div data-testid="asset-panel-surface">Asset Panel</div> : null,
}));

vi.mock('@/tools/video-editor/components/SequenceCreator/SequenceCreatorPanel.tsx', () => ({
  SequenceCreatorPanel: () => null,
}));

/** When true the mocked timeline throws during render, standing in for one
 *  malformed clip taking `ClipAction`/`TrackListRenderer` down. */
let __timelineThrows = false;

vi.mock('@/tools/video-editor/components/TimelineEditor/TimelineEditor.tsx', () => ({
  TimelineEditor: () => {
    if (__timelineThrows) {
      throw new Error('malformed clip: hold is NaN');
    }
    return <div data-testid="timeline-editor">Timeline Editor</div>;
  },
}));

vi.mock('@/tools/video-editor/lib/config-utils.ts', () => ({
  getTimelineDurationInFrames: () => 300,
  parseResolution: () => ({ width: 1920, height: 1080 }),
}));

vi.mock('@/tools/video-editor/lib/keyboard-delete.ts', () => ({
  buildKeyboardDeleteMutation: () => null,
}));

vi.mock('@/tools/video-editor/lib/mobile-interaction-model.ts', async () => {
  const actual = await vi.importActual<typeof import('@/tools/video-editor/lib/mobile-interaction-model.ts')>(
    '@/tools/video-editor/lib/mobile-interaction-model.ts',
  );
  return {
    ...actual,
    areTimelineInteractionTargetsEqual: (...args: Parameters<typeof actual.areTimelineInteractionTargetsEqual>) => (
      __useActualTargetEquality ? actual.areTimelineInteractionTargetsEqual(...args) : true
    ),
  };
});

vi.mock('@/shared/lib/typedEvents.ts', () => ({
  dispatchAppEvent: vi.fn(),
}));

vi.mock('@/shared/state/selectionStore.ts', () => ({
  editorReplaceTimelineSelection: vi.fn(),
  activateTimelineClipData: vi.fn(),
}));


let __runtimeContext: any = null;

const __defaultRuntimeContext = {
  timelineEditability: {
    check: () => ({ allowed: true }),
  },
};

function __setRuntimeContext(ctx: any) {
  __runtimeContext = ctx;
}

function __clearRuntimeContext() {
  // TimelineEditorShellCore requires the host runtime for editability checks.
  // Keep the shell tests focused on their own surfaces while supplying the
  // minimal host-owned context required by that contract.
  __runtimeContext = __defaultRuntimeContext;
}

vi.mock('@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx', () => ({
  useOptionalVideoEditorRuntime: () => __runtimeContext,
  useVideoEditorRuntime: () => {
    if (!__runtimeContext) throw new Error('No runtime context');
    return __runtimeContext;
  },
  VideoEditorRuntimeContext: {
    Provider: ({ children }: any) => children,
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { TimelineEditorShellCore } from '@/tools/video-editor/components/TimelineEditorShellCore';
import { useRenderDiagnostic } from '@/tools/video-editor/hooks/usePerfDiagnostics.ts';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TimelineEditorShellCore surface slots', () => {
  beforeEach(() => {
    __liveInspectorTarget.value = { kind: 'timeline' as const };
    __selectedTrackId = null;
    __selectedDataItems = [];
    __selectedClipIds = new Set();
    __useActualTargetEquality = false;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    __playback = { ...__playback, currentTime: 0 };
    __playbackListeners.clear();
    __clearSlotRenderers();
    __clearRuntimeContext();
    __deviceClass = 'desktop';
    __assetPanels = [];
    __editorPreferences = {
      selectedRightPanelId: 'host:properties',
      rightPanelLayoutSlotsByPanelId: {},
      showDataLanes: false,
    };
  });

  it('keeps playhead updates in time leaves and seeks from the latest time', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" />);
    vi.mocked(useRenderDiagnostic).mockClear();

    act(() => {
      for (let step = 1; step <= 5; step += 1) __setPlaybackTime(step * 0.5);
    });

    expect(useRenderDiagnostic).not.toHaveBeenCalled();
    expect(screen.getByText('2.5s')).toBeTruthy();

    const options = vi.mocked(useKeyboardShortcuts).mock.calls.at(-1)![0];
    options.seekRelative(1);
    expect(__seek).toHaveBeenCalledWith(3.5);
  });

  // ---- Shell grid row alignment ---------------------------------------------
  it('leaves the editor outer shell transparent with readable bounded controls', () => {
    const {container} = render(<TimelineEditorShellCore timelineId="test-timeline" />);
    expect(container.firstElementChild).toHaveClass('bg-transparent', 'text-foreground');
    expect(container.firstElementChild).not.toHaveClass('bg-background');
    expect(container.querySelector('.bg-card\\/95')).not.toBeNull();
  });
  it('does not reserve a grid row for inactive extension activity', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    const grid = document.querySelector('main.grid') as HTMLElement | null;
    expect(grid).toBeTruthy();

    const rows = (grid?.style.gridTemplateRows ?? '').trim().split(/\s+/).filter(Boolean);
    // preview, divider/toolbar, timeline
    expect(rows).toHaveLength(3);

    // Every grid child except the row-spanning right panel stacks in column 1.
    // An undeclared row would push the timeline into an implicit `auto` track,
    // collapsing the preview's `1fr` to zero height.
    const stacked = Array.from(grid?.children ?? []).filter(
      (child) => child.getAttribute('data-video-editor-shell-region') !== 'rightPanel',
    );
    expect(stacked).toHaveLength(rows.length);
  });

  // ---- Shared preview portal ownership --------------------------------------
  it('does not mount the shared preview portal next to PreviewPanel on phone', () => {
    __deviceClass = 'phone';
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    // PreviewPanel mounts the portal itself, so the shell must not mount a second one.
    expect(screen.getAllByTestId('preview-panel')).toHaveLength(1);
    expect(screen.queryByTestId('preview-portal')).toBeNull();
  });

  it('mounts the shared preview portal for the condensed layout, which has no PreviewPanel', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" forceCondensed />);

    expect(screen.queryByTestId('preview-panel')).toBeNull();
    expect(screen.getAllByTestId('preview-portal')).toHaveLength(1);
  });

  it('keeps one preview owner when switching between condensed and desktop layouts', () => {
    const { rerender } = render(<TimelineEditorShellCore timelineId="test-timeline" forceCondensed />);
    expect(screen.getAllByTestId('preview-portal')).toHaveLength(1);
    expect(screen.queryByTestId('preview-panel')).toBeNull();

    rerender(<TimelineEditorShellCore timelineId="test-timeline" />);
    expect(screen.queryByTestId('preview-portal')).toBeNull();
    expect(screen.getAllByTestId('preview-panel')).toHaveLength(1);

    rerender(<TimelineEditorShellCore timelineId="test-timeline" forceCondensed />);
    expect(screen.getAllByTestId('preview-portal')).toHaveLength(1);
    expect(screen.queryByTestId('preview-panel')).toBeNull();
  });

  // ---- Baseline rendering ---------------------------------------------------
  it('renders the shell without crashing with default props', () => {
    const { container } = render(
      <TimelineEditorShellCore timelineId="test-timeline" />,
    );
    expect(container.querySelector('[data-video-editor-shell-region]')).toBeTruthy();
  });

  it('renders the timeline editor component', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" />);
    expect(screen.getByTestId('timeline-editor')).toBeTruthy();
  });

  // ---- navigationControls placement ----------------------------------------
  it('renders navigationControls in the editor chrome above the time', () => {
    render(
      <TimelineEditorShellCore
        timelineId="test-timeline"
        onNavigateHome={() => {}}
        navigationControls={<div data-testid="nav-controls">Nav Controls</div>}
      />,
    );

    const home = screen.getByRole('button', { name: 'Go home' });
    const controls = screen.getByTestId('video-editor-editor-navigation-controls');
    expect(controls).toHaveTextContent('Nav Controls');
    expect(home.closest('header')).not.toContainElement(controls);
  });

  it('keeps the same shared header when the editor is condensed', () => {
    // `isOnEditorPage` + `isEditorPaneLocked` drive the condensed layout.
    render(
      <TimelineEditorShellCore
        timelineId="test-timeline"
        isOnEditorPage
        isEditorPaneLocked
        onNavigateHome={() => {}}
        navigationControls={<div data-testid="nav-controls">Nav Controls</div>}
      />,
    );

    const home = screen.getByRole('button', { name: 'Go home' });
    const controls = screen.getByTestId('video-editor-editor-navigation-controls');
    expect(controls).toHaveTextContent('Nav Controls');
    expect(home.closest('header')).not.toContainElement(controls);
    expect(screen.queryByTestId('toolbar-navigation-controls')).toBeNull();
  });

  it('renders project and timeline navigation in their separate chrome locations exactly once', () => {
    render(
      <TimelineEditorShellCore
        timelineId="test-timeline"
        headerNavigationControls={<div data-testid="project-navigation">Project</div>}
        previewNavigationControls={<div data-testid="timeline-navigation">Timeline</div>}
      />,
    );

    const headerProject = screen.getByTestId('project-navigation');
    const previewTimeline = screen.getByTestId('timeline-navigation');
    expect(headerProject.closest('header')).toBeTruthy();
    expect(previewTimeline.closest('header')).toBeNull();
    expect(screen.getAllByTestId('project-navigation')).toHaveLength(1);
    expect(screen.getAllByTestId('timeline-navigation')).toHaveLength(1);
  });

  it('keeps legacy navigationControls preview-only while honoring explicit header controls', () => {
    render(
      <TimelineEditorShellCore
        timelineId="test-timeline"
        headerNavigationControls={<div data-testid="project-navigation">Project</div>}
        navigationControls={<div data-testid="legacy-navigation">Legacy</div>}
      />,
    );

    expect(screen.getByTestId('project-navigation').closest('header')).toBeTruthy();
    expect(screen.getByTestId('legacy-navigation').closest('header')).toBeNull();
    expect(screen.getAllByTestId('legacy-navigation')).toHaveLength(1);
  });

  it('opens the host command palette for reserved CtrlOrCmd+Shift+P', async () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    fireEvent.keyDown(window, {
      key: 'p',
      ctrlKey: true,
      shiftKey: true,
    });

    await waitFor(() => expect(screen.getByTestId('command-palette')).toBeTruthy());
  });

  it('renders the preview panel component', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" />);
    expect(screen.getByTestId('preview-panel')).toBeTruthy();
  });

  it('renders the properties panel component', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" />);
    expect(screen.getByTestId('properties-panel')).toBeTruthy();
  });

  it('lets the boot layer reveal a first mount, and fades in on its own otherwise', () => {
    const boot = document.createElement('div');
    boot.id = 'boot';
    document.body.append(boot);
    const first = render(<TimelineEditorShellCore timelineId="test-timeline" />);
    expect(first.container.querySelector('main')?.className).not.toContain('animate-in');
    first.unmount();
    boot.remove();

    const { container } = render(<TimelineEditorShellCore timelineId="test-timeline" />);
    expect(container.querySelector('main')?.className).toContain('animate-in');
  });

  // ---- Reserved slots stay hidden until an extension contributes -------------
  it('does not render unclaimed codePanel, writingPanel, or stagePanel slots', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    const codeCanary = document.querySelector('[data-video-editor-slot="codePanel"]');
    const writingCanary = document.querySelector('[data-video-editor-slot="writingPanel"]');
    const stageCanary = document.querySelector('[data-video-editor-slot="stagePanel"]');

    expect(codeCanary).toBeNull();
    expect(writingCanary).toBeNull();
    expect(stageCanary).toBeNull();
  });

  it('does not render an inert reserved-slot footer when no extension contributes', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(document.querySelector('[data-video-editor-shell-region="reservedSlots"]')).toBeNull();
  });

  // ---- Shell region data attributes -----------------------------------------
  it('renders host-owned shell regions with correct data attributes', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    const rightPanel = document.querySelector('[data-video-editor-shell-region="rightPanel"]');
    const reservedSlots = document.querySelector('[data-video-editor-shell-region="reservedSlots"]');

    expect(rightPanel).toBeTruthy();
    expect(reservedSlots).toBeNull();
  });

  it('does not render leftPanel region when no leftPanel slot renderer is registered', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    const leftPanel = document.querySelector('[data-video-editor-shell-region="leftPanel"]');
    expect(leftPanel).toBeNull();
  });

  // ---- Static surface slots do NOT render when no renderer and not reserved --
  it('does not render leftPanel slot when no renderer is registered', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    const leftPanelSlot = document.querySelector('[data-video-editor-slot="leftPanel"]');
    expect(leftPanelSlot).toBeNull();
  });

  it('does not render rightPanel slot when no renderer is registered (falls through to default content)', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    const rightPanelSlot = document.querySelector('[data-video-editor-slot="rightPanel"]');
    expect(rightPanelSlot).toBeNull();
  });

  it('does not mount the removed Assets panel surface', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(screen.queryByTestId('asset-panel-surface')).toBeNull();
    expect(screen.getByTestId('properties-panel')).toBeTruthy();
  });

  // ---- Desktop containment is coherent ---------------------------------------
  it('renders the desktop layout grid with correct columns when no left panel', () => {
    const { container } = render(<TimelineEditorShellCore timelineId="test-timeline" />);

    const main = container.querySelector('main');
    expect(main).toBeTruthy();
    const style = main?.getAttribute('style') ?? '';
    expect(style).toContain('min(420px, 32vw, calc(100vw - 24px))');
    const dock = document.querySelector('[data-testid="video-editor-right-panel-dock"]') as HTMLElement;
    expect(dock.getAttribute('data-layout')).toBe('dock');
    expect(dock.style.gridColumn).toBe('2');
    expect(dock.style.gridRow).toBe('1 / -1');
  });

  it('reserves an upper-right grid cell for Compact beside video and above the timeline', () => {
    __editorPreferences = {
      selectedRightPanelId: 'host:properties',
      rightPanelLayoutSlotsByPanelId: { 'host:properties': 'compact' },
      showDataLanes: false,
    };
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    const main = document.querySelector('main') as HTMLElement;
    expect(main.style.gridTemplateColumns).toBe('minmax(0,1fr) minmax(0, calc(min(420px, 32vw, calc(100vw - 24px)) + 12px))');
    const dock = document.querySelector('[data-testid="video-editor-right-panel-dock"]') as HTMLElement;
    expect(dock.getAttribute('data-layout')).toBe('compact');
    expect(dock).toHaveAttribute('data-placement', 'upper-right-grid');
    expect(dock.className).not.toContain('absolute');
    expect(dock.style.gridColumn).toBe('2');
    expect(dock.style.gridRow).toBe('1 / -1');
    const preview = document.querySelector('[data-video-editor-shell-region="preview"]') as HTMLElement;
    const timeline = document.querySelector('[data-video-editor-shell-region="timeline"]') as HTMLElement;
    expect(preview.style.gridColumn).toBe('1');
    expect(timeline.style.gridColumn).toBe('1 / span 2');
      expect(timeline.style.gridRow).toBe('3');
    expect(dock.getAttribute('data-video-editor-shell-region')).toBe('rightPanel');
  });

  it.each([
    { selectedRightPanelId: 'host:properties', shared: 'dock' as const, legacy: 'compact' as const, expected: 'full-height-grid' },
    { selectedRightPanelId: 'haus.astrid.transcript-lane:transcript-lane-panel', shared: 'compact' as const, legacy: 'dock' as const, expected: 'upper-right-grid' },
  ])('uses the shared display mode for $selectedRightPanelId even when legacy panel slots disagree', ({ selectedRightPanelId, shared, legacy, expected }) => {
    const panelId = 'haus.astrid.transcript-lane:transcript-lane-panel';
    __assetPanels = [{ id: 'transcript-lane-panel', extensionId: 'haus.astrid.transcript-lane', label: 'Transcript', placement: 'asset-panel', render: () => null }];
    __editorPreferences = {
      selectedRightPanelId,
      rightPanelLayoutSlotsByPanelId: { 'host:properties': shared, [panelId]: legacy },
      showDataLanes: false,
    };
    const { container } = render(<TimelineEditorShellCore timelineId="test-timeline" />);
    const main = container.querySelector('main') as HTMLElement;
    const dock = document.querySelector('[data-testid="video-editor-right-panel-dock"]') as HTMLElement;
    expect(dock).toHaveAttribute('data-placement', expected);
    expect(main.style.gridTemplateColumns).toContain('min(420px, 32vw, calc(100vw - 24px))');
    expect(dock.style.width).toBe('calc(100% - 12px)');
    expect(dock.style.marginInlineStart).toBe('12px');
    if (shared === 'compact') {
      expect(main.style.gridTemplateColumns).toBe('minmax(0,1fr) minmax(0, calc(min(420px, 32vw, calc(100vw - 24px)) + 12px))');
      expect(dock.style.gridRow).toBe('1 / -1');
    } else {
      expect(dock.style.gridRow).toBe('1 / -1');
    }
  });

  it('uses measured pane heights without moving the dock or timeline between grid cells', () => {
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { x: 0, y: 0, top: 0, left: 0, right: 420, bottom: 248, width: 420,
        height: this.dataset.videoEditorShellRegion === 'preview' ? 248 : 700, toJSON() {} };
    });
    const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
    try {
      __editorPreferences = { selectedRightPanelId: 'host:properties', rightPanelLayoutSlotsByPanelId: { 'host:properties': 'compact' }, showDataLanes: false };
      const { rerender } = render(<TimelineEditorShellCore timelineId="test-timeline" />);
      const dock = screen.getByTestId('video-editor-right-panel-dock');
      const timeline = document.querySelector<HTMLElement>('[data-video-editor-shell-region="timeline"]')!;
      expect(dock.style.height).toBe('248px');
      expect(dock.style.gridRow).toBe('1 / -1');
      expect(timeline.style.gridColumn).toBe('1 / span 2');
      expect(timeline.style.gridRow).toBe('3');
      expect(timeline.style.marginInlineEnd).toBe('0px');
      __editorPreferences = { ...__editorPreferences, rightPanelLayoutSlotsByPanelId: { 'host:properties': 'dock' } };
      rerender(<TimelineEditorShellCore timelineId="test-timeline" showHeader={false} />);
      expect(dock.style.height).toBe('700px');
      expect(dock.style.gridRow).toBe('1 / -1');
      expect(timeline.style.gridColumn).toBe('1 / span 2');
      expect(timeline.style.gridRow).toBe('3');
      // JSDOM normalizes nested min()/calc() differently from the browser.
      expect(timeline.style.marginInlineEnd).not.toBe('0px');
      expect(timeline.style.marginInlineEnd).toContain('12px');
    } finally { bounds.mockRestore(); height.mockRestore(); }
  });

  it('keeps interpolable pane columns and the same mounted dock through all display modes', () => {
    __editorPreferences = { selectedRightPanelId: 'host:properties', rightPanelLayoutSlotsByPanelId: { 'host:properties': 'compact' }, showDataLanes: false };
    const { rerender } = render(<TimelineEditorShellCore timelineId="test-timeline" />);
    const dock = screen.getByTestId('video-editor-right-panel-dock');
    const inspector = screen.getByTestId('properties-panel');
    const main = document.querySelector('main') as HTMLElement;
    expect(main).toHaveClass('video-editor-panel-grid', 'duration-200', 'motion-reduce:transition-none');
    expect(dock).toHaveClass('video-editor-right-panel-motion');
    expect(main.style.columnGap).toBe('0px');
    const compactColumns = main.style.gridTemplateColumns;
    __editorPreferences = { ...__editorPreferences, selectedRightPanelId: null };
    rerender(<TimelineEditorShellCore timelineId="test-timeline" showHeader={false} />);
    expect(main.style.gridTemplateColumns).toBe('minmax(0,1fr) minmax(0, 0px)');
    expect(screen.getByTestId('video-editor-right-panel-dock')).toBe(dock);
    expect(inspector).toBeInTheDocument();
    expect(dock).toHaveAttribute('aria-hidden', 'true');
    expect(dock).not.toHaveAttribute('hidden');
    expect(document.querySelector<HTMLElement>('[data-video-editor-shell-region="timeline"]')?.style.gridColumn).toBe('1 / span 2');
    __editorPreferences = { ...__editorPreferences, selectedRightPanelId: 'host:properties' };
    rerender(<TimelineEditorShellCore timelineId="test-timeline" />);
    expect(main.style.gridTemplateColumns).toBe(compactColumns);
    __editorPreferences = { ...__editorPreferences, rightPanelLayoutSlotsByPanelId: { 'host:properties': 'dock' } };
    rerender(<TimelineEditorShellCore timelineId="test-timeline" showHeader={false} />);
    expect(screen.getByTestId('video-editor-right-panel-dock')).toBe(dock);
    expect(dock).toHaveAttribute('data-layout', 'dock');
    expect(dock.style.gridRow).toBe('1 / -1');
    expect(main.style.gridTemplateColumns).toBe(compactColumns);
  });
  it('shows only one keyboard reachable pane icon immediately after Render when closed', async () => {
    const user = userEvent.setup();
    __editorPreferences = { selectedRightPanelId: null, rightPanelLayoutSlotsByPanelId: {}, showDataLanes: false };
    render(<TimelineEditorShellCore timelineId="test-timeline" />);
    const control = screen.getByRole('button', { name: 'Panel display' });
    expect(screen.getAllByRole('button', { name: 'Panel display' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Render' }).nextElementSibling).toBe(control);
    expect(control).toHaveClass('video-editor-panel-reopen-motion');
    expect(screen.queryByRole('tablist', { name: 'Right panel surface' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Active extension' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Manage extensions' })).toBeNull();
    expect(screen.getByTestId('video-editor-right-panel-dock')).toHaveAttribute('aria-hidden', 'true');
    control.focus();
    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('menuitemradio', { name: 'Full-height' }));
    expect(__editorOps.setSelectedRightPanelId).toHaveBeenCalledWith('host:properties');
    expect(__editorOps.setRightPanelLayoutSlot).toHaveBeenCalledWith('host:properties', 'dock');
  });
  it.each(['desktop', 'phone'] as const)('hides legacy Inspector controls when the pane is closed on %s', (device) => {
    __deviceClass = device;
    __editorPreferences = { selectedRightPanelId: null, rightPanelLayoutSlotsByPanelId: {}, showDataLanes: false };
    render(<TimelineEditorShellCore timelineId="test-timeline" forceCondensed={device === 'desktop'} />);
    expect(screen.queryByRole('button', { name: /Inspector|Properties/ })).toBeNull();
    expect(screen.queryByRole('tablist', { name: 'Right panel surface' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Panel display' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Render' }).nextElementSibling).toBe(screen.getByRole('button', { name: 'Panel display' }));
  });
  it('keeps the retained extension dock across condensed and desktop layouts', () => {
    const panelId = 'haus.astrid.transcript-lane:transcript-lane-panel';
    __assetPanels = [{ id: 'transcript-lane-panel', extensionId: 'haus.astrid.transcript-lane', label: 'Transcript', placement: 'asset-panel', render: () => null }];
    __editorPreferences = { selectedRightPanelId: panelId, rightPanelLayoutSlotsByPanelId: { [panelId]: 'compact' }, showDataLanes: false };
    const { rerender } = render(<TimelineEditorShellCore timelineId="test-timeline" forceCondensed />);
    const dock = screen.getByRole('region', { name: 'Video editor right panel' });
    expect(dock).toHaveAttribute('data-responsive', 'true'); expect(dock).toHaveAttribute('data-open', 'true');
    expect(screen.getByRole('button', { name: 'Active extension' })).toHaveTextContent('Active · Transcript');
    rerender(<TimelineEditorShellCore timelineId="test-timeline" />);
    expect(screen.getByRole('region', { name: 'Video editor right panel' })).toBe(dock);
    expect(dock).toHaveAttribute('data-responsive', 'false');
  });
  it('bounds the compact shell and leaves only a reopen icon on a 320px phone', async () => {
    const user = userEvent.setup();
    const originalWidth = window.innerWidth; Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 }); __deviceClass = 'phone';
    __editorPreferences = { selectedRightPanelId: 'host:properties', rightPanelLayoutSlotsByPanelId: { 'host:properties': 'compact' }, showDataLanes: false };
    try {
      const { rerender } = render(<TimelineEditorShellCore timelineId="test-timeline" />);
      const dock = screen.getByRole('region', { name: 'Video editor right panel' }) as HTMLElement;
      expect(dock).toHaveAttribute('data-responsive', 'true'); expect(dock.style.width).toBe('calc(100vw - 24px)'); expect(dock.style.maxWidth).toBe('420px');
      __editorPreferences = { ...__editorPreferences, selectedRightPanelId: null }; rerender(<TimelineEditorShellCore timelineId="test-timeline" showHeader={false} />);
      expect(dock).toHaveAttribute('data-open', 'false'); expect(screen.getByRole('button', { name: 'Panel display' })).toBeTruthy();
      expect(screen.queryByRole('tab', { name: 'Inspector' })).toBeNull();
      screen.getByRole('button', { name: 'Panel display' }).focus(); await user.keyboard('{ArrowDown}');
      await user.click(screen.getByRole('menuitemradio', { name: 'Compact' }));
      expect(__editorOps.setSelectedRightPanelId).toHaveBeenCalledWith('host:properties');
    } finally { Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth }); }
  });
  it('keeps Inspector selected when a new admitted extension becomes available', () => {
    __assetPanels = [{ id: 'transcript-lane-panel', extensionId: 'haus.astrid.transcript-lane', label: 'Transcript', placement: 'asset-panel', render: () => null }];
    render(<TimelineEditorShellCore timelineId="test-timeline" />);
    expect(screen.getByRole('tab', { name: 'Inspector' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('properties-panel')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Active extension' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Extensions' })); expect(__editorOps.setSelectedRightPanelId).toHaveBeenCalledWith('haus.astrid.transcript-lane:transcript-lane-panel');
  });

  // ---- Force condensed mode also stays clean -------------------------------
  it('does not render reserved placeholders in condensed mode', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" forceCondensed />);

    const codePlaceholder = document.querySelector('[data-video-editor-slot="codePanel"]');
    expect(codePlaceholder).toBeNull();
  });
});

describe('TimelineEditorShellCore with registered slot renderers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearSlotRenderers();
  });

  it('renders a registered leftPanel slot renderer in the left panel region', () => {
    const leftPanelRenderer = vi.fn(() => <div data-testid="left-panel-content">Left Panel Content</div>);
    __setSlotRenderers({ leftPanel: leftPanelRenderer });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    const leftPanelRegion = document.querySelector('[data-video-editor-shell-region="leftPanel"]');
    expect(leftPanelRegion).toBeTruthy();
    expect(screen.getByTestId('left-panel-content')).toBeTruthy();
    const dock = document.querySelector('[data-testid="video-editor-right-panel-dock"]') as HTMLElement;
    expect(dock.style.gridColumn).toBe('3');
    expect(leftPanelRenderer).toHaveBeenCalled();
  });

  it('renders a registered rightPanel slot renderer instead of default properties panel', () => {
    const rightPanelRenderer = vi.fn(() => <div data-testid="right-panel-content">Right Panel Content</div>);
    __setSlotRenderers({ rightPanel: rightPanelRenderer });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(screen.getByTestId('right-panel-content')).toBeTruthy();
    expect(screen.queryByTestId('properties-panel')).toBeNull();
    expect(rightPanelRenderer).toHaveBeenCalled();
  });

  it('renders a registered dialogs slot renderer', () => {
    const dialogsRenderer = vi.fn(() => <div data-testid="dialogs-content">Dialog Content</div>);
    __setSlotRenderers({ dialogs: dialogsRenderer });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(screen.getByTestId('dialogs-content')).toBeTruthy();
    expect(dialogsRenderer).toHaveBeenCalled();
  });

  it('renders a registered header slot renderer wrapped in error boundary context', () => {
    const headerRenderer = vi.fn(() => <div data-testid="header-content">Header</div>);
    __setSlotRenderers({ header: headerRenderer });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(screen.getByTestId('header-content')).toBeTruthy();
    expect(headerRenderer).toHaveBeenCalled();
  });

  it('replaces reserved placeholder with registered renderer for reserved slots', () => {
    const codePanelRenderer = vi.fn(() => <div data-testid="code-panel-content">Code Panel Content</div>);
    __setSlotRenderers({ codePanel: codePanelRenderer });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    // Should render the actual content, not the placeholder
    expect(screen.getByTestId('code-panel-content')).toBeTruthy();
    // The placeholder should NOT be rendered for codePanel when a renderer is registered
    expect(document.querySelector('[data-video-editor-slot-inert="true"][data-video-editor-slot="codePanel"]')).toBeNull();
    expect(codePanelRenderer).toHaveBeenCalled();
  });

  it('renders desktop layout with leftPanel column when leftPanel renderer registered', () => {
    const leftPanelRenderer = vi.fn(() => <div data-testid="left-panel-content">Left</div>);
    __setSlotRenderers({ leftPanel: leftPanelRenderer });

    const { container } = render(<TimelineEditorShellCore timelineId="test-timeline" />);

    const main = container.querySelector('main');
    const style = main?.getAttribute('style') ?? '';
    // When leftPanel is registered, grid columns should include an auto column for it
    expect(style).toContain('auto');
    expect(style).toContain('minmax(0,1fr)');
    expect(style).toContain('min(420px');
  });


// ---------------------------------------------------------------------------
// M6: Export dropdown UI — compile-only formats enabled, render-dependent
// formats disabled with diagnostics, Render button behavior unchanged
// ---------------------------------------------------------------------------

describe('TimelineEditorShellCore — M6 export dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearSlotRenderers();
    __clearExportExtensions();
  });

  // ---- Export dropdown visibility -----------------------------------------

  it('renders Export dropdown when compile-only output formats are registered', () => {
    __setExportExtensions({
      outputFormats: [
        { id: 'fmt-json', extensionId: 'ext-a', label: 'Metadata JSON', requiresRender: false, outputExtension: 'json', disabled: false },
      ],
    });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(screen.getByText('Export')).toBeTruthy();
  });

  it('renders Export dropdown when render-dependent formats are registered', () => {
    __setExportExtensions({
      outputFormats: [
        { id: 'fmt-mp4', extensionId: 'ext-b', label: 'MP4 Video', requiresRender: true, outputExtension: 'mp4', disabled: false },
      ],
    });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(screen.getByText('Export')).toBeTruthy();
  });

  it('does not render Export dropdown when no output formats are registered', () => {
    __setExportExtensions({ outputFormats: [] });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(screen.queryByText('Export')).toBeNull();
  });

  it('does not render Export dropdown when extensions context has no outputFormats property', () => {
    // Default mock has no outputFormats property
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(screen.queryByText('Export')).toBeNull();
  });

  // ---- Compile-only format items are clickable and enabled ----------------

  it('shows compile-only format as an enabled, clickable menu item with green FileOutput icon and output extension', () => {
    __setExportExtensions({
      outputFormats: [
        { id: 'fmt-json', extensionId: 'ext-a', label: 'Metadata JSON', requiresRender: false, outputExtension: 'json', disabled: false },
      ],
    });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    // Click Export to open the dropdown
    fireEvent.click(screen.getByText('Export'));

    // The compile-only format should be visible as a menu item
    const formatItem = screen.getByText('Metadata JSON');
    expect(formatItem).toBeTruthy();
    // The extension badge should be visible
    expect(screen.getByText('.json')).toBeTruthy();
    // The item should NOT be disabled (it's a button or menuitem role)
    const menuItem = formatItem.closest('[role="menuitem"]');
    expect(menuItem).toBeTruthy();
    expect(menuItem).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('shows multiple compile-only formats as distinct enabled menu items', () => {
    __setExportExtensions({
      outputFormats: [
        { id: 'fmt-json', extensionId: 'ext-a', label: 'Metadata JSON', requiresRender: false, outputExtension: 'json', disabled: false },
        { id: 'fmt-csv', extensionId: 'ext-a', label: 'CSV Export', requiresRender: false, outputExtension: 'csv', disabled: false },
      ],
    });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    fireEvent.click(screen.getByText('Export'));

    expect(screen.getByText('Metadata JSON')).toBeTruthy();
    expect(screen.getByText('CSV Export')).toBeTruthy();
    expect(screen.getByText('.json')).toBeTruthy();
    expect(screen.getByText('.csv')).toBeTruthy();
  });

  // ---- Render-dependent formats dispatch through Astrid --------------------

  it('shows render-dependent format as an enabled Astrid task action', () => {
    __setExportExtensions({
      outputFormats: [
        { id: 'fmt-mp4', extensionId: 'ext-b', label: 'MP4 Video', requiresRender: true, outputExtension: 'mp4', disabled: false },
      ],
    });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    fireEvent.click(screen.getByText('Export'));

    expect(screen.getByText('Render via Astrid')).toBeTruthy();
    // Registered render formats are now actionable through common task admission.
    const formatItem = screen.getByText('MP4 Video');
    expect(formatItem).toBeTruthy();
    const menuItem = formatItem.closest('[role="menuitem"]');
    expect(menuItem).toBeTruthy();
    expect(menuItem).not.toHaveAttribute('aria-disabled', 'true');
    expect(menuItem).toHaveAttribute('title');
    expect(menuItem!.getAttribute('title')).toContain('Astrid task');
  });

  it('shows disabledReason in tooltip for disabled render-dependent formats', () => {
    __setExportExtensions({
      outputFormats: [
        { id: 'fmt-future', extensionId: 'ext-b', label: 'Future Format', requiresRender: true, outputExtension: 'fut', disabled: true, disabledReason: 'Needs encoder v2' },
      ],
    });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    fireEvent.click(screen.getByText('Export'));

    const formatItem = screen.getByText('Future Format');
    const menuItem = formatItem.closest('[role="menuitem"]');
    expect(menuItem).toHaveAttribute('aria-disabled', 'true');
    expect(menuItem!.getAttribute('title')).toContain('Needs encoder v2');
  });

  it('shows both compile-only and render-dependent sections when mixed formats are present', () => {
    __setExportExtensions({
      outputFormats: [
        { id: 'fmt-json', extensionId: 'ext-a', label: 'Metadata JSON', requiresRender: false, outputExtension: 'json', disabled: false },
        { id: 'fmt-mp4', extensionId: 'ext-b', label: 'MP4 Video', requiresRender: true, outputExtension: 'mp4', disabled: false },
      ],
    });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    fireEvent.click(screen.getByText('Export'));

    // Both sections visible
    expect(screen.getByText('Metadata JSON')).toBeTruthy();
    expect(screen.getByText('MP4 Video')).toBeTruthy();
    expect(screen.getByText('Render via Astrid')).toBeTruthy();
    // Compile-only enabled
    const compileMenuItem = screen.getByText('Metadata JSON').closest('[role="menuitem"]');
    expect(compileMenuItem).not.toHaveAttribute('aria-disabled', 'true');
    // Render-dependent formats are admitted through the Astrid task ledger.
    const renderMenuItem = screen.getByText('MP4 Video').closest('[role="menuitem"]');
    expect(renderMenuItem).not.toHaveAttribute('aria-disabled', 'true');
  });

  // ---- Render button behavior is unchanged -------------------------------

  it('renders the Render button even when export formats are registered', () => {
    __setExportExtensions({
      outputFormats: [
        { id: 'fmt-json', extensionId: 'ext-a', label: 'Metadata JSON', requiresRender: false, outputExtension: 'json', disabled: false },
      ],
    });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(screen.getByText('Render')).toBeTruthy();
  });

  it('Render button is unchanged and still clickable when export formats are present', () => {
    __setExportExtensions({
      outputFormats: [
        { id: 'fmt-json', extensionId: 'ext-a', label: 'JSON', requiresRender: false, outputExtension: 'json', disabled: false },
        { id: 'fmt-mp4', extensionId: 'ext-b', label: 'MP4', requiresRender: true, outputExtension: 'mp4', disabled: false },
      ],
    });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    const renderButton = screen.getByText('Render');
    expect(renderButton).toBeTruthy();
    // Should not be disabled (idle state)
    expect(renderButton.closest('button')).not.toBeDisabled();
  });

  it('keeps Render as the canonical export trigger during the shell transition', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    __setExportExtensions({
      outputFormats: [
        { id: 'fmt-json', extensionId: 'ext-a', label: 'Metadata JSON', requiresRender: false, outputExtension: 'json', disabled: false },
        { id: 'fmt-mp4', extensionId: 'ext-b', label: 'MP4 Video', requiresRender: true, outputExtension: 'mp4', disabled: false },
      ],
    });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    fireEvent.click(screen.getByText('Export'));
    fireEvent.click(screen.getByText('Metadata JSON'));

    expect(consoleLog).toHaveBeenCalledWith('[Export] Compile-only format: fmt-json (Metadata JSON)');
    expect(__startRender).not.toHaveBeenCalled();
    expect(document.querySelector('[data-video-editor-render-blocker="true"]')).toBeNull();

    fireEvent.click(screen.getByText('Render'));
    expect(__startRender).toHaveBeenCalledTimes(1);

    consoleLog.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// M5: HostContributionErrorBoundary recovery-key regression tests
// ---------------------------------------------------------------------------

describe('TimelineEditorShellCore — HostContributionErrorBoundary recovery keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearSlotRenderers();
    __clearExportExtensions();
    __clearRuntimeContext();
  });

  const makeExtension = (id: string, contributions: any[]) => ({
    manifest: {
      id,
      name: id,
      version: '1.0.0',
      contributions,
    },
  });

  it('resolves extensionId for slot boundaries from extensionRuntime contributions', () => {
    // Set up runtime context with an extension that contributes to the header slot
    __setRuntimeContext({
      provider: {} as any,
      timelineId: 'test-timeline',
      userId: 'user-1',
      extensions: __exportExtensions,
      extensionRuntime: {
        extensions: [
          makeExtension('com.example.header-ext', [
            { id: 'header-contrib', kind: 'slot', slot: 'header' },
          ]),
        ],
      },
      getRecoveryKey: (extId: string) => (extId === 'com.example.header-ext' ? '5' : '0'),
      incrementRecoveryKey: vi.fn(),
    });

    const headerRenderer = vi.fn(() => <div data-testid="header-content">Header</div>);
    __setSlotRenderers({ header: headerRenderer });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    // The header should render
    expect(screen.getByTestId('header-content')).toBeTruthy();
    // The HostContributionErrorBoundary should have received extensionId via slotOwnerMap
    // We verify this indirectly: the boundary should render normally (no fallback)
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('passes extensionId=undefined when no extension contributes to a slot (legacy fallback)', () => {
    // Runtime context with NO extensionRuntime (no contribution manifests)
    __setRuntimeContext({
      provider: {} as any,
      timelineId: 'test-timeline',
      userId: 'user-1',
      extensions: __exportExtensions,
      // No extensionRuntime
    });

    const headerRenderer = vi.fn(() => <div data-testid="header-content">Header</div>);
    __setSlotRenderers({ header: headerRenderer });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    // Should still render — falls back to legacy ContributionErrorBoundary behavior
    expect(screen.getByTestId('header-content')).toBeTruthy();
  });

  it('maintains slot boundary isolation when one slot crashes', () => {
    const getRecoveryKey = vi.fn((extId: string) => (extId === 'com.example.ext' ? '1' : '0'));
    const incrementRecoveryKey = vi.fn((extId: string) => extId === 'com.example.ext' ? '2' : '0');

    __setRuntimeContext({
      provider: {} as any,
      timelineId: 'test-timeline',
      userId: 'user-1',
      extensions: __exportExtensions,
      extensionRuntime: {
        extensions: [
          makeExtension('com.example.ext', [
            { id: 'header-contrib', kind: 'slot', slot: 'header' },
            { id: 'toolbar-contrib', kind: 'slot', slot: 'toolbar' },
          ]),
        ],
      },
      getRecoveryKey,
      incrementRecoveryKey,
    });

    // Header returns a React element that throws during its own render (catchable by error boundary)
    const CrashingHeader = () => {
      throw new Error('Header crash!');
    };
    const crashingHeader = vi.fn(() => <CrashingHeader />);
    const normalToolbar = vi.fn(() => <div data-testid="toolbar-content">Toolbar OK</div>);

    __setSlotRenderers({ header: crashingHeader, toolbar: normalToolbar });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    // Header should show fallback
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Slot error/)).toBeTruthy();
    // The fallback label contains "Header" as the slot label — verify it's in the alert
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Header');

    // Toolbar should still render normally
    expect(screen.getByTestId('toolbar-content')).toBeTruthy();
    expect(screen.getByText('Toolbar OK')).toBeTruthy();
  });

  it('slotOwnerMap is empty when extensionRuntime is not provided', () => {
    __setRuntimeContext({
      provider: {} as any,
      timelineId: 'test-timeline',
      userId: 'user-1',
      extensions: __exportExtensions,
      // No extensionRuntime
    });

    const headerRenderer = vi.fn(() => <div data-testid="header-content">Header</div>);
    __setSlotRenderers({ header: headerRenderer });

    const { container } = render(<TimelineEditorShellCore timelineId="test-timeline" />);

    // Should render without crash
    expect(screen.getByTestId('header-content')).toBeTruthy();
    // The fallback should not be shown
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('multiple extensions contributing to the same slot use first extension by deterministic order', () => {
    const getRecoveryKey = vi.fn((extId: string) => {
      if (extId === 'com.example.first') return '10';
      if (extId === 'com.example.second') return '20';
      return '0';
    });

    __setRuntimeContext({
      provider: {} as any,
      timelineId: 'test-timeline',
      userId: 'user-1',
      extensions: __exportExtensions,
      extensionRuntime: {
        extensions: [
          makeExtension('com.example.first', [
            { id: 'h1', kind: 'slot', slot: 'header' },
          ]),
          makeExtension('com.example.second', [
            { id: 'h2', kind: 'slot', slot: 'header' },
          ]),
        ],
      },
      getRecoveryKey,
      incrementRecoveryKey: vi.fn(),
    });

    const headerRenderer = vi.fn(() => <div data-testid="header-content">Header</div>);
    __setSlotRenderers({ header: headerRenderer });

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    // Should render normally — the first extension's recovery key (10) should be used
    expect(screen.getByTestId('header-content')).toBeTruthy();
    // getRecoveryKey should have been called by HostContributionErrorBoundary
    // (indirectly via the recovery key lookup)
  });
});

});

// ---------------------------------------------------------------------------
// Host timeline error boundary
// ---------------------------------------------------------------------------

describe('TimelineEditorShellCore — timeline error boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearSlotRenderers();
    __clearRuntimeContext();
    __deviceClass = 'desktop';
    __timelineThrows = false;
  });

  afterEach(() => {
    __timelineThrows = false;
  });

  it('contains a timeline render throw and keeps the toolbar alive', () => {
    // React logs the caught error; silence it so the suite output stays readable.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    __timelineThrows = true;

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    // The boundary caught it — the timeline is replaced by the fallback...
    expect(screen.queryByTestId('timeline-editor')).toBeNull();
    expect(document.querySelector('[data-video-editor-timeline-error]')).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveTextContent('Timeline failed to render');

    // ...and the rest of the editor — including the toolbar you would use to
    // undo the edit that produced the bad clip — is still mounted.
    expect(screen.getByLabelText('Zoom out timeline')).toBeTruthy();
    expect(screen.getByLabelText('Zoom in timeline')).toBeTruthy();
    expect(screen.getByText('saved')).toBeTruthy();
    expect(screen.getByTestId('preview-panel')).toBeTruthy();

    consoleError.mockRestore();
  });

  it('re-mounts the timeline subtree when "Reload editor" is activated', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    __timelineThrows = true;

    render(<TimelineEditorShellCore timelineId="test-timeline" />);
    expect(screen.queryByTestId('timeline-editor')).toBeNull();

    // The underlying cause is gone (e.g. the user's undo landed, or a refetch
    // replaced the bad clip); the reload affordance must produce a fresh mount.
    __timelineThrows = false;
    fireEvent.click(screen.getByRole('button', { name: /reload editor/i }));

    expect(screen.getByTestId('timeline-editor')).toBeTruthy();
    expect(document.querySelector('[data-video-editor-timeline-error]')).toBeNull();

    consoleError.mockRestore();
  });

  it('does not wrap the timeline in a fallback when it renders cleanly', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(screen.getByTestId('timeline-editor')).toBeTruthy();
    expect(document.querySelector('[data-video-editor-timeline-error]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Timeline load failure (the error boundary cannot see this one)
// ---------------------------------------------------------------------------

describe('TimelineEditorShellCore — timeline load error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearSlotRenderers();
    __clearRuntimeContext();
    __deviceClass = 'desktop';
    __chromeOverrides = {};
  });

  afterEach(() => {
    __chromeOverrides = {};
  });

  it('renders a load-error card where the timeline goes and keeps the toolbar', () => {
    // A load rejection (malformed bridge payload, dead backend) resolves the
    // query to an error *before* anything renders, so TimelineErrorBoundary
    // never fires. Without this branch the shell mounts an empty editor whose
    // save badge reads "saved".
    __chromeOverrides = {
      loadError: new Error('Astrid bridge returned a malformed timeline payload: config: expected object, received string'),
    };

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(screen.queryByTestId('timeline-editor')).toBeNull();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Unable to load this timeline');
    expect(alert).toHaveTextContent('malformed timeline payload');

    // The toolbar (and therefore the way out — mode/timeline switching) survives.
    expect(screen.getByLabelText('Zoom out timeline')).toBeTruthy();
    expect(screen.getByTestId('preview-panel')).toBeTruthy();
  });

  it('refetches the timeline when the card\'s retry affordance is used', () => {
    const retryLoad = vi.fn();
    __chromeOverrides = { loadError: new Error('bridge unreachable'), retryLoad };

    render(<TimelineEditorShellCore timelineId="test-timeline" />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(retryLoad).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Mode-switcher reachability (Key Invariant 2: every mode reachable per device)
// ---------------------------------------------------------------------------

describe('TimelineEditorShellCore — mode switcher reachability', () => {
  const SWITCHABLE_MODES = ['Browse', 'Select', 'Move', 'Trim'];

  beforeEach(() => {
    vi.clearAllMocks();
    __clearSlotRenderers();
    __clearRuntimeContext();
    __deviceClass = 'desktop';
  });

  it('reaches every interaction mode on tablet through the compact toolbar switcher', () => {
    __deviceClass = 'tablet';
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    const switcher = screen.getByRole('toolbar', { name: 'Timeline mode switcher' });
    expect(switcher).toBeTruthy();
    // The phone's full-width bar stays phone-only.
    expect(screen.queryByRole('toolbar', { name: 'Phone timeline mode bar' })).toBeNull();

    for (const label of [...SWITCHABLE_MODES, 'Precision']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('routes tablet mode changes through the same editor ops as the phone bar', () => {
    __deviceClass = 'tablet';
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    expect(__editorOps.setInteractionMode).toHaveBeenCalledWith('move');
    expect(__editorOps.setContextTarget).toHaveBeenCalledWith({ kind: 'timeline' });
    expect(__editorOps.setInspectorTarget).toHaveBeenCalled();
  });

  it('marks the active mode with aria-pressed on the tablet switcher', () => {
    __deviceClass = 'tablet';
    __interactionMode = 'trim';
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(screen.getByRole('button', { name: 'Trim' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Move' })).toHaveAttribute('aria-pressed', 'false');
    __interactionMode = 'browse';
  });

  it('keeps every switcher target at the 44px touch minimum', () => {
    __deviceClass = 'tablet';
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    const switcher = screen.getByRole('toolbar', { name: 'Timeline mode switcher' });
    for (const button of Array.from(switcher.querySelectorAll('button'))) {
      // jsdom has no layout, so assert the class that carries the constraint.
      expect(button.className).toContain('min-h-11');
    }
  });

  it('renders no mode switcher on desktop — its input model is modeless', () => {
    __deviceClass = 'desktop';
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(screen.queryByRole('toolbar', { name: 'Timeline mode switcher' })).toBeNull();
    expect(screen.queryByRole('toolbar', { name: 'Phone timeline mode bar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Trim' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Diverged (409) banner (plan-v5 B4)
// ---------------------------------------------------------------------------

describe('TimelineEditorShellCore — diverged conflict banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearSlotRenderers();
    __clearRuntimeContext();
    __deviceClass = 'desktop';
    __chromeOverrides = {};
  });

  afterEach(() => {
    __chromeOverrides = {};
  });

  it('renders the diverged banner with Reload and Save-as-copy actions', () => {
    const reload = vi.fn();
    const saveAsCopy = vi.fn();
    __chromeOverrides = {
      isConflictExhausted: true,
      reloadFromServer: reload,
      retrySaveAfterConflict: saveAsCopy,
    };

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(screen.getByText(/the timeline version no longer matches this draft/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /reload/i }));
    expect(reload).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /save as copy/i }));
    expect(saveAsCopy).toHaveBeenCalled();
  });

  it('does not render the diverged banner when clean', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" />);
    expect(screen.queryByText(/the timeline version no longer matches this draft/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Recovery draft (plan-v5 B9)
// ---------------------------------------------------------------------------

describe('TimelineEditorShellCore — recovery draft banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearSlotRenderers();
    __clearRuntimeContext();
    __deviceClass = 'desktop';
    __chromeOverrides = {};
  });

  afterEach(() => {
    __chromeOverrides = {};
  });

  it('offers Retry and Discard for a recovered draft', () => {
    const retry = vi.fn();
    const discard = vi.fn();
    __chromeOverrides = {
      recoveryDraft: { updatedAt: '2026-08-11T21:00:00.000Z', baseVersion: 159 },
      retryRecoveredDraft: retry,
      discardRecoveredDraft: discard,
    };

    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(screen.getByText(/recovered unsaved changes/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(retry).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    expect(discard).toHaveBeenCalled();
  });

  it('does not render the recovery banner without a draft', () => {
    render(<TimelineEditorShellCore timelineId="test-timeline" />);
    expect(screen.queryByText(/recovered unsaved changes/i)).toBeNull();
  });
  it('hides recovery controls while the conflict surface is active', () => {
    __chromeOverrides = {
      isConflictExhausted: true,
      recoveryDraft: { updatedAt: '2026-10-08T13:43:57Z', baseVersion: 1 },
    };
    render(<TimelineEditorShellCore timelineId="test-timeline" />);
    expect(screen.getByText(/the timeline version no longer matches this draft/i)).toBeTruthy();
    expect(screen.queryByText(/recovered unsaved changes/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /^retry$/i })).toBeNull();
  });
  it('marks unknown recovery provenance and disables Retry', () => {
    const retry = vi.fn();
    __chromeOverrides = {
      recoveryDraft: { updatedAt: '2026-10-08T13:43:57Z', baseVersion: 1, retryAllowed: false },
      retryRecoveredDraft: retry,
    };
    render(<TimelineEditorShellCore timelineId="test-timeline" />);
    expect(screen.getByText(/original editing head is unknown/i)).toBeTruthy();
    const button = screen.getByRole('button', { name: /^retry$/i });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(retry).not.toHaveBeenCalled();
  });
});
  it('does not snap a live dataItem target back to the timeline placeholder (groken LIVE-1)', () => {
    __liveInspectorTarget.value = {
      kind: 'dataItem' as const,
      laneId: 'transcript',
      itemId: 'a:c1:0',
    };
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    // Empty selection derives {kind:'timeline'}; the host-owned-kind guard
    // must NOT write that placeholder over the extension's live target.
    expect(__editorOps.setInspectorTarget).not.toHaveBeenCalledWith({ kind: 'timeline' });
  });

  it('preserves a selected occurrence but lets a different track take over the inspector', () => {
    __useActualTargetEquality = true;
    __selectedTrackId = 'V1';
    __liveInspectorTarget.value = {
      kind: 'shotOccurrence' as const,
      occurrenceId: 'occurrence-opening',
      shotId: 'shot-opening',
      revisionId: 'revision-opening',
      parentDocumentId: 'timeline-1',
      shotName: 'Opening',
      trackId: 'V1',
      start: 0,
      end: 2,
    };
    const { unmount } = render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(__editorOps.setInspectorTarget).not.toHaveBeenCalled();

    unmount();
    vi.clearAllMocks();
    __selectedTrackId = 'V2';
    render(<TimelineEditorShellCore timelineId="test-timeline" />);

    expect(__editorOps.setInspectorTarget).toHaveBeenCalledWith({ kind: 'track', trackId: 'V2' });
  });


it('derives a mixed read-only target and declines media keyboard mutations', () => {
  __selectedClipIds = new Set(['clip-a', 'clip-b']);
  __selectedDataItems = [{ laneId: 'transcript', itemId: 'segment@clip-a' }];
  __editorOps.applyEdit.mockClear(); __editorOps.handleDeleteClips.mockClear(); __editorOps.handleToggleMuteClips.mockClear(); __editorOps.handleSplitSelectedClip.mockClear();
  const view = render(<TimelineEditorShellCore timelineId="mixed-timeline" />);
  const options = vi.mocked(useKeyboardShortcuts).mock.calls.at(-1)![0];
  expect(options.hasSelectedClip).toBe(false);
  expect(options.canMoveSelectedClipToTrack).toBe(false);
  options.deleteSelectedClip(); options.nudgeSelectedClipsInTime(1); options.toggleMute(); options.splitSelectedClip();
  expect(__editorOps.applyEdit).not.toHaveBeenCalled();
  expect(__editorOps.handleDeleteClips).not.toHaveBeenCalled();
  expect(__editorOps.handleToggleMuteClips).not.toHaveBeenCalled();
  expect(__editorOps.handleSplitSelectedClip).not.toHaveBeenCalled();
  expect(__editorOps.setInspectorTarget).toHaveBeenCalledWith({ kind: 'selection', clipIds: ['clip-a', 'clip-b'], dataItems: __selectedDataItems });
  view.unmount(); __selectedClipIds = new Set(); __selectedDataItems = [];
});
