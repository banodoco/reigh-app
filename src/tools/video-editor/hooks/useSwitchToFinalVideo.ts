import { useCallback } from 'react';
import { generateUUID } from '@/shared/lib/taskCreation/ids.ts';
import { getFinalVideoReplacementDurationContract } from '@/tools/video-editor/lib/timeline-asset-durations.ts';
import { resolveFinalVideoDurationSeconds } from '@/tools/video-editor/lib/finalVideoAssets.ts';
import { planFinalVideoGenerationAssetRegistration } from '@/tools/video-editor/lib/timeline-asset-plans.ts';
import {
  buildSwitchShotGroupToFinalVideoMutation,
  buildSwitchShotGroupToImagesMutation,
  buildUpdateShotGroupToLatestVideoMutation,
} from '@/tools/video-editor/lib/shot-group-commands.ts';
import { findGroupForTrack } from '@/tools/video-editor/lib/pinned-group-projection.ts';
import type {
  TimelineApplyEdit,
  TimelineDataRef,
} from '@/tools/video-editor/hooks/timeline-state-types.ts';
import type { TimelineCommands, AddClipCommandInput } from '@/tools/video-editor/hooks/useTimelineCommandsService.ts';
import type { TimelineProvisionedAsset } from '@/tools/video-editor/commands/provisioning.ts';
import type { PlacePreparedMediaCommand } from '@/tools/video-editor/commands/media.ts';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import type { ShotFinalVideo } from '@/tools/video-editor/hooks/useFinalVideoAvailable.ts';

interface UseSwitchToFinalVideoArgs {
  applyEdit: TimelineApplyEdit;
  dataRef: TimelineDataRef;
  finalVideoMap: Map<string, ShotFinalVideo>;
  /** Production supplies the mounted command facade; the fallback keeps the
   * hook easy to exercise in focused unit tests. */
  commands?: Pick<TimelineCommands, 'addClip'>;
  /** Kept for compatibility with older embedders; compound paths ignore them. */
  patchRegistry?: unknown;
  unpatchRegistry?: unknown;
  registerAsset?: unknown;
}

const stripUndefinedValues = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedValues) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, candidate]) => candidate !== undefined)
        .map(([key, candidate]) => [key, stripUndefinedValues(candidate)]),
    ) as T;
  }
  return value;
};

function planFinalVideoAssetRegistration(
  finalVideo: ShotFinalVideo,
  currentData: TimelineDataRef['current'],
): Promise<{
  plan: Extract<ReturnType<typeof planFinalVideoGenerationAssetRegistration>, { ok: true }>;
  assetDurationSeconds: number | null;
}> {
  return (async () => {
    const durationContract = getFinalVideoReplacementDurationContract(
      await resolveFinalVideoDurationSeconds(finalVideo, currentData?.registry.assets),
    );
    const assetKey = generateUUID();
    const plan = planFinalVideoGenerationAssetRegistration({
      assetId: assetKey,
      generationId: finalVideo.id,
      imageUrl: finalVideo.location,
      thumbUrl: finalVideo.thumbnailUrl ?? finalVideo.location,
      assetDurationSeconds: durationContract.assetDurationSeconds,
    });
    if (!plan.ok) {
      throw new Error('Failed to plan final video asset registration.');
    }
    return {
      plan,
      assetDurationSeconds: durationContract.assetDurationSeconds,
    };
  })();
}

export function useSwitchToFinalVideo({
  applyEdit,
  dataRef,
  finalVideoMap,
  commands,
}: UseSwitchToFinalVideoArgs) {
  const applyPreparedPlacement = useCallback((input: AddClipCommandInput, command: PlacePreparedMediaCommand) => {
    if (commands) {
      const result = commands.addClip(input);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return;
    }

    applyEdit({ type: 'prepared-media', command }, {
      selectedClipId: command.payload.replaceClipId,
      selectedTrackId: command.payload.trackId,
      semantic: true,
    });
  }, [applyEdit, commands]);

  const buildPreparedPlacement = useCallback((
    mutation: {
      rows: TimelineData['rows'];
      metaUpdates?: Record<string, Partial<TimelineData['meta'][string]>>;
      metaDeletes?: string[];
      pinnedShotGroupsOverride?: TimelineData['config']['pinnedShotGroups'];
    },
    preparedAsset: TimelineProvisionedAsset,
    replaceClipId?: string,
  ): { input: AddClipCommandInput; command: PlacePreparedMediaCommand } | null => {
    const generatedClipId = Object.keys(mutation.metaUpdates ?? {})[0];
    const generatedMeta = generatedClipId ? mutation.metaUpdates?.[generatedClipId] : undefined;
    const generatedAction = generatedClipId
      ? mutation.rows.flatMap((row) => row.actions).find((action) => action.id === generatedClipId)
      : undefined;
    const generatedTrackId = generatedClipId
      ? mutation.rows.find((row) => row.actions.some((action) => action.id === generatedClipId))?.id
      : undefined;
    const trackId = generatedMeta?.track ?? generatedTrackId;
    if (!generatedClipId || !trackId || !generatedAction) {
      return null;
    }

    const pinnedShotGroupsOverride = mutation.pinnedShotGroupsOverride
      ? stripUndefinedValues(mutation.pinnedShotGroupsOverride)
      : undefined;

    const payload: PlacePreparedMediaCommand['payload'] = {
      asset: preparedAsset,
      trackId,
      selectedTrackId: trackId,
      at: generatedAction.start,
      clipSpanSeconds: generatedAction.end - generatedAction.start,
      clipId: generatedClipId,
      ...(mutation.metaDeletes ? { removeClipIds: mutation.metaDeletes } : {}),
      ...(replaceClipId ? { replaceClipId } : {}),
      ...(pinnedShotGroupsOverride
        ? { pinnedShotGroupsOverride }
        : {}),
    };
    return {
      input: {
        preparedAsset,
        trackId: payload.trackId,
        time: payload.at,
        clipSpanSeconds: payload.clipSpanSeconds,
        clipId: payload.clipId,
        ...(payload.removeClipIds ? { removeClipIds: payload.removeClipIds } : {}),
        ...(payload.replaceClipId ? { replaceClipId: payload.replaceClipId } : {}),
        ...(payload.pinnedShotGroupsOverride
          ? { pinnedShotGroupsOverride: payload.pinnedShotGroupsOverride }
          : {}),
      },
      command: { type: 'place-prepared-media', payload },
    };
  }, []);

  const getTargetFingerprint = useCallback((currentData: TimelineData | null, shotId: string, rowId: string) => {
    const group = currentData?.config.pinnedShotGroups?.find((candidate) => (
      candidate.shotId === shotId && candidate.trackId === rowId
    ));
    if (!currentData || !group) return null;
    return JSON.stringify({
      group,
      clips: group.clipIds.map((clipId) => ({
        clipId,
        asset: currentData.meta[clipId]?.asset,
        action: currentData.rows.flatMap((row) => row.actions).find((action) => action.id === clipId),
      })),
    });
  }, []);

  const switchToFinalVideo = useCallback(async ({ shotId, clipIds, rowId }: { shotId: string; clipIds: string[]; rowId: string }) => {
    const finalVideo = finalVideoMap.get(shotId);
    if (!finalVideo) {
      return;
    }

    const targetFingerprint = getTargetFingerprint(dataRef.current, shotId, rowId);
    const { plan, assetDurationSeconds } = await planFinalVideoAssetRegistration(finalVideo, dataRef.current);
    if (getTargetFingerprint(dataRef.current, shotId, rowId) !== targetFingerprint) {
      return;
    }
    const mutation = buildSwitchShotGroupToFinalVideoMutation({
      currentData: dataRef.current,
      shotId,
      rowId,
      clipIds,
      assetKey: plan.assetId,
      durationSeconds: assetDurationSeconds,
    });
    if (!mutation) {
      return;
    }

    const preparedAsset: TimelineProvisionedAsset = {
      assetKey: plan.assetId,
      mediaType: 'video',
      durationSeconds: assetDurationSeconds,
      entry: plan.assetEntry,
      source: 'registered',
    };
    const placement = buildPreparedPlacement(mutation, preparedAsset);
    if (!placement) return;
    applyPreparedPlacement(placement.input, placement.command);
  }, [applyPreparedPlacement, buildPreparedPlacement, dataRef, finalVideoMap, getTargetFingerprint]);

  const updateToLatestVideo = useCallback(async ({ shotId, rowId }: { shotId: string; rowId: string }) => {
    const finalVideo = finalVideoMap.get(shotId);
    if (!finalVideo) {
      return;
    }

    const targetFingerprint = getTargetFingerprint(dataRef.current, shotId, rowId);
    const currentGroup = dataRef.current
      ? findGroupForTrack(dataRef.current.config.pinnedShotGroups ?? [], shotId, rowId, dataRef.current.rows)
      : undefined;
    const { plan, assetDurationSeconds } = await planFinalVideoAssetRegistration(finalVideo, dataRef.current);
    if (getTargetFingerprint(dataRef.current, shotId, rowId) !== targetFingerprint) {
      return;
    }
    const mutation = buildUpdateShotGroupToLatestVideoMutation({
      currentData: dataRef.current,
      shotId,
      rowId,
      assetKey: plan.assetId,
      targetGenerationId: finalVideo.id,
      durationSeconds: assetDurationSeconds,
    });
    if (!mutation) {
      return;
    }

    const replacementClipId = currentGroup?.clipIds[0];
    const preparedAsset: TimelineProvisionedAsset = {
      assetKey: plan.assetId,
      mediaType: 'video',
      durationSeconds: assetDurationSeconds,
      entry: plan.assetEntry,
      source: 'registered',
    };
    const placement = buildPreparedPlacement(mutation, preparedAsset, replacementClipId);
    if (!placement) return;
    applyPreparedPlacement(placement.input, placement.command);
  }, [applyPreparedPlacement, buildPreparedPlacement, dataRef, finalVideoMap, getTargetFingerprint]);

  const switchToImages = useCallback(({ shotId, rowId }: { shotId: string; rowId: string }) => {
    const mutation = buildSwitchShotGroupToImagesMutation({
      currentData: dataRef.current,
      shotId,
      rowId,
    });
    if (!mutation) {
      return;
    }

    applyEdit(mutation);
  }, [applyEdit, dataRef]);

  return {
    switchToFinalVideo,
    updateToLatestVideo,
    switchToImages,
  };
}
