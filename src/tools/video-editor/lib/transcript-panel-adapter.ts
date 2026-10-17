import type { DisposeHandle } from '@/sdk/dispose.ts';
import type { PanelVideoAdapter } from '@/sdk/ui.ts';
import type {
  TranscriptPanelAdapter,
  TranscriptPanelSnapshot,
  TranscriptSourceRow,
} from '@/sdk/video/transcript.ts';
import { TRANSCRIPT_SCHEMA_REF } from '../data/typed/adaptTranscript.ts';
import {
  getTranscriptPlaybackState,
  projectTranscriptOccurrences,
  seekTranscriptTarget,
  selectTranscriptSource,
} from '../data/typed/transcriptProjection.ts';
import { getPlayableAssetKind } from './timeline-asset-plans.ts';
import type { TimelineData } from './timeline-data.ts';
import type { SourceFrozenDataItem } from '../data/typed/envelope.ts';
import type { CreativeAssetReadSurface } from '@/sdk/context.ts';

const EMPTY: TranscriptPanelSnapshot = Object.freeze({
  sources: Object.freeze([]),
  occurrences: Object.freeze([]),
});
/**
 * Specializes the existing panel video adapter. The caller supplies the existing
 * document store subscription; no second store/player or private preview ref.
 * Cache by immutable TimelineData identity, so corrections invalidate every
 * repeated occurrence atomically and useSyncExternalStore reads stay stable.
 */
export function createTranscriptPanelAdapter(input: {
  readonly getData: () => TimelineData | null;
  readonly getTransientItems?: () => readonly SourceFrozenDataItem[];
  readonly assets?: CreativeAssetReadSurface;
  readonly subscribe: (listener: () => void) => DisposeHandle;
  readonly video: Pick<PanelVideoAdapter, 'view' | 'seek'>;
  readonly editText?: TranscriptPanelAdapter['editText'];
  readonly importTranscript?: TranscriptPanelAdapter['importTranscript'];
  readonly project?: Pick<
    TranscriptPanelAdapter,
    | 'getTimelineLaneVisible'
    | 'setTimelineLaneVisible'
    | 'stageTextDraft'
    | 'getProjectState'
    | 'listProjectSources'
    | 'selectProjectSource'
    | 'promoteSource'
    | 'undoSource'
    | 'redoSource'
    | 'resolveSourceConflict'
    | 'refreshSources'
  >;
}): TranscriptPanelAdapter {
  let previous: TimelineData | null | undefined;
  let previousTransient: readonly SourceFrozenDataItem[] | undefined;
  let snapshot = EMPTY;
  const getSnapshot = (): TranscriptPanelSnapshot => {
    const data = input.getData();
    const transient = input.getTransientItems?.();
    if (data === previous && transient === previousTransient) return snapshot;
    previous = data;
    previousTransient = transient;
    if (!data) return (snapshot = EMPTY);
    const seen = new Set<string>();
    const projectedSources = new Set(transient?.map((item) => JSON.stringify([
      item.sourceArtifactRef.assetId, (item.payload as { sourceId?: string }).sourceId,
    ])) ?? []);
    const projectedAssets = new Set(transient?.map((item) => item.sourceArtifactRef.assetId) ?? []);
    const items = [
      ...(transient ?? []),
      ...(data.sourceItemsBySchemaRef?.[TRANSCRIPT_SCHEMA_REF] ?? []).filter((item) =>
        !(item.provenance.adapterId === 'astrid.projectTranscript' && projectedAssets.has(item.sourceArtifactRef.assetId)) && !projectedSources.has(JSON.stringify([
          item.sourceArtifactRef.assetId, (item.payload as { sourceId?: string }).sourceId,
        ]))),
    ].filter((item) => {
      if (
        item.schemaRef !== TRANSCRIPT_SCHEMA_REF ||
        item.domain !== 'source_seconds' ||
        seen.has(JSON.stringify([item.sourceArtifactRef.assetId, item.id]))
      )
        return false;
      seen.add(JSON.stringify([item.sourceArtifactRef.assetId, item.id]));
      return true;
    });
    const sources: TranscriptSourceRow[] = items.map((item) => {
      const payload = item.payload as Partial<TranscriptSourceRow>;
      return Object.freeze({
        sourceItemId: item.id,
        sourceId:
          typeof payload?.sourceId === 'string'
            ? payload.sourceId
            : `transcript:${item.sourceArtifactRef.assetId}`,
        assetId: item.sourceArtifactRef.assetId,
        start: item.extent.start,
        end: item.extent.end ?? item.extent.start,
        text: typeof payload?.text === 'string' ? payload.text : '',
        ...(payload.documentId
          ? {
              documentId: payload.documentId,
              documentVersion: payload.documentVersion,
            }
          : {}),
        ...(payload?.speaker !== undefined ? { speaker: payload.speaker } : {}),
        ...(Array.isArray(payload?.words) ? { words: payload.words } : {}),
      });
    });
    snapshot = Object.freeze({
      sources: Object.freeze(sources),
      occurrences: projectTranscriptOccurrences({
        sourceItems: items,
        clips: data.resolvedConfig.clips,
      }),
    });
    return snapshot;
  };
  return {
    ...input.project,
    getSnapshot,
    getMediaChoices: () => {
      const data = input.getData();
      if (!data) return [];
      const assetIds = new Set(
        data.resolvedConfig.clips.flatMap((clip) =>
          clip.asset ? [clip.asset] : [],
        ),
      );
      return [...assetIds].flatMap((assetId) => {
        const entry = data.registry?.assets[assetId];
        const kind = getPlayableAssetKind(entry);
        if (kind !== 'audio' && kind !== 'video') return [];
        return [{ assetId, kind, label: input.assets?.get(assetId)?.file || entry?.file || assetId }];
      });
    },
    ...(input.editText ? { editText: input.editText } : {}),
    ...(input.importTranscript
      ? { importTranscript: input.importTranscript }
      : {}),
    subscribe: input.subscribe,
    getPlayback: (selection) => {
      const view = input.video.view.getSnapshot();
      return getTranscriptPlaybackState({
        occurrences: getSnapshot().occurrences,
        time: view.playhead.time,
        selection,
        selectedClipIds: view.selection.selectedClipIds,
      });
    },
    selectSource: (selection, source) =>
      selectTranscriptSource(getSnapshot().occurrences, selection, source),
    seek: (target) =>
      seekTranscriptTarget(input.video, getSnapshot().occurrences, target),
  };
}
