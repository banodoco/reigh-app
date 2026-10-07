import { createElement, type ComponentType } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ASTRID_EDITOR_EXTENSION_CATALOG,
  ASTRID_EDITOR_EXTENSIONS,
} from '@astrid/packs/rendering/editor/catalog';
import {
  LIVE_SCENE_CLIP_TYPE_ID,
  LIVE_SCENE_EXTENSION_ID,
  liveSceneExtension,
} from '@astrid/packs/rendering/ui/live-scenes/extension';
import type {
  ExtensionContext,
  ExtensionDiagnostic,
  ExtensionDiagnosticsService,
  ExtensionCommandService,
  ProjectObjectMetadata,
  ProjectObjectStorage,
  TimelineDiff,
  TimelineOps,
  TimelineReader,
  TimelineSnapshot,
} from '@reigh/editor-sdk';
import { devLocalExtensions } from '@/tools/video-editor/dev/localExtensions';
import { createClipTypeRegistry } from '@/tools/video-editor/clip-types/ClipTypeRegistry';
import { createClipTypeRegistrationService } from '@/tools/video-editor/runtime/clipTypeRegistrationService';
import { createCommandRegistry } from '@/tools/video-editor/runtime/commandRegistry';
import { createExtensionContext } from '@/tools/video-editor/runtime/extensionContextFactory';
import { REVIEWED_PRODUCTION_EXTENSION_IDS } from '@/tools/video-editor/runtime/extensionReleaseControls';
import { createExtensionLifecycleHost } from '@/tools/video-editor/runtime/extensionLifecycle';
import { LiveSceneOperationPort } from '@/tools/video-editor/runtime/liveSceneOperationPort';

type HostClip = {
  id: string;
  track: string;
  at: number;
  clipType?: string;
  from?: number;
  to?: number;
  speed?: number;
  app?: Record<string, unknown>;
};

type PersistedEditorState = {
  version: number;
  tracks: Array<{ id: string; kind: 'visual' | 'audio'; label: string; muted: boolean }>;
  clips: HostClip[];
};

type HostProject = {
  state: PersistedEditorState;
  durableState?: PersistedEditorState;
  objects: Map<string, Uint8Array>;
  calls: string[];
  reader: TimelineReader;
  projectObjects: ProjectObjectStorage;
  timeline: TimelineOps;
};

async function digestBytes(value: Uint8Array): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', value as unknown as BufferSource);
  return `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function cloneState(value: PersistedEditorState): PersistedEditorState {
  return JSON.parse(JSON.stringify(value)) as PersistedEditorState;
}

function createHostProject(
  initial?: PersistedEditorState,
  objects = new Map<string, Uint8Array>(),
): HostProject {
  const state = initial ? cloneState(initial) : {
    version: 1,
    tracks: [{ id: 'V1', kind: 'visual' as const, label: 'V1', muted: false }],
    clips: [],
  };
  const calls: string[] = [];

  const projectObjects: ProjectObjectStorage = {
    async ingest(bytes, mediaType, filename): Promise<ProjectObjectMetadata> {
      const copy = new Uint8Array(bytes);
      const digest = await digestBytes(copy);
      objects.set(digest, copy);
      calls.push(`ingest:${filename ?? ''}`);
      return {
        object_id: digest,
        digest,
        media_type: mediaType,
        size: copy.byteLength,
        ...(filename ? { filename } : {}),
      };
    },
    async read(objectId) {
      const value = objects.get(objectId);
      if (!value) throw new Error(`Unknown project object ${objectId}`);
      calls.push(`read:${objectId}`);
      return new Uint8Array(value);
    },
  };

  const reader: TimelineReader = {
    snapshot: () => ({
      projectId: 'u05-project',
      timelineId: 'u05-timeline',
      baseVersion: state.version,
      currentVersion: state.version,
      extensionRequirements: [],
      clips: state.clips.map((clip) => ({
        ...clip,
        duration: clip.from !== undefined && clip.to !== undefined
          ? (clip.to - clip.from) / (clip.speed ?? 1)
          : 0,
        sourceOffset: clip.from,
        sourceEnd: clip.to,
        rate: clip.speed,
        managed: clip.clipType === LIVE_SCENE_CLIP_TYPE_ID,
        managedBy: clip.clipType === LIVE_SCENE_CLIP_TYPE_ID ? LIVE_SCENE_EXTENSION_ID : undefined,
        sourceRefs: [],
      })),
      tracks: state.tracks,
      assetKeys: [],
      app: {},
    } as unknown as TimelineSnapshot),
  };

  const timeline: TimelineOps = {
    validate: () => {
      calls.push('validate');
      return { valid: true, diagnostics: [] };
    },
    preview: () => ({
      diff: { version: state.version, entries: [], affectedObjectIds: [] },
      fullyPreviewable: true,
      diagnostics: [],
    }),
    apply: (patch) => {
      if (patch.version !== state.version) throw new Error('stale timeline patch');
      calls.push('apply');
      for (const operation of patch.operations) {
        const payload = (operation.payload ?? {}) as Record<string, unknown>;
        if (operation.op === 'track.add') {
          state.tracks.push({
            id: operation.target,
            kind: 'visual',
            label: String(payload.label ?? operation.target),
            muted: false,
          });
        }
        if (operation.op === 'clip.add') {
          state.clips.push({
            id: operation.target,
            track: String(payload.track),
            at: Number(payload.at),
            clipType: String(payload.clipType),
          });
        }
        if (operation.op === 'clip.update') {
          const clip = state.clips.find((candidate) => candidate.id === operation.target);
          if (clip) {
            if ('from' in payload) clip.from = Number(payload.from);
            if ('to' in payload) clip.to = Number(payload.to);
            if ('speed' in payload) clip.speed = Number(payload.speed);
            if ('app' in payload) clip.app = payload.app as Record<string, unknown>;
          }
        }
      }
      state.version += 1;
      return {
        version: state.version,
        entries: [],
        affectedObjectIds: patch.operations.map((operation) => operation.target),
      } as TimelineDiff;
    },
    flush: async () => {
      calls.push('flush');
      project.durableState = cloneState(state);
      return { version: state.version };
    },
    checkpoint: () => 'u05-checkpoint',
    rollback: () => null,
    setAllTracksMuted: () => ({ version: state.version, entries: [], affectedObjectIds: [] }),
  };

  const project: HostProject = {
    state,
    objects,
    calls,
    reader,
    projectObjects,
    timeline,
  };
  return project;
}

function mountLiveSceneHost(project: HostProject) {
  const host = createExtensionLifecycleHost();
  const commandRegistry = createCommandRegistry();
  const clipTypeRegistry = createClipTypeRegistry();
  const operationPort = new LiveSceneOperationPort();
  operationPort.setReader(project.reader);
  operationPort.setAvailable(true);

  // This is the same provider-owned disposal binding used by the real editor
  // assembly for command and clip-type contributions.
  const disposalBinding = host.onLifecycleDisposed((extensionId) => {
    commandRegistry.unregisterAll(extensionId);
    clipTypeRegistry.unregisterOwner(extensionId);
  });

  host.synchronize(ASTRID_EDITOR_EXTENSIONS, (extension) => {
    const extensionId = extension.manifest.id as string;
    for (const contribution of extension.manifest.contributions ?? []) {
      if (contribution.kind === 'command') {
        commandRegistry.ingestCommandContribution(extensionId, contribution);
      }
    }
    const diagnosticsService = host.lifecycles.get(extensionId)!.diagnosticsService;
    const commands: ExtensionCommandService = {
      registerCommand(commandId, handler, options) {
        return commandRegistry.registerCommand(extensionId, commandId, handler, options);
      },
    };
    const clipTypes = createClipTypeRegistrationService({
      extension,
      clipTypeRegistry,
      diagnosticsService,
    });
    return createExtensionContext(
      extension,
      {
        reader: project.reader,
        timeline: project.timeline,
        projectObjects: project.projectObjects,
      },
      commands,
      undefined,
      undefined,
      clipTypes,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      operationPort.registration(extensionId),
    );
  });

  return {
    host,
    commandRegistry,
    clipTypeRegistry,
    operationPort,
    dispose() {
      disposalBinding.dispose();
      host.disposeAll();
      operationPort.setAvailable(false);
    },
  };
}

async function preparedSceneBytes(): Promise<Uint8Array> {
  const html = '<html><body><div data-u05="immutable">Live scene</div></body></html>';
  const entry = new TextEncoder().encode(html);
  const manifest = { formatVersion: 1, entry: 'u05-scene.html', duration: 4, authoredFps: 30 } as const;
  return new TextEncoder().encode(JSON.stringify({
    manifest,
    entry: {
      digest: await digestBytes(entry),
      media_type: 'text/html',
      size: entry.byteLength,
      filename: manifest.entry,
    },
    assets: [],
    html,
  }));
}

describe('Astrid pack editor extension bridge', () => {
  it('discovers the declared pack entry without a second extension catalogue', () => {
    expect(ASTRID_EDITOR_EXTENSION_CATALOG).toHaveLength(1);
    expect(ASTRID_EDITOR_EXTENSION_CATALOG[0]).toMatchObject({
      packId: 'rendering',
      entryPath: 'ui/live-scenes/extension.tsx',
      extension: liveSceneExtension,
    });
    expect(ASTRID_EDITOR_EXTENSIONS).toEqual([liveSceneExtension]);
    expect(devLocalExtensions).toContain(liveSceneExtension);
    expect(REVIEWED_PRODUCTION_EXTENSION_IDS).toContain(LIVE_SCENE_EXTENSION_ID);
  });

  it('registers and disposes the pack contribution through the existing lifecycle service', () => {
    const clipTypeRegistry = createClipTypeRegistry();
    const reported: ExtensionDiagnostic[] = [];
    const diagnostics: ExtensionDiagnosticsService = {
      report(diagnostic) {
        reported.push(diagnostic);
      },
      diagnostics: reported,
    };
    const clipTypes = createClipTypeRegistrationService({
      extension: liveSceneExtension,
      clipTypeRegistry,
      diagnosticsService: diagnostics,
    });

    // The host supplies the remaining context members; this test exercises the
    // public activation seam and the real clip registration service.
    const context = {
      services: {
        diagnostics,
        i18n: { t: (key: string) => key },
      },
      clipTypes,
      liveSceneAuthoring: { register: vi.fn(() => ({ dispose: vi.fn() })) },
    } as unknown as ExtensionContext;

    const activation = liveSceneExtension.activate(context);
    expect(context.liveSceneAuthoring!.register).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
    expect(clipTypeRegistry.resolve(LIVE_SCENE_CLIP_TYPE_ID)).toMatchObject({
      clipTypeId: LIVE_SCENE_CLIP_TYPE_ID,
      ownerExtensionId: LIVE_SCENE_EXTENSION_ID,
      status: 'active',
    });

    activation.dispose();
    expect(vi.mocked(context.liveSceneAuthoring!.register).mock.results[0].value.dispose).toHaveBeenCalledOnce();
    expect(clipTypeRegistry.resolve(LIVE_SCENE_CLIP_TYPE_ID)).toBeUndefined();
    expect(reported.map(({ code }) => code)).toEqual([
      'clipTypes/registered',
      'live-scenes/registered',
      'live-scenes/disposed',
    ]);
  });

  it('keeps the authoring implementation out of extension-entry evaluation', async () => {
    let authoringEvaluated = false;
    vi.resetModules();
    vi.doMock('@astrid/packs/rendering/ui/live-scenes/authoring', () => {
      authoringEvaluated = true;
      return {};
    });
    try {
      const entry = await import('@astrid/packs/rendering/ui/live-scenes/extension');
      expect(entry.liveSceneExtension.manifest.contributions).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'clipType', clipTypeId: LIVE_SCENE_CLIP_TYPE_ID }),
        expect.objectContaining({ kind: 'command', command: entry.LIVE_SCENE_IMPORT_COMMAND_ID }),
      ]));
      expect(authoringEvaluated).toBe(false);
    } finally {
      vi.doUnmock('@astrid/packs/rendering/ui/live-scenes/authoring');
      vi.resetModules();
    }
  });

  it('registers the command eagerly and opens the native picker before lazy authoring load', async () => {
    let authoringEvaluated = false;
    let commandHandler: (() => Promise<void>) | undefined;
    const imported = {
      importPreparedSceneFile: vi.fn(async () => {}),
      defaultPreparedScenePlacement: vi.fn(() => ({ id: 'scene', track: 'V1', at: 0, from: 0, to: 1, rate: 1 })),
      importPreparedScene: vi.fn(async () => ({
        revision: 'sha256:revision',
        affectedPlacements: ['scene'],
        acknowledgedTimelineVersion: 2,
      })),
      parsePreparedScenePackage: vi.fn(async () => ({
        manifest: { formatVersion: 1, entry: 'scene.html', duration: 1, authoredFps: 30 },
        entry: { bytes: new Uint8Array(), mediaType: 'text/html', filename: 'scene.html' },
        assets: [],
      })),
    };
    vi.resetModules();
    vi.doMock('@astrid/packs/rendering/ui/live-scenes/authoring', () => {
      authoringEvaluated = true;
      return imported;
    });
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function click(this: HTMLInputElement) {
      expect(authoringEvaluated).toBe(false);
      Object.defineProperty(this, 'files', {
        configurable: true,
        value: [{ arrayBuffer: async () => new ArrayBuffer(0) }],
      });
      this.dispatchEvent(new Event('change'));
    });
    try {
      const entry = await import('@astrid/packs/rendering/ui/live-scenes/extension');
      const diagnostics: ExtensionDiagnosticsService = { report: vi.fn(), diagnostics: [] };
      const context = {
        services: { diagnostics, i18n: { t: (key: string) => key } },
        chrome: { toast: vi.fn() },
        creative: { reader: { snapshot: () => ({ clips: [] }) } },
        clipTypes: { registerClipType: vi.fn(() => ({ dispose: vi.fn() })) },
        commands: {
          registerCommand: vi.fn((_id: string, handler: () => Promise<void>) => {
            commandHandler = handler;
            return { dispose: vi.fn() };
          }),
        },
      } as unknown as ExtensionContext;

      const activation = entry.liveSceneExtension.activate(context);
      expect(commandHandler).toBeDefined();
      expect(authoringEvaluated).toBe(false);
      await commandHandler!();
      expect(imported.importPreparedSceneFile).toHaveBeenCalledOnce();
      expect(imported.parsePreparedScenePackage).not.toHaveBeenCalled();
      expect(imported.importPreparedScene).not.toHaveBeenCalled();
      activation.dispose();
    } finally {
      click.mockRestore();
      vi.doUnmock('@astrid/packs/rendering/ui/live-scenes/authoring');
      vi.resetModules();
    }
  });

  it('reports a lazy authoring chunk failure after the picker returns', async () => {
    let commandHandler: (() => Promise<void>) | undefined;
    vi.resetModules();
    vi.doMock('@astrid/packs/rendering/ui/live-scenes/authoring', async () => {
      throw new Error('authoring chunk unavailable');
    });
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function click(this: HTMLInputElement) {
      Object.defineProperty(this, 'files', {
        configurable: true,
        value: [{ arrayBuffer: async () => new ArrayBuffer(0) }],
      });
      this.dispatchEvent(new Event('change'));
    });
    try {
      const entry = await import('@astrid/packs/rendering/ui/live-scenes/extension');
      const diagnostics: ExtensionDiagnosticsService = { report: vi.fn(), diagnostics: [] };
      const context = {
        services: { diagnostics, i18n: { t: (key: string) => key } },
        chrome: { toast: vi.fn() },
        creative: { reader: { snapshot: () => ({ clips: [] }) } },
        clipTypes: { registerClipType: vi.fn(() => ({ dispose: vi.fn() })) },
        commands: {
          registerCommand: vi.fn((_id: string, handler: () => Promise<void>) => {
            commandHandler = handler;
            return { dispose: vi.fn() };
          }),
        },
      } as unknown as ExtensionContext;

      const activation = entry.liveSceneExtension.activate(context);
      await expect(commandHandler!()).rejects.toThrow();
      expect(diagnostics.report).toHaveBeenCalledWith(expect.objectContaining({
        severity: 'error', code: 'live-scenes/authoring-failed',
        detail: expect.objectContaining({ stage: 'import-prepared-scene', error: expect.any(String) }),
      }));
      expect(context.chrome!.toast).toHaveBeenCalledWith(expect.stringContaining('Prepared scene import failed:'), 'error');
      activation.dispose();
    } finally {
      click.mockRestore();
      vi.doUnmock('@astrid/packs/rendering/ui/live-scenes/authoring');
      vi.resetModules();
    }
  });

  it('does not invoke ACP authoring after disposal during lazy module load', async () => {
    let releaseLoad!: () => void;
    const loadGate = new Promise<void>((resolve) => { releaseLoad = resolve; });
    const executeLiveSceneAuthoring = vi.fn();
    vi.resetModules();
    vi.doMock('@astrid/packs/rendering/ui/live-scenes/authoring', async () => {
      await loadGate;
      return { executeLiveSceneAuthoring };
    });
    try {
      const entry = await import('@astrid/packs/rendering/ui/live-scenes/extension');
      let registeredHandler: ((request: never, execution: { signal: AbortSignal; assertActive(): void }) => Promise<unknown>) | undefined;
      let active = true;
      const registration = {
        register: vi.fn((handler) => {
          registeredHandler = handler;
          return { dispose: () => { active = false; } };
        }),
      };
      const context = {
        services: { diagnostics: { report: vi.fn() }, i18n: { t: (key: string) => key } },
        clipTypes: { registerClipType: vi.fn(() => ({ dispose: vi.fn() })) },
        liveSceneAuthoring: registration,
      } as unknown as ExtensionContext;
      const activation = entry.liveSceneExtension.activate(context);
      expect(registeredHandler).toBeDefined();

      const controller = new AbortController();
      const pending = registeredHandler!({} as never, {
        signal: controller.signal,
        assertActive: () => {
          if (!active || controller.signal.aborted) throw new Error('cancelled or disposed');
        },
      });
      activation.dispose();
      controller.abort();
      releaseLoad();

      await expect(pending).rejects.toThrow('cancelled or disposed');
      expect(executeLiveSceneAuthoring).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('@astrid/packs/rendering/ui/live-scenes/authoring');
      vi.resetModules();
    }
  });

  it('activates the catalog contribution through the real host and presents its visible renderer', async () => {
    const project = createHostProject();
    const mounted = mountLiveSceneHost(project);
    try {
      const lifecycle = mounted.host.lifecycles.get(LIVE_SCENE_EXTENSION_ID);
      expect(lifecycle?.state).toBe('active');
      expect(mounted.commandRegistry.getCommand(`${LIVE_SCENE_EXTENSION_ID}.importPreparedScene`)).toMatchObject({
        extensionId: LIVE_SCENE_EXTENSION_ID,
      });

      const record = mounted.clipTypeRegistry.resolve(LIVE_SCENE_CLIP_TYPE_ID);
      expect(record).toMatchObject({
        clipTypeId: LIVE_SCENE_CLIP_TYPE_ID,
        ownerExtensionId: LIVE_SCENE_EXTENSION_ID,
        status: 'active',
        renderability: {
          defaultRoute: 'preview',
          capabilities: expect.arrayContaining([
            expect.objectContaining({ route: 'browser-export', status: 'blocked' }),
            expect.objectContaining({ route: 'worker-export', status: 'blocked' }),
          ]),
        },
      });
      expect(typeof record?.renderer).toBe('function');

      const Renderer = record!.renderer as unknown as ComponentType<Record<string, unknown>>;
      const view = render(createElement(Renderer, {
        clipId: 'u05-visible',
        clipTypeId: LIVE_SCENE_CLIP_TYPE_ID,
        time: 0,
        sourceTime: 0,
        source: { liveScene: {} },
        width: 240,
        height: 120,
        params: {},
        live: {},
      }));
      await waitFor(() => expect(view.container.querySelector('[data-testid="astrid-live-scene-entry"]')).not.toBeNull());
      expect(view.container.querySelector('[data-testid="astrid-live-scene-entry"]')).toHaveAttribute('data-phase', 'error');
    } finally {
      cleanup();
      mounted.dispose();
    }
  });

  it('imports through the host command using shared project context and restores immutable objects after reload', async () => {
    const project = createHostProject();
    const mounted = mountLiveSceneHost(project);
    const prepared = await preparedSceneBytes();
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function click(this: HTMLInputElement) {
      Object.defineProperty(this, 'files', {
        configurable: true,
        value: [{ arrayBuffer: async () => prepared.slice().buffer }],
      });
      this.dispatchEvent(new Event('change'));
    });

    try {
      await expect(mounted.commandRegistry.executeCommand(`${LIVE_SCENE_EXTENSION_ID}.importPreparedScene`)).resolves.toBe(true);
      expect(project.calls).toEqual(expect.arrayContaining([
        'ingest:u05-scene.html',
        'ingest:scene.package.json',
        'validate',
        'apply',
        'flush',
      ]));
      expect(project.state.clips).toHaveLength(1);
      const liveScene = project.state.clips[0].app?.liveScene as {
        revision: string;
        source: { objectId: string; revision: string };
        packageBody: string;
        html: string;
      };
      expect(liveScene).toMatchObject({
        source: { objectId: expect.any(String), revision: liveScene.revision },
        html: expect.stringContaining('data-u05="immutable"'),
      });

      // The host copied bytes into immutable project storage. Mutating the
      // picker buffer after publication cannot alter the stored entry.
      prepared[0] ^= 0xff;
      const packageBody = JSON.parse(liveScene.packageBody) as {
        entry: { object_id: string };
      };
      const storedEntry = await project.projectObjects.read(packageBody.entry.object_id);
      expect(new TextDecoder().decode(storedEntry)).toContain('data-u05="immutable"');
      const durable = project.durableState;
      expect(durable).toBeDefined();

      mounted.dispose();

      // Recreate the editor host against the flushed timeline projection and
      // the same project-object store, which is the local reload boundary.
      const reloadedProject = createHostProject(durable, project.objects);
      const reloaded = mountLiveSceneHost(reloadedProject);
      try {
        const reloadedClip = reloadedProject.reader.snapshot().clips[0];
        expect(reloaded.host.lifecycles.get(LIVE_SCENE_EXTENSION_ID)?.state).toBe('active');
        expect(reloadedClip).toMatchObject({
          id: 'live-scene-import',
          clipType: LIVE_SCENE_CLIP_TYPE_ID,
          app: { liveScene: { revision: liveScene.revision } },
        });
        expect(await reloadedProject.projectObjects.read(packageBody.entry.object_id)).toEqual(storedEntry);
      } finally {
        reloaded.dispose();
      }
    } finally {
      click.mockRestore();
      cleanup();
      // The first host may already be disposed before the reload branch.
      if (mounted.host.lifecycles.size > 0) mounted.dispose();
    }
  });
});
