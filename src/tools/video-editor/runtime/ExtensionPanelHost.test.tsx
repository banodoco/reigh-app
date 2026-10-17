import { createElement, useEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineExtension, type ContributionId, type ExtensionId, type PanelRenderProps } from '@astrid/editor-sdk';
import { ExtensionPanelHost, getPanelKey } from './ExtensionPanelHost';
import { normalizeExtensionRuntime, type VideoEditorPanelDescriptor } from './extensionSurface';
import { createRendererRegistry } from './extensionRendererRegistry';
import { createExtensionUiService, resolveRegisteredRenderers } from './extensionRenderSurface';
import { ASTRID_EDITOR_EXTENSION_CATALOG } from '@astrid/packs/rendering/editor/catalog';
import { createDataKindRegistry } from '@/tools/video-editor/data-kinds/DataKindRegistry.ts';
import { createDataKindRegistrationService } from '@/tools/video-editor/runtime/dataKindRegistrationService.ts';

vi.mock('@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx', () => ({
  useOptionalVideoEditorRuntime: () => null,
}));

afterEach(cleanup);

describe('registered panel lifecycle', () => {
  it('loads the actual rendering-pack transcript entry through its scoped renderer registration', async () => {
    const transcriptEntry = ASTRID_EDITOR_EXTENSION_CATALOG.find((entry) =>
      entry.packId === 'rendering' && entry.entryPath === 'ui/transcript/extension.tsx');
    expect(transcriptEntry).toBeDefined();
    const transcriptExtension = transcriptEntry!.extension;
    const registry = createRendererRegistry();
    const ui = createExtensionUiService({
      extension: transcriptExtension,
      diagnosticsService: { report: vi.fn(), diagnostics: [] },
      rendererRegistry: registry,
    });
    const runtime = normalizeExtensionRuntime([transcriptExtension]);
    expect(resolveRegisteredRenderers(runtime, registry.getSnapshot()).registry.panels).toEqual([]);
    const diagnostics = { report: vi.fn(), diagnostics: [] };
    const dataKindRegistry = createDataKindRegistry();
    const dataKinds = createDataKindRegistrationService({
      extension: transcriptExtension,
      dataKindRegistry,
      diagnosticsService: diagnostics,
    });
    const registration = await transcriptExtension.activate({ ui, dataKinds } as never);
    expect(dataKindRegistry.resolve('astrid.transcript')?.ownerExtensionId).toBe('haus.astrid.transcript-lane');
    const panels = resolveRegisteredRenderers(runtime, registry.getSnapshot()).registry.panels;
    expect(panels[0]).toMatchObject({
      extensionId: 'haus.astrid.transcript-lane', id: 'transcript-lane-panel',
      renderId: 'haus.astrid.transcript-lane.panel',
    });
    const view = render(<ExtensionPanelHost panels={panels} visiblePanelKeys={new Set(panels.map(getPanelKey))} />);
    expect(screen.getByTestId('astrid-transcript-panel')).toBeVisible();
    if (registration) registration.dispose();
    expect(dataKindRegistry.resolve('astrid.transcript')).toBeUndefined();
    const removed = resolveRegisteredRenderers(runtime, registry.getSnapshot()).registry.panels;
    view.rerender(<ExtensionPanelHost panels={removed} visiblePanelKeys={new Set()} />);
    expect(screen.queryByTestId('astrid-transcript-panel')).toBeNull();
  });

  it('resolves identical render/contribution IDs independently for each extension owner', () => {
    const registry = createRendererRegistry();
    const extensions = ['com.test.first', 'com.test.second'].map((id) => defineExtension({
      manifest: {
        id: id as ExtensionId, version: '1.0.0', apiVersion: 1, label: id,
        contributions: [{ id: 'shared' as ContributionId, kind: 'panel', render: 'shared-renderer' }],
      },
      activate: () => {},
    }));
    const runtime = normalizeExtensionRuntime(extensions);
    registry.register('com.test.first', 'shared-renderer', () => 'first');
    registry.register('com.test.second', 'shared-renderer', () => 'second');
    const panels = resolveRegisteredRenderers(runtime, registry.getSnapshot()).registry.panels;
    expect(panels.map(getPanelKey)).toEqual(['com.test.first:shared', 'com.test.second:shared']);
    expect(panels.map((panel) => panel.render({ instanceId: getPanelKey(panel), visible: true }))).toEqual(['first', 'second']);
    registry.unregisterAll('com.test.first');
    expect(resolveRegisteredRenderers(runtime, registry.getSnapshot()).registry.panels.map(getPanelKey)).toEqual(['com.test.second:shared']);
  });

  it('retains drafts through switches, isolates hosts, suspends subscriptions and cleans up on removal/unmount', () => {
    const observe = vi.fn();
    const dispose = vi.fn();
    const unmount = vi.fn();
    function StatefulPanel({ instanceId, visible }: PanelRenderProps) {
      const [draft, setDraft] = useState('');
      useEffect(() => () => { unmount(instanceId); }, [instanceId]);
      useEffect(() => {
        if (!visible) return;
        observe(instanceId);
        return () => { dispose(instanceId); };
      }, [instanceId, visible]);
      return <input aria-label={instanceId} value={draft} onChange={(event) => setDraft(event.target.value)} />;
    }
    const panels: VideoEditorPanelDescriptor[] = ['first', 'second'].map((id) => ({
      id, extensionId: 'com.test.panels', placement: 'asset-panel',
      render: (props) => createElement(StatefulPanel, props),
    }));
    const show = (visible: string, retained = panels) => <ExtensionPanelHost panels={retained} visiblePanelKeys={new Set([`com.test.panels:${visible}`])} />;
    const firstHost = render(show('first'));
    const secondHost = render(show('first'));
    const firstInput = firstHost.container.querySelector('input')!;
    const secondInput = secondHost.container.querySelector('input')!;
    expect(firstInput.getAttribute('aria-label')).not.toBe(secondInput.getAttribute('aria-label'));
    fireEvent.change(firstInput, { target: { value: 'retained correction draft' } });
    firstHost.rerender(show('second'));
    expect(firstInput).not.toBeVisible();
    expect(unmount).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledWith(firstInput.getAttribute('aria-label'));
    firstHost.rerender(show('first'));
    expect(firstHost.container.querySelector('input')).toBe(firstInput);
    expect(firstInput.value).toBe('retained correction draft');
    expect(secondInput.value).toBe('');
    firstHost.rerender(show('second', panels.slice(1)));
    expect(unmount).toHaveBeenCalledWith(firstInput.getAttribute('aria-label'));
    firstHost.unmount();
    secondHost.unmount();
    expect(unmount).toHaveBeenCalledTimes(4);
    expect(observe.mock.calls).toHaveLength(dispose.mock.calls.length);
  });
});
