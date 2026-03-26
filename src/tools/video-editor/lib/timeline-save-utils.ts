import { getConfigSignature } from '@/tools/video-editor/lib/config-utils';
import { configToRows, type TimelineData } from '@/tools/video-editor/lib/timeline-data';
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
  // Run migration first — this deduplicates tracks and clip IDs so that
  // data.config (which is what gets saved and snapshotted for undo) is
  // always clean.  configToRows calls migrateToFlatTracks internally but
  // we need the migrated config itself, not just the row output.
  const migrated = migrateToFlatTracks(config);
  const rowData = configToRows(migrated);
  const tracks = rowData.tracks;
  const resolvedConfig = {
    output: { ...migrated.output },
    tracks,
    clips: migrated.clips.map((clip) => ({
      ...clip,
      assetEntry: clip.asset ? current.resolvedConfig.registry[clip.asset] : undefined,
    })),
    registry: { ...current.resolvedConfig.registry },
  };

  return {
    config: migrated,
    configVersion: current.configVersion,
    registry: { ...current.registry },
    resolvedConfig,
    rows: rowData.rows,
    meta: rowData.meta,
    effects: rowData.effects,
    assetMap: Object.fromEntries(
      Object.entries(current.registry.assets ?? {}).map(([assetId, entry]) => [assetId, entry.file]),
    ),
    output: { ...migrated.output },
    tracks,
    clipOrder: rowData.clipOrder,
    signature: getConfigSignature(resolvedConfig),
  };
}
