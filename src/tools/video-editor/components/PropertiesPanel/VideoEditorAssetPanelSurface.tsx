import { memo, useMemo, useRef } from 'react';
import AssetPanel from '@/tools/video-editor/components/PropertiesPanel/AssetPanel.tsx';
import {
  useTimelineEditorData,
  useTimelineEditorOps,
  useTimelineStoreApiSafe,
} from '@/tools/video-editor/hooks/timelineStore.ts';
import {
  useVideoEditorAssetPanels,
  useVideoEditorPanelRegistry,
} from '@/tools/video-editor/runtime/useVideoEditorRenderContext.ts';
import { useOptionalVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import type { ContributionErrorInfo } from '@/tools/video-editor/runtime/ContributionErrorBoundary.tsx';
import { findContributionOwnerId } from '@/tools/video-editor/runtime/extensionSurface.ts';
import { ExtensionPanelHost, getPanelKey } from '@/tools/video-editor/runtime/ExtensionPanelHost';
import { bindTranscriptPanelVideo } from '@/tools/video-editor/lib/transcript-panel-binding.ts';
import { playedAssetRegistry, playedShotComposition } from '@/tools/video-editor/lib/timeline-shot-summaries.ts';
import type { PanelRenderProps, PanelVideoAdapter } from '@astrid/editor-sdk';

export interface VideoEditorAssetPanelSurfaceProps {
  includeBuiltIn?: boolean;
  /** Controlled visibility seam; selection UI/preferences belong to the shell. */
  activePanelKey?: string | null;
  video?: PanelVideoAdapter;
  settingsByPanelKey?: Readonly<Record<string, PanelRenderProps['settings']>>;
}

function VideoEditorAssetPanelSurfaceComponent({
  includeBuiltIn = true,
  activePanelKey,
  video,
  settingsByPanelKey,
}: VideoEditorAssetPanelSurfaceProps) {
  const runtime = useOptionalVideoEditorRuntime();
  const store = useTimelineStoreApiSafe();
  const view = runtime?.timelineViewStore;
  const latestRuntime = useRef(runtime);
  latestRuntime.current = runtime;
  const panelVideo = useMemo(() => {
    const base = video ?? (store && view ? {
      view,
      seek: (seconds: number) => { store.getState().ops.onClickTimeArea(seconds); },
    } : undefined);
    return base && store ? bindTranscriptPanelVideo(store, base, () => playedAssetRegistry(
      playedShotComposition(latestRuntime.current?.userId, latestRuntime.current?.shots),
      store.getState().data.data?.resolvedConfig,
    )) : base;
  }, [video, store, view]);
  const contributionIndex = runtime?.extensionRuntime?.contributionIndex;
  const assetPanels = useVideoEditorAssetPanels();
  const panelRegistry = useVideoEditorPanelRegistry();
  const panels = panelRegistry.panels
    .filter((panel) => typeof panel.render === 'function')
    .map((panel) => ({
      ...panel,
      extensionId: panel.extensionId ?? findContributionOwnerId(contributionIndex, 'panel', panel.id),
    }));
  const visiblePanelKeys = new Set(assetPanels
    .map((panel) => getPanelKey({
      ...panel,
      extensionId: panel.extensionId ?? findContributionOwnerId(contributionIndex, 'panel', panel.id),
    }))
    .filter((key) => activePanelKey === undefined || key === activePanelKey));
  const { data, preferences } = useTimelineEditorData();
  const { setAssetPanelState, uploadFiles } = useTimelineEditorOps();

  const builtInPanel = includeBuiltIn && data ? (
    <div className="rounded-xl border border-border bg-card/80 p-3">
      <AssetPanel
        assetMap={data.assetMap}
        rows={data.rows}
        meta={data.meta}
        backgroundAsset={data.output.background ?? undefined}
        showAll={preferences.assetPanel.showAll}
        showHidden={preferences.assetPanel.showHidden}
        hidden={preferences.assetPanel.hidden}
        setPanelState={setAssetPanelState}
        onUploadFiles={uploadFiles}
        registry={data.registry.assets}
      />
    </div>
  ) : null;

  if (!builtInPanel && panels.length === 0) {
    return null;
  }

  const handleContributionError = (info: ContributionErrorInfo) => {
    if (typeof console !== 'undefined') {
      console.warn(
        '[VideoEditorAssetPanelSurface] Panel error captured by boundary:',
        info,
      );
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {builtInPanel}
      <ExtensionPanelHost panels={panels} visiblePanelKeys={visiblePanelKeys} video={panelVideo} settingsByPanelKey={settingsByPanelKey} onError={handleContributionError} />
    </div>
  );
}

export const VideoEditorAssetPanelSurface = memo(VideoEditorAssetPanelSurfaceComponent);
