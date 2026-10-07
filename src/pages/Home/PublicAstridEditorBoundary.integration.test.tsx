// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PublicAstridEditorProvider } from './PublicAstridEditorProvider.tsx';
import { LIGHT_STUDY_PUBLIC_EXAMPLE } from './content/light-study-v1/public-example.ts';
import { REPLACEMENT_PUBLIC_EXAMPLE } from './__tests__/fixtures/replacementPublicAstridExample.ts';
import {
  useProposalRuntimeFromStoreSafe,
  useTimelineChromeContextSafe,
  useTimelineEditorDataSafe,
  useTimelineEditorOpsSafe,
  useTimelineOpsFromStoreSafe,
} from '@/tools/video-editor/hooks/timelineStore.ts';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import type { TimelineBundleEnvelope } from '@/tools/video-editor/data/typed/timelineBundle.ts';
import { useTimelineCommandsService } from '@/tools/video-editor/hooks/useTimelineCommandsService.ts';

type MountedSnapshot = {
  runtime: ReturnType<typeof useVideoEditorRuntime> | null;
  data: ReturnType<typeof useTimelineEditorDataSafe>;
  ops: ReturnType<typeof useTimelineEditorOpsSafe>;
  chrome: ReturnType<typeof useTimelineChromeContextSafe>;
  timelineOps: ReturnType<typeof useTimelineOpsFromStoreSafe>;
  proposalRuntime: ReturnType<typeof useProposalRuntimeFromStoreSafe>;
  commands: ReturnType<typeof useTimelineCommandsService> | null;
};

function Capture({ snapshot }: { snapshot: MountedSnapshot }) {
  snapshot.runtime = useVideoEditorRuntime();
  snapshot.data = useTimelineEditorDataSafe();
  snapshot.ops = useTimelineEditorOpsSafe();
  snapshot.chrome = useTimelineChromeContextSafe();
  snapshot.timelineOps = useTimelineOpsFromStoreSafe();
  snapshot.proposalRuntime = useProposalRuntimeFromStoreSafe();
  snapshot.commands = useTimelineCommandsService();
  return null;
}

function documentView(data: TimelineData) {
  return {
    config: data.config,
    registry: data.registry,
    configVersion: data.configVersion,
    bundlePresent: Object.prototype.hasOwnProperty.call(data, 'sourceItemsBySchemaRef'),
    sourceItemsBySchemaRef: data.sourceItemsBySchemaRef,
  };
}

describe('mounted public Astrid editor write boundary', () => {
  it('keeps config, registry, history and bundle state fixed while exposing browse-only runtime services', async () => {
    const snapshot: MountedSnapshot = {
      runtime: null,
      data: null,
      ops: null,
      chrome: null,
      timelineOps: null,
      proposalRuntime: null,
      commands: null,
    };

    render(
      <MemoryRouter initialEntries={['/home']}>
        <PublicAstridEditorProvider example={LIGHT_STUDY_PUBLIC_EXAMPLE}>
          <Capture snapshot={snapshot} />
        </PublicAstridEditorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(snapshot.data?.data).not.toBeNull());
    expect(snapshot.runtime).not.toBeNull();
    expect(snapshot.ops).not.toBeNull();
    expect(snapshot.chrome).not.toBeNull();
    expect(snapshot.timelineOps).not.toBeNull();

    const runtime = snapshot.runtime!;
    const initial = snapshot.data!.data!;
    const initialProviderTimeline = await runtime.provider.loadTimeline(runtime.timelineId);
    const initialProviderRegistry = await runtime.provider.loadAssetRegistry(runtime.timelineId);
    const initialDocument = JSON.stringify(documentView(initial));
    const initialVersion = initial.configVersion;
    const initialCheckpointIds = snapshot.chrome!.checkpoints.map(({ id }) => id);
    const candidateEntry = {
      ...Object.values(initial.registry.assets)[0],
      file: '/candidate-only.mp4',
    };
    const alteredConfig = structuredClone(initial.resolvedConfig);
    alteredConfig.output.file = 'candidate-only.mp4';
    alteredConfig.clips[0].at += 0.25;

    // The mounted authoring route uses the full-config mutation path. It is
    // intentionally a no-op at the shared whole-timeline editability guard.
    act(() => snapshot.ops!.applyEdit({ type: 'config', resolvedConfig: alteredConfig }));

    // Registry patch/unpatch and both public command registration forms.
    await act(async () => {
      snapshot.ops!.patchRegistry('candidate-entry', candidateEntry, candidateEntry.file);
      snapshot.ops!.unpatchRegistry('first-light');
      const entryResult = await snapshot.commands!.registerAsset({
        assetId: 'candidate-command-entry',
        entry: candidateEntry,
        sourceUrl: candidateEntry.file,
      });
      expect(entryResult).toMatchObject({ ok: false, error: { code: 'timeline_read_only' } });
      const generationResult = await snapshot.commands!.registerAsset({
        assetId: 'candidate-command-generation',
        generationId: 'candidate-generation',
        variantId: 'candidate-variant',
        variantType: 'image',
        imageUrl: '/candidate-only.png',
      });
      expect(generationResult).toMatchObject({ ok: false, error: { code: 'timeline_read_only' } });
    });

    // TimelineOps guards before compilation, history writes, or persistence.
    expect(() => snapshot.timelineOps!.apply({ version: 1, operations: [] })).toThrow(/timeline edit denied/);
    expect(() => snapshot.timelineOps!.checkpoint('candidate-only')).toThrow(/timeline edit denied/);
    expect(() => snapshot.timelineOps!.rollback('candidate-only')).toThrow(/timeline edit denied/);
    // This public fixture has no audio tracks, so this convenience operation
    // correctly returns an empty diff before reaching the guarded apply path.
    expect(snapshot.timelineOps!.setAllTracksMuted(true).entries).toHaveLength(0);

    await act(async () => {
      await snapshot.chrome!.createManualCheckpoint('candidate-only');
      snapshot.chrome!.undo();
      snapshot.chrome!.redo();
    });

    // Public bundle is absent (not an explicitly persisted null/empty bundle).
    const changedBundle: TimelineBundleEnvelope = {
      schema_version: 1,
      itemsBySchemaRef: { 'astrid.example/source': [] },
    };
    await expect(runtime.provider.saveTimeline(
      runtime.timelineId,
      { ...initial.config, output: { ...initial.config.output, file: 'candidate-only.mp4' } },
      initial.configVersion,
      initial.registry,
      changedBundle,
    )).rejects.toThrow(/read only/);

    await waitFor(() => expect(snapshot.data?.data).not.toBeNull());
    const freshTimeline = await runtime.provider.loadTimeline(runtime.timelineId);
    const freshRegistry = await runtime.provider.loadAssetRegistry(runtime.timelineId);
    expect(JSON.stringify(documentView(snapshot.data!.data!))).toBe(initialDocument);
    expect(snapshot.data!.data!.configVersion).toBe(initialVersion);
    expect(Object.keys(freshTimeline)).not.toContain('bundle');
    expect(freshTimeline.config).toEqual(initialProviderTimeline.config);
    expect(freshTimeline.configVersion).toBe(initialVersion);
    expect(freshRegistry).toEqual(initialProviderRegistry);
    expect(snapshot.chrome!.checkpoints.map(({ id }) => id)).toEqual(initialCheckpointIds);
    expect(snapshot.chrome!.canUndo).toBe(false);
    expect(snapshot.chrome!.canRedo).toBe(false);

    // Mounted service census: there is no active extension/proposal, process,
    // live-data, persistence, upload, task, or export capability in this view.
    expect(snapshot.proposalRuntime).toBeNull();
    expect(runtime.extensionRuntime?.extensions ?? []).toEqual([]);
    expect(runtime.commandRegistry).toBeUndefined();
    expect(runtime.agentToolRegistry).toBeUndefined();
    expect(runtime.processManager).toBeUndefined();
    expect(runtime.liveDataRegistry).toBeUndefined();
    expect(runtime.livePermissionService).toBeUndefined();
    expect(runtime.provider.persistenceEnabled).toBe(false);
    expect(runtime.provider.uploadAsset).toBeUndefined();
    expect(runtime.provider.saveCheckpoint).toBeUndefined();
    expect(runtime.provider.createExtensionPersistenceService).toBeUndefined();
    expect(runtime.renderExportEnabled).toBe(false);
    expect(runtime.exporter).toBeNull();
  });

  it('loads a different timeline package through the same shared editor runtime', async () => {
    const snapshot: MountedSnapshot = {
      runtime: null,
      data: null,
      ops: null,
      chrome: null,
      timelineOps: null,
      proposalRuntime: null,
      commands: null,
    };

    render(
      <MemoryRouter initialEntries={['/home']}>
        <PublicAstridEditorProvider example={REPLACEMENT_PUBLIC_EXAMPLE}>
          <Capture snapshot={snapshot} />
        </PublicAstridEditorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(snapshot.data?.data).not.toBeNull());
    expect(snapshot.runtime?.timelineId).toBe('replacement-wildlife-timeline');
    expect(snapshot.data!.data!.config.clips).toMatchObject([{
      id: 'wildlife-clip-01',
      asset: 'wildlife-source-01',
      track: 'V1',
      at: 0,
      from: 0,
      to: 18,
    }]);
    expect(snapshot.data!.data!.registry.assets['wildlife-source-01']).toMatchObject({
      duration: 18,
      resolution: '1920x1080',
      fps: 24,
    });
    expect(snapshot.data!.data!.resolvedConfig.output).toMatchObject({
      resolution: '1920x1080',
      fps: 24,
      file: 'wildlife-sequence.mp4',
    });
  });
});
