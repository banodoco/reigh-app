// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublicAstridEditorProvider, PUBLIC_ASTRID_READ_ONLY_EDITABILITY } from './PublicAstridEditorProvider.tsx';
import { PUBLIC_ASTRID_ELEMENT_HOST } from './astrid-public-host.tsx';
import { PUBLIC_LIGHT_STUDY_PROVIDER, PUBLIC_LIGHT_TIMELINE_ID, PublicLightStudyWriteError } from './astrid-light-study.ts';
import { LIGHT_STUDY_PUBLIC_EXAMPLE } from './content/light-study-v1/public-example.ts';
import { PUBLIC_TIMELINE_SERVICE_HOOKS } from '@/tools/video-editor/runtime/timelineHostServiceHooks.ts';

const runtimeProviderSpy = vi.fn();
vi.mock('@/tools/video-editor/contexts/EditorRuntimeProvider.tsx', () => ({
  EditorRuntimeProvider: ({children, ...props}: {children: React.ReactNode}) => {
    runtimeProviderSpy(props);
    return <>{children}</>;
  },
}));

describe('public Light study runtime boundary', () => {
  it('provides fresh document snapshots and rejects writes', async () => {
    const first = await PUBLIC_LIGHT_STUDY_PROVIDER.loadTimeline(PUBLIC_LIGHT_TIMELINE_ID);
    expect(first.configVersion).toBe(1);
    first.config.clips[0].at = 99;
    const second = await PUBLIC_LIGHT_STUDY_PROVIDER.loadTimeline(PUBLIC_LIGHT_TIMELINE_ID);
    expect(second.configVersion).toBe(1);
    expect(second.config.clips[0].at).toBe(0);
    expect(second.config.clips.map(({asset, at, to}) => ({asset, at, to}))).toEqual([
      {asset: 'first-light', at: 0, to: 8},
      {asset: 'passing-shapes', at: 8, to: 12},
      {asset: 'quiet-finish', at: 20, to: 8},
    ]);
    const registry = await PUBLIC_LIGHT_STUDY_PROVIDER.loadAssetRegistry(PUBLIC_LIGHT_TIMELINE_ID);
    expect(Object.keys(registry.assets)).toEqual(['first-light', 'passing-shapes', 'quiet-finish']);
    const firstAssetFile = registry.assets['first-light'].file;
    registry.assets['first-light'].file = 'https://external.example/replaced.mp4';
    delete registry.assets['passing-shapes'];
    const reloadedRegistry = await PUBLIC_LIGHT_STUDY_PROVIDER.loadAssetRegistry(PUBLIC_LIGHT_TIMELINE_ID);
    expect(Object.keys(reloadedRegistry.assets)).toEqual(['first-light', 'passing-shapes', 'quiet-finish']);
    expect(reloadedRegistry.assets['first-light'].file).toBe(firstAssetFile);
    for (const asset of Object.values(reloadedRegistry.assets)) {
      expect(asset.file).toMatch(/\.mp4$/);
      await expect(PUBLIC_LIGHT_STUDY_PROVIDER.resolveAssetUrl(asset.file!)).resolves.toBe(asset.file);
      expect(asset.origin).toBe('immutable-public');
    }
    await expect(PUBLIC_LIGHT_STUDY_PROVIDER.resolveAssetUrl('https://external.example/video.mp4'))
      .rejects.toThrow('no asset');
    await expect(PUBLIC_LIGHT_STUDY_PROVIDER.saveTimeline(PUBLIC_LIGHT_TIMELINE_ID, second.config, 1))
      .rejects.toBeInstanceOf(PublicLightStudyWriteError);
    expect(PUBLIC_LIGHT_STUDY_PROVIDER.persistenceEnabled).toBe(false);
    expect(PUBLIC_LIGHT_STUDY_PROVIDER.createExtensionPersistenceService).toBeUndefined();
    expect(PUBLIC_LIGHT_STUDY_PROVIDER.uploadAsset).toBeUndefined();
  });

  it('mounts the public element host and denies each editability route', () => {
    render(<PublicAstridEditorProvider example={LIGHT_STUDY_PUBLIC_EXAMPLE}><div>Light editor</div></PublicAstridEditorProvider>);
    expect(screen.getByText('Light editor')).toBeInTheDocument();
    expect(runtimeProviderSpy).toHaveBeenCalledWith(expect.objectContaining({
      astridElementHost: PUBLIC_ASTRID_ELEMENT_HOST,
      dataProvider: PUBLIC_LIGHT_STUDY_PROVIDER,
      timelineId: PUBLIC_LIGHT_TIMELINE_ID,
      timelineServices: PUBLIC_TIMELINE_SERVICE_HOOKS,
      timelineEditability: PUBLIC_ASTRID_READ_ONLY_EDITABILITY,
      enableMutationServices: false,
      enableLiveServices: false,
      enableRenderExport: false,
    }));
    const guard = PUBLIC_ASTRID_READ_ONLY_EDITABILITY;
    expect(guard.checkTimeline?.().allowed).toBe(false);
    expect(guard.check({clipId: 'light-study-01', sourceTrackId: 'V1', targetTrackId: 'V1'}).allowed).toBe(false);
    expect(guard.checkMove?.({clipId: 'light-study-01', sourceTrackId: 'V1', targetTrackId: 'V1', start: 1, duration: 1}).allowed).toBe(false);
  });
});
