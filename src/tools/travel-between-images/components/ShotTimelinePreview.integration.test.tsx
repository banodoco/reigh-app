// @vitest-environment jsdom
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AgentChatProvider } from '@/shared/contexts/AgentChatContext.tsx';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIndexedDB, resetFakeIndexedDB } from 'fake-indexeddb';
import fixture from '@/tools/video-editor/data/shotComposition.fixture.json';
import { createShotCompositionAdapter } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import { projectCanonicalComposition } from '@/tools/video-editor/data/shotCompositionProjection.ts';
import { clearTimelineDraft, loadTimelineDraft, saveTimelineDraft } from '@/tools/video-editor/data/timelineDraftIndexedDb.ts';
import { ShotTimelinePreview } from './ShotTimelinePreview.tsx';
import * as shotTimelineDataProvider from './shotTimelineDataProvider.ts';
import { shotTimelineRecoveryId } from './shotTimelineDataProvider.ts';

vi.stubGlobal('indexedDB', createFakeIndexedDB());
vi.mock('@/tools/video-editor/components/PreviewPanel/RemotionPreview.tsx', () => ({
  RemotionPreview: React.forwardRef(() => <div data-testid="preview" />),
}));
vi.mock('@/tools/video-editor/sequences/components/FrameOverlaySequence.tsx', () => ({
  FrameOverlaySequence: () => null,
}));
vi.mock('@/tools/video-editor/sequences/components/EndSpanningLayerSequence.tsx', () => ({
  EndSpanningLayerSequence: () => null,
}));
vi.mock('@/tools/video-editor/runtime/astrid-element-components.tsx', () => ({
  ASTRID_ELEMENT_COMPONENTS: {},
}));
vi.mock('@/tools/video-editor/runtime/astrid-element-catalog.ts', () => ({
  ASTRID_ANIMATION_CATALOG: [],
  ASTRID_EFFECT_CATALOG: [],
  ASTRID_TRANSITION_CATALOG: [],
}));

const recoveryKey = shotTimelineRecoveryId('document-primary', 'occ-1');

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AgentChatProvider>{children}</AgentChatProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function editedGraph(atMs: number, headId: string) {
  const graph = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
  graph.primary_timeline.head.revision_id = headId;
  graph.shot_revisions.find((revision) => revision.shot_id === 'shot-alpha' && revision.revision_id === 'rev-a')!
    .internal_timeline_revision.timeline.clips[0]!.at_ms = atMs;
  return graph;
}

describe('shot timeline popup real recovery integration', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    resetFakeIndexedDB();
    await clearTimelineDraft(recoveryKey);
  });

  it('renders immediately from the supplied prepared composition without waiting for adapter freshness', async () => {
    const neverResolve = new Promise<null>(() => {});
    const load = vi.fn(() => neverResolve);
    const adapter = createShotCompositionAdapter({
      load,
      publish: vi.fn(),
    });
    const composition = adapter.prepare(fixture);

    render(
      <ShotTimelinePreview composition={composition} occurrenceId="occ-1" shotCompositionAdapter={adapter} />,
      { wrapper: wrapper() },
    );

    expect(screen.queryByText('Loading current shot timeline…')).toBeNull();
    expect(screen.getByRole('region', { name: 'Shot timeline' }))
      .toHaveAttribute('data-shot-timeline-status', 'ready');
    await waitFor(() => expect(document.querySelector('[data-shot-timeline-canvas="true"]')).toBeTruthy());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(document.querySelector('[data-shot-timeline-canvas="true"]'))
      .toHaveAttribute('data-shot-timeline-clip-assets', expect.stringContaining(':0:'));
  });

  it('renders projected visual and audio tracks before the popup provider finishes loading', async () => {
    const adapter = createShotCompositionAdapter({ load: vi.fn(), publish: vi.fn() });
    const composition = adapter.prepare(fixture);
    const createRealProvider = shotTimelineDataProvider.createShotTimelineDataProvider;
    let releaseLoad!: () => void;
    const loadGate = new Promise<void>((resolve) => { releaseLoad = resolve; });
    vi.spyOn(shotTimelineDataProvider, 'createShotTimelineDataProvider').mockImplementation((...args) => {
      const provider = createRealProvider(...args);
      const loadTimeline = provider.loadTimeline.bind(provider);
      vi.spyOn(provider, 'loadTimeline').mockImplementation(async (timelineId) => {
        await loadGate;
        return loadTimeline(timelineId);
      });
      return provider;
    });

    const view = render(
      <ShotTimelinePreview composition={composition} occurrenceId="occ-1" shotCompositionAdapter={adapter} />,
      { wrapper: wrapper() },
    );

    const canvas = document.querySelector('[data-shot-timeline-canvas="true"]');
    expect(canvas).toBeTruthy();
    expect(canvas).toHaveAttribute('data-shot-timeline-clip-count', '2');
    expect(canvas).toHaveAttribute('data-shot-timeline-tracks', expect.stringContaining('audio:audio'));
    expect(canvas).toHaveAttribute('data-shot-timeline-clip-assets', expect.stringContaining('alpha-audio'));

    releaseLoad();
    await waitFor(() => expect(document.querySelector('.timeline-wrapper')).toBeTruthy());
    view.unmount();
  });

  it('emits a scoped optimistic parent projection before the durable save debounce', async () => {
    const publish = vi.fn(async (request: { graph: unknown }) => request.graph);
    const adapter = createShotCompositionAdapter({ load: vi.fn(), publish });
    const composition = adapter.prepare(fixture);
    const onDraft = vi.fn();
    const onSession = vi.fn();
    render(
      <ShotTimelinePreview
        composition={composition}
        occurrenceId="occ-1"
        shotCompositionAdapter={adapter}
        onCanonicalDraftProjectionChange={onDraft}
        onCanonicalDraftSessionChange={onSession}
      />,
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(document.querySelector('.timeline-wrapper')).toBeTruthy());
    const clip = document.querySelector('.clip-action');
    expect(clip).toBeTruthy();
    fireEvent.keyDown(clip, { key: 'Enter' });
    fireEvent.contextMenu(clip!, { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByText('Delete Clip'));

    expect(onSession).toHaveBeenCalledWith(expect.objectContaining({
      projectId: composition.projectId,
      parentDocumentId: composition.parentDocumentId,
      occurrenceId: 'occ-1',
    }), true);
    expect(onDraft).toHaveBeenCalledWith(expect.objectContaining({
      scope: expect.objectContaining({ occurrenceId: 'occ-1' }),
      generation: 1,
      composition: expect.objectContaining({ parentDocumentId: composition.parentDocumentId }),
    }));
    expect(publish).not.toHaveBeenCalled();
  });

  it.each([
    ['successful canonical reload clears recovery after replacing the visible draft', false],
    ['failed canonical reload preserves recovery and never presents a clean result', true],
  ])('%s', async (_label, failReload) => {
    const canonicalGraph = editedGraph(700, 'head-reload-canonical');
    const recoveredGraph = editedGraph(300, 'head-recovery-base');
    let loadCount = 0;
    const loadCanonical = vi.fn().mockImplementation(async () => {
      loadCount += 1;
      if (loadCount === 1) return recoveredGraph;
      if (failReload) throw new Error('canonical reload unavailable');
      return canonicalGraph;
    });
    const adapter = createShotCompositionAdapter({
      load: loadCanonical,
      publish: vi.fn(),
    });
    const initial = adapter.prepare(recoveredGraph);
    const recoveredConfig = projectCanonicalComposition({
      ...initial,
      occurrences: [initial.occurrences.find((item) => item.occurrenceId === 'occ-1')!],
    }).config!;
    const dirtyConfig = {
      ...recoveredConfig,
      clips: recoveredConfig.clips.map((clip) => ({ ...clip, at: 0.3, hold: (clip.hold ?? 0) + 1 })),
    };
    await saveTimelineDraft('crashed-popup-session', { config: dirtyConfig, registry: recoveredConfig.registry }, 4, {
      recoveryKey,
      draftIdentity: 'durable-popup-recovery',
    });
    const composition = adapter.prepare(fixture);
    const view = render(
      <ShotTimelinePreview composition={composition} occurrenceId="occ-1" shotCompositionAdapter={adapter} />,
      { wrapper: wrapper() },
    );

    const reloadButton = await screen.findByRole('button', { name: 'Reload' });
    expect(screen.getByRole('alert')).toHaveTextContent('Recovered unsaved changes');
    fireEvent.click(reloadButton);

    if (failReload) {
      await waitFor(() => expect(loadCanonical).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument());
      expect(await loadTimelineDraft(recoveryKey)).toMatchObject({ draftIdentity: 'durable-popup-recovery' });
      expect(screen.getByRole('alert')).toHaveTextContent('Recovered unsaved changes');
      expect(screen.getByRole('region', { name: 'Shot timeline' })).toHaveAttribute('data-shot-timeline-status', 'ready');
    } else {
      await waitFor(() => expect(screen.queryByText('Recovered unsaved changes')).toBeNull());
      await waitFor(() => expect(screen.getByRole('region', { name: 'Shot timeline' })).toHaveAttribute('data-shot-timeline-head-revision-id', 'head-reload-canonical'));
      expect(document.querySelector('[data-shot-timeline-canvas="true"]'))
        .toHaveAttribute('data-shot-timeline-clip-assets', expect.stringContaining(':0.7:'));
      expect(await loadTimelineDraft(recoveryKey)).toBeNull();
    }
    view.unmount();
  });

  it('reopens B with its acknowledged H1 base and retries it through the real popup recovery controls', async () => {
    const graphH0 = editedGraph(200, 'head-retry-h0');
    const graphH1 = editedGraph(900, 'head-retry-h1');
    const adapter = createShotCompositionAdapter({
      load: vi.fn().mockResolvedValue(graphH1),
      publish: vi.fn(async (request) => request.graph),
    });
    const compositionH1 = adapter.prepare(graphH1);
    const compositionH0 = adapter.prepare(graphH0);
    const occurrence = compositionH0.occurrences.find((item) => item.occurrenceId === 'occ-1')!;
    const projectedH0 = projectCanonicalComposition({ ...compositionH0, occurrences: [occurrence] }).config!;
    const draftB = {
      ...projectedH0,
      clips: projectedH0.clips.map((clip, index) => index === 0 ? { ...clip, at: 0.7 } : clip),
    };
    await saveTimelineDraft('crashed-popup-session-B', {
      config: draftB,
      registry: projectedH0.registry,
    }, 1, {
      recoveryKey,
      baseHeadRevisionId: compositionH1.headRevisionId,
      baseCanonicalGraph: compositionH1.contract as unknown as Record<string, unknown>,
      draftIdentity: 'popup-B-after-A-ack',
    });
    const publish = vi.spyOn(adapter, 'publish').mockImplementation(async (request) => {
      return adapter.prepare(request.graph);
    });

    const view = render(
      <ShotTimelinePreview composition={compositionH1} occurrenceId="occ-1" shotCompositionAdapter={adapter} />,
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(document.querySelector('[data-shot-timeline-canvas="true"]')
      ?.getAttribute('data-shot-timeline-clip-assets')).toContain(':0.7:'));
    expect(await loadTimelineDraft(recoveryKey)).not.toBeNull();
    expect(publish).not.toHaveBeenCalled();
    expect(screen.queryByText('Updating canonical shot; editing is paused.')).toBeNull();
    expect(screen.getByRole('region', { name: 'Shot timeline' }))
      .toHaveAttribute('data-shot-timeline-head-revision-id', compositionH1.headRevisionId);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Recovered unsaved changes'));
    const retryButton = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryButton);

    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(publish.mock.calls[0]?.[0]).toMatchObject({ expectedHeadRevisionId: compositionH1.headRevisionId });
    expect(await loadTimelineDraft(recoveryKey)).toBeNull();
    view.unmount();
  });

  it('holds H1 while the real mounted editor still shows H0, then edits through H1 without remounting', async () => {
    await clearTimelineDraft(recoveryKey);
    const graphH0 = editedGraph(200, 'head-mounted-h0');
    const graphH1 = editedGraph(900, 'head-mounted-h1');
    const loadCanonical = vi.fn().mockResolvedValueOnce(graphH0).mockResolvedValue(graphH1);
    const publish = vi.fn(async (request: { graph: unknown }) => request.graph);
    const adapter = createShotCompositionAdapter({ load: loadCanonical, publish });
    const compositionH0 = adapter.prepare(graphH0);
    const compositionH1 = adapter.prepare(graphH1);
    let beginH1Build!: () => void;
    const h1BuildStarted = new Promise<void>((resolve) => { beginH1Build = resolve; });
    let releaseH1Build!: () => void;
    const h1BuildGate = new Promise<void>((resolve) => { releaseH1Build = resolve; });
    const createRealProvider = shotTimelineDataProvider.createShotTimelineDataProvider;
    let holdH1Query = false;
    let heldH1Query = false;
    let mountedDataProvider: ReturnType<typeof createRealProvider> | null = null;
    vi.spyOn(shotTimelineDataProvider, 'createShotTimelineDataProvider').mockImplementation((...args) => {
      const provider = createRealProvider(...args);
      if (args[2] === 'occ-1') {
        const loadTimeline = provider.loadTimeline.bind(provider);
        vi.spyOn(provider, 'loadTimeline').mockImplementation(async (timelineId) => {
          if (holdH1Query && provider.timelineQueryIdentity === 'head-mounted-h1') {
            holdH1Query = false;
            heldH1Query = true;
            beginH1Build();
            await h1BuildGate;
          }
          return loadTimeline(timelineId);
        });
        mountedDataProvider = provider;
      }
      return provider;
    });
    const view = render(
      <ShotTimelinePreview composition={compositionH0} occurrenceId="occ-1" shotCompositionAdapter={adapter} />,
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(document.querySelector('.timeline-wrapper')).toBeTruthy());
    await waitFor(() => expect(document.querySelector('[data-shot-timeline-canvas="true"]')).toBeTruthy());
    const canvas = document.querySelector('[data-shot-timeline-canvas="true"]')!;
    await waitFor(() => expect(canvas.getAttribute('data-shot-timeline-clip-assets')).toContain(':0.2:'));
    const initiallySelectedClip = document.querySelector('.clip-action');
    expect(initiallySelectedClip, JSON.stringify({
      clipCount: canvas.getAttribute('data-shot-timeline-clip-count'),
      clipIds: Array.from(document.querySelectorAll('[data-clip-id]')).map((node) => node.getAttribute('data-clip-id')),
      actions: Array.from(document.querySelectorAll('[data-action-id]')).map((node) => node.getAttribute('data-action-id')),
      buttons: Array.from(document.querySelectorAll('[role="button"]')).map((node) => node.textContent?.trim()),
    })).toBeTruthy();
    fireEvent.keyDown(initiallySelectedClip, { key: 'Enter' });
    await waitFor(() => expect(initiallySelectedClip).toHaveAttribute('data-selected', 'true'));

    holdH1Query = true;
    act(() => view.rerender(
      <ShotTimelinePreview composition={compositionH1} occurrenceId="occ-1" shotCompositionAdapter={adapter} />,
    ));
    await waitFor(() => expect(loadCanonical).toHaveBeenCalledTimes(2));
    await h1BuildStarted;
    expect(mountedDataProvider?.timelineQueryIdentity).toBe('head-mounted-h1');
    expect(screen.getByText('Updating canonical shot; editing is paused.')).toBeInTheDocument();
    expect(canvas.getAttribute('data-shot-timeline-clip-assets')).toContain(':0.2:');
    const originalEditor = document.querySelector('[data-shot-timeline-editor="true"]');
    const clip = document.querySelector('.clip-action');
    expect(clip).toBeTruthy();
    fireEvent.contextMenu(clip!, { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByText('Delete Clip'));
    expect(heldH1Query).toBe(true);
    expect(publish).not.toHaveBeenCalled();
    expect(canvas.getAttribute('data-shot-timeline-clip-assets')).toContain(':0.2:');

    await act(async () => { releaseH1Build(); });
    await waitFor(() => expect(canvas.getAttribute('data-shot-timeline-clip-assets')).toContain(':0.9:'));
    await waitFor(() => expect(screen.queryByText('Updating canonical shot; editing is paused.')).toBeNull());
    expect(document.querySelector('[data-shot-timeline-editor="true"]')).toBe(originalEditor);
    const currentClip = document.querySelector('.clip-action');
    expect(currentClip).toHaveAttribute('data-selected', 'true');
    fireEvent.contextMenu(currentClip!, { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByText('Delete Clip'));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    expect(publish.mock.calls[0]![0]).toMatchObject({ expectedHeadRevisionId: compositionH1.headRevisionId });
    view.unmount();
    await clearTimelineDraft(recoveryKey);
  });
});
