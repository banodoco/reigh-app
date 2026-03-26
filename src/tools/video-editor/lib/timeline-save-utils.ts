import { assembleTimelineData, type TimelineData } from '@/tools/video-editor/lib/timeline-data';
import { migrateToFlatTracks } from '@/tools/video-editor/lib/migrate';
import type { TimelineConfig } from '@/tools/video-editor/types';

export function shouldAcceptPolledData(
  editSeq: number,
  savedSeq: number,
  polledSig: string,
  lastSavedSig: string,
): boolean {
  if (savedSeq < editSeq) {
    return false;
  }

  return polledSig !== lastSavedSig;
}

export function buildDataFromCurrentRegistry(
  config: TimelineConfig,
  current: TimelineData,
): TimelineData {
  // Run migration first so the saved/snapshotted config stays canonical.
  const migratedConfig = migrateToFlatTracks(config);
  migratedConfig.tracks = migratedConfig.tracks ?? [];
  const resolvedConfig = {
    output: { ...migratedConfig.output },
    tracks: migratedConfig.tracks,
    clips: migratedConfig.clips.map((clip) => ({
      ...clip,
      assetEntry: clip.asset ? current.resolvedConfig.registry[clip.asset] : undefined,
    })),
    registry: current.resolvedConfig.registry,
  };

  return assembleTimelineData({
    config: migratedConfig,
    configVersion: current.configVersion,
    registry: current.registry,
    resolvedConfig,
    assetMap: Object.fromEntries(
      Object.entries(current.registry.assets ?? {}).map(([assetId, entry]) => [assetId, entry.file]),
    ),
    output: { ...migratedConfig.output },
  });
}
