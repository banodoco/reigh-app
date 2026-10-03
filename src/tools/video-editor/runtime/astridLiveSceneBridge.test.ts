import { describe, expect, it, vi } from 'vitest';
import {
  ASTRID_EDITOR_EXTENSION_CATALOG,
  ASTRID_EDITOR_EXTENSIONS,
} from '@astrid/packs/rendering/editor/catalog';
import {
  LIVE_SCENE_CLIP_TYPE_ID,
  LIVE_SCENE_EXTENSION_ID,
  liveSceneExtension,
} from '@astrid/packs/rendering/editor/live-scenes/extension';
import type {
  ExtensionContext,
  ExtensionDiagnostic,
  ExtensionDiagnosticsService,
} from '@reigh/editor-sdk';
import { devLocalExtensions } from '@/tools/video-editor/dev/localExtensions';
import { createClipTypeRegistry } from '@/tools/video-editor/clip-types/ClipTypeRegistry';
import { createClipTypeRegistrationService } from '@/tools/video-editor/runtime/clipTypeRegistrationService';
import { REVIEWED_PRODUCTION_EXTENSION_IDS } from '@/tools/video-editor/runtime/extensionReleaseControls';

describe('Astrid pack editor extension bridge', () => {
  it('discovers the declared pack entry without a second extension catalogue', () => {
    expect(ASTRID_EDITOR_EXTENSION_CATALOG).toHaveLength(1);
    expect(ASTRID_EDITOR_EXTENSION_CATALOG[0]).toMatchObject({
      packId: 'rendering',
      entryPath: 'editor/live-scenes/extension.tsx',
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
    vi.doMock('@astrid/packs/rendering/editor/live-scenes/authoring', () => {
      authoringEvaluated = true;
      return {};
    });
    try {
      const entry = await import('@astrid/packs/rendering/editor/live-scenes/extension');
      expect(entry.liveSceneExtension.manifest.contributions).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'clipType', clipTypeId: LIVE_SCENE_CLIP_TYPE_ID }),
        expect.objectContaining({ kind: 'command', command: entry.LIVE_SCENE_IMPORT_COMMAND_ID }),
      ]));
      expect(authoringEvaluated).toBe(false);
    } finally {
      vi.doUnmock('@astrid/packs/rendering/editor/live-scenes/authoring');
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
    vi.doMock('@astrid/packs/rendering/editor/live-scenes/authoring', () => {
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
      const entry = await import('@astrid/packs/rendering/editor/live-scenes/extension');
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
      vi.doUnmock('@astrid/packs/rendering/editor/live-scenes/authoring');
      vi.resetModules();
    }
  });

  it('reports a lazy authoring chunk failure after the picker returns', async () => {
    let commandHandler: (() => Promise<void>) | undefined;
    vi.resetModules();
    vi.doMock('@astrid/packs/rendering/editor/live-scenes/authoring', async () => {
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
      const entry = await import('@astrid/packs/rendering/editor/live-scenes/extension');
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
      vi.doUnmock('@astrid/packs/rendering/editor/live-scenes/authoring');
      vi.resetModules();
    }
  });

  it('does not invoke ACP authoring after disposal during lazy module load', async () => {
    let releaseLoad!: () => void;
    const loadGate = new Promise<void>((resolve) => { releaseLoad = resolve; });
    const executeLiveSceneAuthoring = vi.fn();
    vi.resetModules();
    vi.doMock('@astrid/packs/rendering/editor/live-scenes/authoring', async () => {
      await loadGate;
      return { executeLiveSceneAuthoring };
    });
    try {
      const entry = await import('@astrid/packs/rendering/editor/live-scenes/extension');
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
      vi.doUnmock('@astrid/packs/rendering/editor/live-scenes/authoring');
      vi.resetModules();
    }
  });
});
