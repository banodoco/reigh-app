// @vitest-environment jsdom
import React from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import fixture from '@/tools/video-editor/data/shotComposition.fixture.json';
import { createShotCompositionAdapter } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import { projectCanonicalComposition } from '@/tools/video-editor/data/shotCompositionProjection.ts';
import { useVideoEditorPreviewSurface } from './useVideoEditorPreviewSurface.tsx';

const mocks = vi.hoisted(() => ({
  runtime: null as unknown,
  timeline: null as unknown,
  playback: null as unknown,
  previewMounts: 0,
}));

vi.mock('@/tools/video-editor/hooks/timelineStore.ts', () => ({
  useTimelineDataSelector: (selector: (timeline: unknown) => unknown) => selector(mocks.timeline),
  useTimelinePlaybackSelector: (selector: (playback: unknown) => unknown) => selector(mocks.playback),
}));

vi.mock('@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx', () => ({
  useOptionalVideoEditorRuntime: () => mocks.runtime,
}));

vi.mock('@/tools/video-editor/components/PreviewPanel/RemotionPreview.tsx', async () => {
  const React = await import('react');
  return {
    RemotionPreview: React.forwardRef(function Preview(props: { initialTime: number; config: { width: number } }, _ref) {
      const [instance] = React.useState(() => ++mocks.previewMounts);
      return React.createElement('div', {
        'data-preview-instance': instance,
        'data-initial-time': props.initialTime,
        'data-width': props.config.width,
      });
    }),
  };
});

function graphWithClipStart(atMs: number, head: string) {
  const graph = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
  graph.primary_timeline.head.revision_id = head;
  graph.shot_revisions.find((revision) => revision.shot_id === 'shot-alpha' && revision.revision_id === 'rev-a')!
    .internal_timeline_revision.timeline.clips[0]!.at_ms = atMs;
  return graph;
}

describe('useVideoEditorPreviewSurface', () => {
  it('previews the active shot draft before canonical publication is acknowledged', () => {
    const adapter = createShotCompositionAdapter({ load: vi.fn(), publish: vi.fn() });
    const canonical = adapter.prepare(fixture);
    const draft = adapter.prepare(graphWithClipStart(700, 'draft-head'));
    const parentConfig = projectCanonicalComposition(canonical).config!;
    const expectedDraftConfig = projectCanonicalComposition(draft, parentConfig).config!;
    mocks.timeline = { resolvedConfig: parentConfig };
    mocks.playback = {
      currentTime: 0,
      previewRef: { current: null },
      playerContainerRef: { current: null },
      onPreviewTimeUpdate: vi.fn(),
    };
    mocks.runtime = {
      userId: null,
      shots: {
        shotComposition: adapter,
        canonicalComposition: canonical,
        canonicalDraft: { composition: draft },
        canonicalCompositionError: null,
      },
    };

    const { result } = renderHook(() => useVideoEditorPreviewSurface());
    act(() => result.current.slotRef(document.createElement('div')));
    const previewElement = (result.current.portal as unknown as { children: React.ReactElement }).children;

    expect(previewElement.props.config).toEqual(expectedDraftConfig);
    expect(previewElement.props.currentTime).toBeUndefined();
  });
});

function previewInputs() {
  mocks.timeline = { resolvedConfig: { clips: [], width: 640, height: 360 } };
  mocks.runtime = null;
  mocks.playback = {
    currentTime: 0,
    previewRef: { current: null },
    playerContainerRef: { current: null },
    onPreviewTimeUpdate: vi.fn(),
  };
}

function portalHost(surface: ReturnType<typeof useVideoEditorPreviewSurface>) {
  return (surface.portal as unknown as { containerInfo: HTMLDivElement }).containerInfo;
}

describe('preview portal attachment lifetime', () => {
  it('retains the connected host across config revisions while updating preview props', () => {
    previewInputs();
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    const { result, rerender, unmount } = renderHook(() => useVideoEditorPreviewSurface());
    act(() => result.current.slotRef(slot));
    const host = portalHost(result.current);
    const remove = vi.spyOn(host, 'remove');
    const initialConfig = (mocks.timeline as { resolvedConfig: object }).resolvedConfig;

    mocks.timeline = { resolvedConfig: { ...initialConfig } };
    rerender();
    expect(portalHost(result.current)).toBe(host);
    expect(host.parentElement).toBe(slot);
    expect(host.isConnected).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    const preview = (result.current.portal as unknown as { children: React.ReactElement }).children;
    expect(preview.props.config).not.toBe(initialConfig);
    expect(preview.props.config).toEqual(initialConfig);

    unmount();
    expect(host.isConnected).toBe(false);
    expect(slot.childElementCount).toBe(0);
    remove.mockRestore();
    slot.remove();
  });

  it('removes unavailable previews and attaches to replacement slots without stale hosts', () => {
    previewInputs();
    const firstSlot = document.createElement('div');
    const nextSlot = document.createElement('div');
    document.body.append(firstSlot, nextSlot);
    const { result, rerender, unmount } = renderHook(() => useVideoEditorPreviewSurface());
    act(() => result.current.slotRef(firstSlot));
    const host = portalHost(result.current);
    const config = (mocks.timeline as { resolvedConfig: object }).resolvedConfig;

    mocks.timeline = { resolvedConfig: null };
    rerender();
    expect(result.current.portal).toBeNull();
    expect(result.current.hasConfig).toBe(false);
    expect(host.isConnected).toBe(false);
    expect(firstSlot.childElementCount).toBe(0);

    mocks.timeline = { resolvedConfig: config };
    rerender();
    expect(portalHost(result.current)).toBe(host);
    expect(host.parentElement).toBe(firstSlot);
    act(() => result.current.slotRef(nextSlot));
    expect(firstSlot.childElementCount).toBe(0);
    expect(nextSlot.firstElementChild).toBe(host);
    expect(host.isConnected).toBe(true);

    act(() => result.current.slotRef(null));
    expect(host.isConnected).toBe(false);
    expect(nextSlot.childElementCount).toBe(0);
    unmount();
    firstSlot.remove();
    nextSlot.remove();
  });
});


describe('physical preview attachment identity', () => {
  it('remounts only for replaced/reacquired slots with the latest config and playhead', () => {
    previewInputs();
    let slotKey = 'first';
    let showSlot = true;
    let surface!: ReturnType<typeof useVideoEditorPreviewSurface>;
    function App() {
      surface = useVideoEditorPreviewSurface();
      return <>{showSlot && <div key={slotKey} data-slot={slotKey} ref={surface.slotRef} />}{surface.portal}</>;
    }
    const { container, rerender, unmount } = render(<App />);
    const firstSlot = container.querySelector('[data-slot]')!;
    const host = firstSlot.firstElementChild!;
    const preview = () => container.querySelector('[data-preview-instance]')!;
    const original = preview().getAttribute('data-preview-instance');
    const remove = vi.spyOn(host, 'remove');

    act(() => surface.slotRef(firstSlot as HTMLDivElement));
    mocks.timeline = { resolvedConfig: { clips: [], width: 1280, height: 720 } };
    (mocks.playback as { currentTime: number }).currentTime = 1.25;
    rerender(<App />);
    expect(preview().getAttribute('data-preview-instance')).toBe(original);
    expect(preview().getAttribute('data-initial-time')).toBe('1.25');
    expect(preview().getAttribute('data-width')).toBe('1280');
    expect(remove).not.toHaveBeenCalled();

    slotKey = 'replacement';
    rerender(<App />);
    const replacement = preview().getAttribute('data-preview-instance');
    expect(replacement).not.toBe(original);
    expect(preview().getAttribute('data-initial-time')).toBe('1.25');
    expect(preview().getAttribute('data-width')).toBe('1280');
    expect(container.querySelectorAll('[data-preview-instance]')).toHaveLength(1);
    expect(firstSlot.childElementCount).toBe(0);
    expect(container.querySelector('[data-slot]')!.firstElementChild).toBe(host);
    expect(remove).toHaveBeenCalledTimes(1);

    showSlot = false;
    rerender(<App />);
    expect(surface.portal).toBeNull();
    expect(container.querySelector('[data-preview-instance]')).toBeNull();
    expect(host.isConnected).toBe(false);
    expect(remove).toHaveBeenCalledTimes(2);
    showSlot = true;
    rerender(<App />);
    expect(preview().getAttribute('data-preview-instance')).not.toBe(replacement);
    expect(preview().getAttribute('data-initial-time')).toBe('1.25');
    expect(container.querySelectorAll('[data-preview-instance]')).toHaveLength(1);
    unmount();
    expect(host.isConnected).toBe(false);
    expect(remove).toHaveBeenCalledTimes(3);
    remove.mockRestore();
  });
});
