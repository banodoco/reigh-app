import type { QueryClient } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import type { ShotGeneration } from '@/shared/hooks/useTimelineCore';
import { queryKeys } from '@/shared/lib/queryKeys';
import { persistTimelineFrameBatch } from '@/shared/lib/timelineFrameBatchPersist';
import {
  isTimelineWriteTimeoutError,
  runTimelineWriteWithTimeout,
} from '@/shared/lib/timelineWriteQueue';

type TimelineLogFn = (...args: unknown[]) => void;

function shortId(value: string | null | undefined): string | null {
  return value ? value.slice(0, 8) : null;
}

export function refetchTimelineFrameCaches(
  queryClient: QueryClient,
  shotId: string,
  projectId?: string | null,
  includeLiveTimeline = false,
) {
  queryClient.refetchQueries({ queryKey: queryKeys.generations.byShot(shotId) });
  queryClient.refetchQueries({ queryKey: queryKeys.generations.meta(shotId) });
  if (projectId) {
    queryClient.refetchQueries({ queryKey: queryKeys.shots.list(projectId) });
  }
  if (includeLiveTimeline) {
    queryClient.refetchQueries({ queryKey: queryKeys.segments.liveTimeline(shotId) });
  }
}

interface PersistSingleTimelineFrameInput {
  shotId: string;
  shotGenerationId: string;
  frame: number;
  logPrefix: string;
  log: TimelineLogFn;
}

export async function persistSingleTimelineFrame({
  shotId,
  shotGenerationId,
  frame,
  logPrefix,
  log,
}: PersistSingleTimelineFrameInput): Promise<void> {
  await runTimelineWriteWithTimeout(
    'timeline-frame-single-update-write',
    async (signal) => {
      const query = supabase().from('shot_generations')
        .update({ timeline_frame: frame })
        .eq('id', shotGenerationId)
        .eq('shot_id', shotId);
      const request = 'abortSignal' in query
        ? query.abortSignal(signal)
        : query;
      const { error } = await request;
      if (error) {
        throw error;
      }
    },
    {
      onTimeout: ({ pendingMs, timeoutMs }) => {
        log(`${logPrefix} updateTimelineFrame timed out`, {
          shotId: shortId(shotId),
          shotGenerationId: shortId(shotGenerationId),
          targetFrame: frame,
          timeoutMs,
          pendingMs,
        });
      },
    },
  );
}

export interface CanonicalTimelineFrameUpdate {
  shotGenerationId: string;
  generationId: string;
  newFrame: number;
}

interface BuildCanonicalUpdatesInput {
  updates: Array<{ shotGenerationId: string; newFrame: number }>;
  shotGenerations: ShotGeneration[];
}

export function buildCanonicalTimelineUpdates({
  updates,
  shotGenerations,
}: BuildCanonicalUpdatesInput): CanonicalTimelineFrameUpdate[] {
  return updates
    .map(({ shotGenerationId, newFrame }) => {
      const shotGen = shotGenerations.find((sg) => sg.id === shotGenerationId);
      if (!shotGen?.id || !shotGen.generation_id) {
        return null;
      }
      return {
        shotGenerationId: shotGen.id,
        generationId: shotGen.generation_id,
        newFrame,
      } satisfies CanonicalTimelineFrameUpdate;
    })
    .filter((update): update is CanonicalTimelineFrameUpdate => update !== null);
}

export interface TimelineFrameBatchUpdate {
  shotGenerationId: string;
  timelineFrame: number;
}

interface PersistTimelineFrameBatchUpdatesInput {
  shotId: string;
  updates: TimelineFrameBatchUpdate[];
  operationLabel: string;
  timeoutOperationName: string;
  dragSource: 'batch-exchange' | 'batch-midpoint';
  logPrefix: string;
  log: TimelineLogFn;
}

export async function persistTimelineFrameBatchUpdates({
  shotId,
  updates,
  operationLabel,
  timeoutOperationName,
  dragSource,
  logPrefix,
  log,
}: PersistTimelineFrameBatchUpdatesInput): Promise<void> {
  await persistTimelineFrameBatch({
    shotId,
    updates: updates.map((update) => ({
      shotGenerationId: update.shotGenerationId,
      timelineFrame: update.timelineFrame,
      metadata: {
        user_positioned: true,
        drag_source: dragSource,
      },
    })),
    operationLabel,
    timeoutOperationName,
    logPrefix,
    log,
  });
}

interface SyncTimelineGenerationFramesInput {
  shotId: string;
  targets: Array<{ generationId: string; frame: number }>;
  syncShotData: (generationId: string, targetShotId: string, frame: number) => Promise<void>;
  logPrefix: string;
  log: TimelineLogFn;
  ignoreTimeout?: boolean;
}

export async function syncTimelineGenerationFrames({
  shotId,
  targets,
  syncShotData,
  logPrefix,
  log,
  ignoreTimeout = false,
}: SyncTimelineGenerationFramesInput): Promise<void> {
  if (targets.length === 0) {
    return;
  }

  try {
    await runTimelineWriteWithTimeout(
      'timeline-frame-sync-shot-data',
      async () => {
        await Promise.all(
          targets.map(({ generationId, frame }) => syncShotData(generationId, shotId, frame)),
        );
      },
      {
        timeoutMs: 10_000,
        onTimeout: ({ pendingMs, timeoutMs }) => {
          log(`${logPrefix} shot_data sync timed out`, {
            shotId: shortId(shotId),
            syncCount: targets.length,
            timeoutMs,
            pendingMs,
          });
        },
      },
    );
  } catch (error) {
    if (ignoreTimeout && isTimelineWriteTimeoutError(error)) {
      log(`${logPrefix} shot_data sync timeout ignored`, {
        shotId: shortId(shotId),
        syncCount: targets.length,
      });
      return;
    }
    throw error;
  }
}
