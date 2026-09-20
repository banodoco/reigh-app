import { useMemo } from 'react';
import { AlertCircle, Film } from 'lucide-react';
import { VideoEditorProvider } from '@/tools/video-editor/contexts/VideoEditorProvider.tsx';
import { TimelineEditorCore } from '@/tools/video-editor/components/TimelineEditor/TimelineEditorCore.tsx';
import { RemotionPreview } from '@/tools/video-editor/components/PreviewPanel/RemotionPreview.tsx';
import { projectCanonicalComposition } from '@/tools/video-editor/data/shotCompositionProjection.ts';
import { getTimelineDurationInFrames } from '@/tools/video-editor/lib/config-utils.ts';
import { useTimelinePlaybackContext } from '@/tools/video-editor/hooks/timelineStore.ts';
import { createTimelineEditability } from '@/tools/video-editor/lib/timeline-editability.ts';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';
import type { PreparedShotComposition } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import type {
  AssetRegistry,
  ResolvedTimelineConfig,
  TimelineConfig,
} from '@/tools/video-editor/types/index.ts';

type ShotTimelinePreviewProps = {
  composition: PreparedShotComposition;
  occurrenceId: string;
};

type ProjectionState = {
  config: ResolvedTimelineConfig | null;
  error: string | null;
};

function projectShotTimeline(composition: PreparedShotComposition, occurrenceId: string): ProjectionState {
  const occurrence = composition.occurrences.find((candidate) => candidate.occurrenceId === occurrenceId);
  if (!occurrence) {
    return { config: null, error: 'This shot occurrence is no longer present in the canonical timeline.' };
  }

  try {
    // The shared projection deliberately uses parent-document time so the full
    // editor can place the shot correctly. This view is shot-local, so remove
    // the occurrence offset after projection without changing any child timing
    // or asset resolution rules.
    const singleShotComposition: PreparedShotComposition = {
      ...composition,
      occurrences: [occurrence],
    };
    const projected = projectCanonicalComposition(singleShotComposition, {
      output: { resolution: '1920x1080', fps: 30, file: `shot-${occurrence.shotId}.mp4` },
      tracks: [],
      clips: [],
      registry: {},
    }).config;
    const occurrenceOffset = occurrence.atMs / 1000;
    const clips = projected.clips.map((clip) => ({
      ...clip,
      at: Math.max(0, clip.at - occurrenceOffset),
    }));
    return { config: { ...projected, clips }, error: null };
  } catch (error) {
    return {
      config: null,
      error: error instanceof Error ? error.message : 'The canonical shot timeline could not be projected.',
    };
  }
}

function createReadOnlyDataProvider(config: ResolvedTimelineConfig): DataProvider {
  const registry: AssetRegistry = {
    assets: Object.fromEntries(Object.entries(config.registry).map(([assetId, entry]) => ([assetId, {
      ...entry,
      file: entry.file ?? entry.media_id ?? entry.src,
    }]))),
  };
  const resolve = async (file: string): Promise<string> => {
    const entry = Object.values(config.registry).find((candidate) => (
      candidate.file === file || candidate.media_id === file || candidate.src === file
    ));
    return entry?.src ?? file;
  };
  const timelineConfig: TimelineConfig = {
    output: config.output,
    clips: config.clips,
    tracks: config.tracks,
    ...(config.theme ? { theme: config.theme } : {}),
    ...(config.theme_overrides ? { theme_overrides: config.theme_overrides } : {}),
    ...(config.generation_defaults ? { generation_defaults: config.generation_defaults } : {}),
    ...(config.app ? { app: config.app } : {}),
  };

  return {
    persistenceEnabled: false,
    supportsEditorSync: false,
    resolveAssetUrl: resolve,
    onResolve: async ({ file }) => resolve(file),
    loadTimeline: async () => ({ config: timelineConfig, configVersion: 1 }),
    loadAssetRegistry: async () => registry,
    saveTimeline: async () => {
      throw new Error('Shot timeline preview is read-only until canonical shot revision publishing is enabled.');
    },
  };
}

function ShotTimelineEditorSurface({ config }: { config: ResolvedTimelineConfig }) {
  const { previewRef, playerContainerRef, currentTime, onPreviewTimeUpdate } = useTimelinePlaybackContext();

  const durationSeconds = useMemo(() => {
    return getTimelineDurationInFrames(config, config.output.fps) / config.output.fps;
  }, [config]);

  return (
    <div className="space-y-3" data-shot-timeline-editor="true" data-shot-timeline-current-time={currentTime}>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="relative mx-auto aspect-video min-h-[220px] w-full max-w-[640px]">
          <RemotionPreview
            ref={previewRef}
            config={config}
            compact
            currentTime={currentTime}
            onTimeUpdate={onPreviewTimeUpdate}
            playerContainerRef={playerContainerRef}
          />
        </div>
      </div>
      <div
        className="h-44 min-h-36 overflow-hidden rounded-lg"
        data-shot-timeline-canvas="true"
        data-shot-timeline-clip-count={config.clips.length}
        data-shot-timeline-tracks={config.tracks.map((track) => `${track.id}:${track.kind}`).join('|')}
        data-shot-timeline-clip-assets={config.clips.map((clip) => `${clip.id}:${clip.track}:${clip.at}:${clip.from ?? 'no-from'}:${clip.to ?? 'no-to'}:${clip.hold ?? 'no-hold'}:${clip.clipType ?? 'media'}:${clip.asset ? 'asset' : 'no-asset'}:${clip.assetEntry?.type ?? 'unknown'}`).join('|')}
      >
        <TimelineEditorCore />
      </div>
      <div className="sr-only">Shot timeline duration {durationSeconds.toFixed(2)} seconds.</div>
    </div>
  );
}

export function ShotTimelinePreview({ composition, occurrenceId }: ShotTimelinePreviewProps) {
  const projection = useMemo(() => projectShotTimeline(composition, occurrenceId), [composition, occurrenceId]);
  const dataProvider = useMemo(
    () => projection.config ? createReadOnlyDataProvider(projection.config) : null,
    [projection.config],
  );

  if (!projection.config) {
    return (
      <section
        className="rounded-xl border border-dashed border-border bg-muted/10 p-4"
        data-shot-timeline-preview="true"
        data-shot-timeline-status="empty"
        aria-label="Shot timeline"
      >
        <div className="flex items-start gap-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 className="font-medium text-foreground">Shot timeline</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {projection.error ?? 'No internal timeline revision is available for this shot.'}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Nothing is selected as a silent fallback; author a primary visual into the shot timeline to make it render here.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="rounded-xl border border-border bg-card/50 p-3 shadow-sm"
      data-shot-timeline-preview="true"
      data-shot-timeline-status="ready"
      aria-label="Shot timeline"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Film className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium text-foreground">Shot timeline</h2>
            <p className="text-[11px] text-muted-foreground">Pinned internal timeline revision · shot-local time</p>
          </div>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{projection.config.output.fps} fps</span>
      </div>

      <VideoEditorProvider
        dataProvider={dataProvider!}
        projectId={composition.projectId}
        projectSlug={composition.projectId}
        timelineId={`${composition.parentDocumentId}:shot:${occurrenceId}`}
        timelineName="Shot timeline"
        userId={null}
        timelineEditability={createTimelineEditability({ readOnly: true })}
        extensionHostEnabled={false}
      >
        <ShotTimelineEditorSurface config={projection.config} />
      </VideoEditorProvider>
    </section>
  );
}
