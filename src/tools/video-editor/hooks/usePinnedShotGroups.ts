import { useCallback, useEffect, useRef } from 'react';
import type { Shot } from '@/domains/generation/types';
import { buildAssetDropEdit, type UseAssetManagementResult } from '@/tools/video-editor/hooks/useAssetManagement';
import type { TimelineApplyEdit, TimelineDataRef } from '@/tools/video-editor/hooks/timeline-state-types';
import type { ClipMeta, TimelineData } from '@/tools/video-editor/lib/timeline-data';
import type { PinnedShotGroup } from '@/tools/video-editor/types';
import type { TimelineAction } from '@/tools/video-editor/types/timeline-canvas';

interface UsePinnedShotGroupsArgs {
  dataRef: TimelineDataRef;
  applyEdit: TimelineApplyEdit;
}

interface UsePinnedGroupSyncArgs extends UsePinnedShotGroupsArgs {
  data: TimelineData | null;
  shots: Shot[] | undefined;
  registerGenerationAsset: UseAssetManagementResult['registerGenerationAsset'];
  debounceMs?: number;
}

type PinnedShotGroupUpdates = Partial<Omit<PinnedShotGroup, 'shotId' | 'trackId'>>;

function getPinnedShotGroups(dataRef: TimelineDataRef) {
  return dataRef.current?.config.pinnedShotGroups;
}

function readPinnedShotGroups(dataRef: TimelineDataRef): NonNullable<ReturnType<typeof getPinnedShotGroups>> {
  return getPinnedShotGroups(dataRef) ?? [];
}

function clonePinnedShotGroup(group: PinnedShotGroup): PinnedShotGroup {
  return {
    ...group,
    clipIds: [...group.clipIds],
    imageClipSnapshot: group.imageClipSnapshot?.map((snapshot) => ({
      ...snapshot,
      meta: { ...snapshot.meta },
    })),
  };
}

function getSyncableShotImages(shot: Shot | undefined) {
  return (shot?.images ?? []).filter((image) => {
    // Only include positioned image-type generations
    const contentType = image.contentType ?? image.type ?? '';
    if (contentType.startsWith('video') || contentType === 'video') return false;
    if (image.timeline_frame == null) return false;
    return true;
  });
}

function areStringArraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getClipGenerationId(current: TimelineData, clipId: string): string | undefined {
  const assetKey = current.meta[clipId]?.asset;
  const generationId = assetKey ? current.registry.assets[assetKey]?.generationId : undefined;
  return typeof generationId === 'string' && generationId.length > 0 ? generationId : undefined;
}

function getAverageDuration(actions: TimelineAction[]) {
  if (actions.length === 0) {
    return 5;
  }

  const total = actions.reduce((sum, action) => sum + Math.max(0.05, action.end - action.start), 0);
  return total / actions.length;
}

function appendActionToTrack({
  current,
  trackId,
  action,
}: {
  current: TimelineData;
  trackId: string;
  action: TimelineAction;
}): TimelineData {
  return {
    ...current,
    rows: current.rows.map((row) => (
      row.id === trackId
        ? { ...row, actions: [...row.actions, action] }
        : row
    )),
    clipOrder: {
      ...current.clipOrder,
      [trackId]: [...(current.clipOrder[trackId] ?? []), action.id],
    },
  };
}

export function usePinnedShotGroups({
  dataRef,
  applyEdit,
}: UsePinnedShotGroupsArgs) {
  const pinGroup = useCallback((shotId: string, trackId: string, clipIds: string[]) => {
    const currentGroups = readPinnedShotGroups(dataRef);
    const nextGroup: PinnedShotGroup = {
      shotId,
      trackId,
      clipIds: [...clipIds],
      mode: 'images',
    };
    const existingIndex = currentGroups.findIndex((group) => group.shotId === shotId && group.trackId === trackId);
    const pinnedShotGroups = existingIndex < 0
      ? [...currentGroups, nextGroup]
      : currentGroups.map((group, index) => (index === existingIndex ? nextGroup : group));

    applyEdit({ type: 'pinnedShotGroups', pinnedShotGroups });
  }, [applyEdit, dataRef]);

  const unpinGroup = useCallback((shotId: string, trackId: string) => {
    const pinnedShotGroups = readPinnedShotGroups(dataRef)
      .filter((group) => group.shotId !== shotId || group.trackId !== trackId);

    applyEdit({ type: 'pinnedShotGroups', pinnedShotGroups });
  }, [applyEdit, dataRef]);

  const updatePinnedGroup = useCallback((shotId: string, trackId: string, updates: PinnedShotGroupUpdates) => {
    const pinnedShotGroups = readPinnedShotGroups(dataRef).map((group) => {
      if (group.shotId !== shotId || group.trackId !== trackId) {
        return group;
      }

      return {
        ...group,
        ...updates,
        clipIds: updates.clipIds ? [...updates.clipIds] : [...group.clipIds],
        imageClipSnapshot: updates.imageClipSnapshot
          ? updates.imageClipSnapshot.map((snapshot) => ({
              ...snapshot,
              meta: { ...snapshot.meta },
            }))
          : group.imageClipSnapshot?.map((snapshot) => ({
              ...snapshot,
              meta: { ...snapshot.meta },
            })),
      };
    });

    applyEdit({ type: 'pinnedShotGroups', pinnedShotGroups });
  }, [applyEdit, dataRef]);

  return {
    pinGroup,
    unpinGroup,
    updatePinnedGroup,
  };
}

export function usePinnedGroupSync({
  data,
  dataRef,
  applyEdit,
  shots,
  registerGenerationAsset,
  debounceMs = 300,
}: UsePinnedGroupSyncArgs) {
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const current = dataRef.current;
    const pinnedShotGroups = current?.config.pinnedShotGroups ?? [];
    if (!data || !shots || pinnedShotGroups.length === 0) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      const latest = dataRef.current;
      if (!latest) {
        return;
      }

      let workingData = latest;
      let workingPinnedShotGroups = (latest.config.pinnedShotGroups ?? []).map(clonePinnedShotGroup);
      const accumulatedMetaUpdates: Record<string, ClipMeta> = {};
      const accumulatedMetaDeletes = new Set<string>();
      let hasChanges = false;

      for (const group of workingPinnedShotGroups) {
        if (group.mode !== 'images') {
          continue;
        }

        const shot = shots.find((candidate) => candidate.id === group.shotId);
        const desiredImages = getSyncableShotImages(shot);
        const desiredGenerationIds = desiredImages
          .map((image) => image.generation_id)
          .filter((generationId): generationId is string => typeof generationId === 'string' && generationId.length > 0);
        const currentGenerationIds = group.clipIds
          .map((clipId) => getClipGenerationId(workingData, clipId))
          .filter((generationId): generationId is string => typeof generationId === 'string' && generationId.length > 0);

        if (areStringArraysEqual(currentGenerationIds, desiredGenerationIds)) {
          continue;
        }

        const targetRowIndex = workingData.rows.findIndex((row) => row.id === group.trackId);
        if (targetRowIndex < 0) {
          continue;
        }

        const targetRow = workingData.rows[targetRowIndex];
        const groupActions = targetRow.actions.filter((action) => group.clipIds.includes(action.id));
        if (groupActions.length === 0) {
          continue;
        }

        const firstGroupAction = targetRow.actions.findIndex((action) => action.id === groupActions[0]?.id);
        const lastGroupAction = targetRow.actions.findIndex((action) => action.id === groupActions[groupActions.length - 1]?.id);
        if (firstGroupAction < 0 || lastGroupAction < 0) {
          continue;
        }

        const beforeActions = targetRow.actions.slice(0, firstGroupAction);
        const afterActions = targetRow.actions.slice(lastGroupAction + 1);
        const beforeActionIds = new Set(beforeActions.map((action) => action.id));
        const afterActionIds = new Set(afterActions.map((action) => action.id));
        const originalGroupEnd = groupActions[groupActions.length - 1]?.end ?? groupActions[0].end;
        const averageDuration = getAverageDuration(groupActions);
        const groupActionById = new Map(groupActions.map((action) => [action.id, action]));
        const availableClipIds = [...group.clipIds];

        let groupWorkingData: TimelineData = {
          ...workingData,
          rows: workingData.rows.map((row, rowIndex) => (
            rowIndex === targetRowIndex
              ? { ...row, actions: [...beforeActions] }
              : row
          )),
          clipOrder: {
            ...workingData.clipOrder,
            [group.trackId]: (workingData.clipOrder[group.trackId] ?? []).filter((clipId) => beforeActionIds.has(clipId)),
          },
        };

        const nextGroupClipIds: string[] = [];
        const usedClipIds = new Set<string>();
        let cursor = groupActions[0].start;

        for (const desiredImage of desiredImages) {
          const desiredGenerationId = desiredImage.generation_id;
          if (typeof desiredGenerationId !== 'string' || desiredGenerationId.length === 0) {
            continue;
          }

          const reusableClipId = availableClipIds.find((clipId) => (
            !usedClipIds.has(clipId)
            && getClipGenerationId(workingData, clipId) === desiredGenerationId
          ));

          if (reusableClipId) {
            const sourceAction = groupActionById.get(reusableClipId);
            const duration = sourceAction
              ? Math.max(0.05, sourceAction.end - sourceAction.start)
              : averageDuration;
            const action: TimelineAction = {
              id: reusableClipId,
              start: cursor,
              end: cursor + duration,
              effectId: `effect-${reusableClipId}`,
            };
            groupWorkingData = appendActionToTrack({
              current: groupWorkingData,
              trackId: group.trackId,
              action,
            });
            nextGroupClipIds.push(reusableClipId);
            usedClipIds.add(reusableClipId);
            cursor = action.end;
            continue;
          }

          const assetKey = registerGenerationAsset({
            generationId: desiredGenerationId,
            variantType: 'image',
            imageUrl: desiredImage.imageUrl ?? desiredImage.location ?? '',
            thumbUrl: desiredImage.thumbUrl ?? desiredImage.thumbnail_url ?? desiredImage.imageUrl ?? desiredImage.location ?? '',
            metadata: {
              content_type: desiredImage.contentType ?? desiredImage.type ?? 'image/png',
            },
          });
          if (!assetKey) {
            continue;
          }

          const latestRegistryEntry = dataRef.current?.registry.assets[assetKey];
          if (latestRegistryEntry) {
            groupWorkingData = {
              ...groupWorkingData,
              registry: {
                ...groupWorkingData.registry,
                assets: {
                  ...groupWorkingData.registry.assets,
                  [assetKey]: latestRegistryEntry,
                },
              },
            };
          }

          const nextEdit = buildAssetDropEdit({
            current: groupWorkingData,
            assetKey,
            trackId: group.trackId,
            time: cursor,
          });
          if (!nextEdit) {
            continue;
          }

          Object.assign(accumulatedMetaUpdates, nextEdit.metaUpdates);
          nextGroupClipIds.push(nextEdit.clipId);
          cursor += nextEdit.duration;
          groupWorkingData = {
            ...groupWorkingData,
            rows: nextEdit.rows,
            meta: {
              ...groupWorkingData.meta,
              ...nextEdit.metaUpdates,
            },
            clipOrder: nextEdit.clipOrderOverride,
          };
        }

        const removedClipIds = group.clipIds.filter((clipId) => !nextGroupClipIds.includes(clipId));
        for (const clipId of removedClipIds) {
          accumulatedMetaDeletes.add(clipId);
        }

        const afterShift = cursor - originalGroupEnd;
        const shiftedAfterActions = afterActions.map((action) => ({
          ...action,
          start: action.start + afterShift,
          end: action.end + afterShift,
        }));
        const rebuiltRow = groupWorkingData.rows[targetRowIndex];
        const nextRows = groupWorkingData.rows.map((row, rowIndex) => (
          rowIndex === targetRowIndex
            ? { ...row, actions: [...rebuiltRow.actions, ...shiftedAfterActions] }
            : row
        ));
        const nextClipOrder = {
          ...groupWorkingData.clipOrder,
          [group.trackId]: [
            ...(groupWorkingData.clipOrder[group.trackId] ?? []),
            ...(workingData.clipOrder[group.trackId] ?? []).filter((clipId) => afterActionIds.has(clipId)),
          ],
        };

        const nextGroups = workingPinnedShotGroups.flatMap((candidate) => {
          if (candidate.shotId !== group.shotId || candidate.trackId !== group.trackId) {
            return [candidate];
          }
          if (nextGroupClipIds.length === 0) {
            return [];
          }

          return [{
            ...candidate,
            clipIds: nextGroupClipIds,
          }];
        });

        workingPinnedShotGroups = nextGroups;
        workingData = {
          ...groupWorkingData,
          rows: nextRows,
          clipOrder: nextClipOrder,
        };
        hasChanges = true;
      }

      if (!hasChanges) {
        return;
      }

      applyEdit({
        type: 'rows',
        rows: workingData.rows,
        metaUpdates: Object.keys(accumulatedMetaUpdates).length > 0 ? accumulatedMetaUpdates : undefined,
        metaDeletes: accumulatedMetaDeletes.size > 0 ? [...accumulatedMetaDeletes] : undefined,
        clipOrderOverride: workingData.clipOrder,
        pinnedShotGroupsOverride: workingPinnedShotGroups,
      });
    }, debounceMs);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [applyEdit, data, dataRef, debounceMs, registerGenerationAsset, shots]);
}
