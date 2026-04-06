import { useMemo } from 'react';
import type { Shot } from '@/domains/generation/types';
import type { TimelineConfig } from '@/tools/video-editor/types';
import type { TimelineRow } from '@/tools/video-editor/types/timeline-canvas';
const SHOT_COLORS = ['#a855f7', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#14b8a6', '#ec4899', '#84cc16'];

export interface ShotGroup {
  shotId: string;
  shotName: string;
  rowId: string;
  rowIndex: number;
  clipIds: string[];
  color: string;
  mode?: 'images' | 'video';
}

export function getShotColor(shotId: string): string {
  let hash = 0;
  for (let index = 0; index < shotId.length; index += 1) {
    hash = ((hash * 31) + shotId.charCodeAt(index)) >>> 0;
  }
  return SHOT_COLORS[hash % SHOT_COLORS.length];
}

export function useShotGroups(
  rows: TimelineRow[],
  shots: Shot[] | undefined,
  pinnedShotGroups?: TimelineConfig['pinnedShotGroups'],
): ShotGroup[] {
  return useMemo(() => {
    const rowById = new Map(rows.map((row, rowIndex) => [row.id, { row, rowIndex }]));
    const shotNameById = new Map((shots ?? []).map((shot) => [shot.id, shot.name]));

    return (pinnedShotGroups ?? [])
      .map((group) => {
        const rowEntry = rowById.get(group.trackId);
        if (!rowEntry) {
          return null;
        }

        const liveClipIds = group.clipIds.filter((clipId) => rowEntry.row.actions.some((action) => action.id === clipId));
        if (liveClipIds.length === 0) {
          return null;
        }

        return {
          shotId: group.shotId,
          shotName: shotNameById.get(group.shotId) ?? group.shotId,
          rowId: group.trackId,
          rowIndex: rowEntry.rowIndex,
          clipIds: liveClipIds,
          color: getShotColor(group.shotId),
          mode: group.mode,
        } satisfies ShotGroup;
      })
      .filter((group): group is ShotGroup => group !== null);
  }, [rows, shots, pinnedShotGroups]);
}
