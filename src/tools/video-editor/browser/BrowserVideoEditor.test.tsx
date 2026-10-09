import { act, render, screen } from '@testing-library/react';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { VideoEditorScopedServices } from './scopedServices';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserVideoEditor } from '@/tools/video-editor/browser/BrowserVideoEditor';
import { mountVideoEditor } from '@/tools/video-editor/browser/mountVideoEditor';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider';

const runtimeProviderSpy = vi.fn();
const extensionLoaderSpy = vi.fn();
const runtimeDisposeSpy = vi.fn();
const queryClients: QueryClient[] = [];

vi.mock('@/tools/video-editor/runtime/useExtensionLoaderWiring', () => ({
  useExtensionLoaderWiring: (props: any) => {
    extensionLoaderSpy(props);
    return { resolvedExtensions: props.directExtensions, packageStateEntries: [] };
  },
}));

function scopedServices(timelineId: string): VideoEditorScopedServices {
  return {
    contract: 'reigh.video-editor.scoped-services.v1',
    scope: { instanceId: 'editor-full', projectId: 'project-1', timelineId },
    shots: { shots: [], isLoading: false, error: null, refetchShots: vi.fn(), finalVideoMap: new Map(), dismissFinalVideo: vi.fn() },
    mediaLightbox: { Lightbox: () => null, loadGenerationForLightbox: vi.fn(async () => null) },
    agentChat: { registerTimeline: vi.fn(), unregisterTimeline: vi.fn() },
    toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
    telemetry: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

vi.mock('@/tools/video-editor/contexts/EditorRuntimeProvider', () => ({
  EditorRuntimeProvider: ({ children, ...props }: any) => {
    runtimeProviderSpy(props);
    queryClients.push(useQueryClient());
    useEffect(() => () => runtimeDisposeSpy(props.hostServices?.scope), []);
    return <div data-testid="runtime-provider">{children}</div>;
  },
}));

vi.mock('@/tools/video-editor/components/VideoEditorShell', () => ({
  VideoEditorShell: ({ mode, timelineId }: { mode: string; timelineId: string }) => (
    <div data-testid="video-editor-shell">{`${mode}:${timelineId}`}</div>
  ),
}));

const provider: DataProvider = {
  loadTimeline: vi.fn(),
  saveTimeline: vi.fn(),
  loadAssetRegistry: vi.fn(),
  resolveAssetUrl: vi.fn(async (file: string) => file),
};

afterEach(() => {
  runtimeProviderSpy.mockClear();
  extensionLoaderSpy.mockClear();
  runtimeDisposeSpy.mockClear();
  queryClients.length = 0;
});

describe('BrowserVideoEditor', () => {
  it('mounts the real shell through the generic runtime provider with injected services', () => {
    const assetResolver = { resolveAssetUrl: vi.fn((file: string) => `https://assets.example/${file}`) };
    const exporter = { render: vi.fn() };

    render(
      <BrowserVideoEditor
        dataProvider={provider}
        timelineId="timeline-1"
        timelineName="Demo timeline"
        userId={null}
        assetResolver={assetResolver}
        exporter={exporter}
        hostContext={{ projectId: 'project-1' }}
      />,
    );

    expect(screen.getByTestId('runtime-provider')).toBeInTheDocument();
    expect(screen.getByTestId('video-editor-shell')).toHaveTextContent('full:timeline-1');
    expect(runtimeProviderSpy).toHaveBeenCalledWith(expect.objectContaining({
      dataProvider: provider,
      timelineId: 'timeline-1',
      timelineName: 'Demo timeline',
      userId: null,
      runtime: expect.objectContaining({
        assetResolver,
        exporter,
        hostContext: { projectId: 'project-1' },
      }),
    }));
  });

  it('wraps the stock shell with renderLayout without replacing the public runtime bootstrap', () => {
    render(
      <BrowserVideoEditor
        dataProvider={provider}
        timelineId="timeline-1"
        renderLayout={(shell) => <div data-testid="layout-shell">{shell}</div>}
      />,
    );

    expect(screen.getByTestId('runtime-provider')).toBeInTheDocument();
    expect(screen.getByTestId('layout-shell')).toBeInTheDocument();
    expect(screen.getByTestId('video-editor-shell')).toHaveTextContent('full:timeline-1');
  });

  it('imperatively mounts, updates, and unmounts the browser editor', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    let mounted!: ReturnType<typeof mountVideoEditor>;

    act(() => {
      mounted = mountVideoEditor(container, {
        dataProvider: provider,
        timelineId: 'timeline-1',
        mode: 'compact',
      });
    });

    expect(container.textContent).toContain('compact:timeline-1');

    act(() => {
      mounted.update({
        dataProvider: provider,
        timelineId: 'timeline-2',
        mode: 'full',
      });
    });

    expect(container.textContent).toContain('full:timeline-2');

    act(() => {
      mounted.unmount();
    });

    expect(container.textContent).toBe('');
    container.remove();
  });
  it('forwards every extension facet and host service through the stock wrapper', () => {
    const services = scopedServices('timeline-1');
    const repository = null;
    const bundleStore = { getBundleContent: vi.fn(async () => null) };
    const onSaveStatusChange = vi.fn();
    render(<BrowserVideoEditor dataProvider={provider} timelineId="timeline-1"
      repository={repository} bundleStore={bundleStore} refreshKey={12}
      timelineOverlaysEnabled hostServices={services} onSaveStatusChange={onSaveStatusChange} />);
    expect(extensionLoaderSpy).toHaveBeenCalledWith(expect.objectContaining({ repository, bundleStore, refreshKey: 12 }));
    expect(runtimeProviderSpy).toHaveBeenCalledWith(expect.objectContaining({
      hostServices: services, onSaveStatusChange, timelineOverlaysEnabled: true, extensionStateRepository: repository,
    }));
  });

  it('remounts runtime ownership when scope changes and keeps captured callbacks', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const first = scopedServices('timeline-1');
    const second = scopedServices('timeline-2');
    let mounted!: ReturnType<typeof mountVideoEditor>;
    act(() => { mounted = mountVideoEditor(container, { dataProvider: provider, timelineId: 'timeline-1', hostServices: first }); });
    const capturedRegister = runtimeProviderSpy.mock.calls.at(-1)![0].hostServices.agentChat.registerTimeline;
    act(() => { mounted.update({ dataProvider: provider, timelineId: 'timeline-2', hostServices: second }); });
    expect(runtimeDisposeSpy).toHaveBeenCalledWith(first.scope);
    capturedRegister({ timelineId: 'timeline-1', projectId: 'project-1' });
    expect(first.agentChat.registerTimeline).toHaveBeenCalledOnce();
    expect(second.agentChat.registerTimeline).not.toHaveBeenCalled();
    act(() => { mounted.unmount(); mounted.unmount(); });
    expect(runtimeDisposeSpy).toHaveBeenCalledWith(second.scope);
    expect(() => mounted.update({ dataProvider: provider, timelineId: 'timeline-2', hostServices: second })).toThrow('unmounted');
    container.remove();
  });

  it('uses host cache updates and never disposes shared caches', async () => {
    const first = new QueryClient();
    const second = new QueryClient();
    const firstClear = vi.spyOn(first, 'clear');
    const secondClear = vi.spyOn(second, 'clear');
    const view = render(<BrowserVideoEditor dataProvider={provider} timelineId="timeline-1" queryClient={first} />);
    expect(queryClients.at(-1)).toBe(first);
    view.rerender(<BrowserVideoEditor dataProvider={provider} timelineId="timeline-1" queryClient={second} />);
    expect(queryClients.at(-1)).toBe(second);
    view.unmount();
    await act(async () => { await Promise.resolve(); });
    expect(firstClear).not.toHaveBeenCalled();
    expect(secondClear).not.toHaveBeenCalled();
  });

  it('disposes its own cache and rejects mismatched service identity', async () => {
    const view = render(<BrowserVideoEditor dataProvider={provider} timelineId="timeline-1" />);
    const own = queryClients.at(-1)!;
    own.setQueryData(['owned'], 'value');
    view.unmount();
    await act(async () => { await Promise.resolve(); });
    expect(own.getQueryData(['owned'])).toBeUndefined();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => render(<BrowserVideoEditor dataProvider={provider} timelineId="timeline-2" hostServices={scopedServices('timeline-1')} />)).toThrow('scope matching timelineId');
    } finally { consoleError.mockRestore(); }
  });

});
