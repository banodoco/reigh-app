import { useMemo } from 'react';
import type { Shot } from '@/domains/generation/types';
import type { ClipMeta } from '@/tools/video-editor/lib/timeline-data';
import type { AssetRegistry, TimelineConfig } from '@/tools/video-editor/types';
import type { TimelineAction, TimelineRow } from '@/tools/video-editor/types/timeline-canvas';

const MAX_GAP_SECONDS = 0.5;
const SHOT_COLORS = ['#a855f7', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#14b8a6', '#ec4899', '#84cc16'];

export interface ShotGroup {
  shotId: string;
  shotName: string;
  rowId: string;
  rowIndex: number;
  clipIds: string[];
  color: string;
  isPinned?: boolean;
  mode?: 'images' | 'video';
}

export function getShotColor(shotId: string): string {
  let hash = 0;

  for (let index = 0; index < shotId.length; index += 1) {
    hash = ((hash * 31) + shotId.charCodeAt(index)) >>> 0;
  }

  return SHOT_COLORS[hash % SHOT_COLORS.length];
}

function flushGroup(groups: ShotGroup[], group: ShotGroup | null, minClips: number = 2) {
  if (group && group.clipIds.length >= minClips) {
    groups.push(group);
  }
}

function sortActions(actions: TimelineAction[]) {
  return [...actions].sort((left, right) => left.start - right.start || left.end - right.end || left.id.localeCompare(right.id));
}

export function useShotGroups(
  rows: TimelineRow[],
  meta: Record<string, ClipMeta>,
  registry: AssetRegistry,
  shots: Shot[] | undefined,
  finalVideoShotIds?: Set<string>,
  pinnedShotGroups?: TimelineConfig['pinnedShotGroups'],
): ShotGroup[] {
  return useMemo(() => {
    if (rows.length === 0) {
      return [];
    }

    const clipGenerationIds = new Map<string, string>();
    for (const row of rows) {
      for (const action of row.actions) {
        const assetKey = meta[action.id]?.asset;
        if (!assetKey) continue;
        const entry = registry.assets[assetKey];
        if (!entry?.generationId || typeof entry.generationId !== 'string' || entry.generationId.length === 0) continue;
        // Exclude video clips from inferred grouping — only images should auto-group
        if (entry.type?.startsWith('video/')) continue;
        clipGenerationIds.set(action.id, entry.generationId);
      }
    }

    const shotNameById = new Map<string, string>(
      (shots ?? []).map((shot) => [shot.id, shot.name]),
    );
    const pinnedGroups: ShotGroup[] = (pinnedShotGroups ?? [])
      .map((group) => {
        const rowIndex = rows.findIndex((row) => row.id === group.trackId);
        if (rowIndex < 0) {
          return null;
        }

        const liveClipIds = group.clipIds.filter((clipId) => rows[rowIndex]?.actions.some((action) => action.id === clipId));
        if (liveClipIds.length === 0) {
          return null;
        }

        return {
          shotId: group.shotId,
          shotName: shotNameById.get(group.shotId) ?? group.shotId,
          rowId: group.trackId,
          rowIndex,
          clipIds: liveClipIds,
          color: getShotColor(group.shotId),
          isPinned: true,
          mode: group.mode,
        } satisfies ShotGroup;
      })
      .filter((group): group is ShotGroup => group !== null);
    const pinnedClipIdSets = pinnedGroups.map((group) => new Set(group.clipIds));

    if (!shots?.length) {
      return pinnedGroups;
    }

    const groups: ShotGroup[] = [];
    const sortedRowActions = rows.map((row) => sortActions(row.actions));

    for (const shot of shots) {
      const imageIndexByGenerationId = new Map<string, number>();
      for (const [imageIndex, image] of (shot.images ?? []).entries()) {
        const generationId = image.generation_id;
        if (typeof generationId === 'string' && generationId.length > 0 && !imageIndexByGenerationId.has(generationId)) {
          imageIndexByGenerationId.set(generationId, imageIndex);
        }
      }

      const hasFinalVideo = finalVideoShotIds?.has(shot.id) ?? false;
      // Allow single-image shots when they have a final video available
      if (imageIndexByGenerationId.size < 2 && !(imageIndexByGenerationId.size === 1 && hasFinalVideo)) {
        continue;
      }

      const minClips = hasFinalVideo ? 1 : 2;
      const color = getShotColor(shot.id);

      for (const [rowIndex, row] of rows.entries()) {
        let currentGroup: ShotGroup | null = null;
        let lastImageIndex = -1;
        let lastEnd = 0;

        for (const action of sortedRowActions[rowIndex]) {
          const generationId = clipGenerationIds.get(action.id);
          const imageIndex = generationId ? imageIndexByGenerationId.get(generationId) : undefined;

          if (imageIndex === undefined) {
            flushGroup(groups, currentGroup, minClips);
            currentGroup = null;
            lastImageIndex = -1;
            lastEnd = 0;
            continue;
          }

          if (!currentGroup) {
            currentGroup = {
              shotId: shot.id,
              shotName: shot.name,
              rowId: row.id,
              rowIndex,
              clipIds: [action.id],
              color,
            };
            lastImageIndex = imageIndex;
            lastEnd = action.end;
            continue;
          }

          if (action.start - lastEnd < MAX_GAP_SECONDS && imageIndex > lastImageIndex) {
            currentGroup.clipIds.push(action.id);
            lastImageIndex = imageIndex;
            lastEnd = action.end;
            continue;
          }

          flushGroup(groups, currentGroup, minClips);
          currentGroup = {
            shotId: shot.id,
            shotName: shot.name,
            rowId: row.id,
            rowIndex,
            clipIds: [action.id],
            color,
          };
          lastImageIndex = imageIndex;
          lastEnd = action.end;
        }

        flushGroup(groups, currentGroup, minClips);
      }
    }

    const inferredGroups = groups.filter((group) => !pinnedClipIdSets.some((pinnedClipIds) => (
      group.clipIds.every((clipId) => pinnedClipIds.has(clipId))
    )));

    return [...pinnedGroups, ...inferredGroups];
  }, [rows, meta, registry, shots, finalVideoShotIds, pinnedShotGroups]);
}
