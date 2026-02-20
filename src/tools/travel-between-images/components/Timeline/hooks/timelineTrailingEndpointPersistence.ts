import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { GenerationRow } from '@/types/shots';
import { runTimelineWriteWithTimeout } from '@/shared/lib/timelineWriteQueue';

interface PersistTrailingEndpointArgs {
  shotId: string;
  operationId: string;
  shotGenerations: GenerationRow[];
  logPrefix: string;
  log: (message: string, payload: Record<string, unknown>) => void;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function getLastPositionedShotGeneration(shotGenerations: GenerationRow[]): GenerationRow | null {
  const sortedShotGenerations = [...shotGenerations]
    .filter((shotGeneration) =>
      shotGeneration.timeline_frame !== null
      && shotGeneration.timeline_frame !== undefined
      && shotGeneration.timeline_frame >= 0
    )
    .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
  return sortedShotGenerations[sortedShotGenerations.length - 1] ?? null;
}

async function loadShotGenerationMetadata(
  shotGenerationId: string,
  args: PersistTrailingEndpointArgs,
  timeoutOperation: string,
  timeoutLogMessage: string,
): Promise<Record<string, unknown>> {
  const { shotId, operationId, logPrefix, log } = args;
  const current = await runTimelineWriteWithTimeout(
    timeoutOperation,
    async () => {
      const { data, error } = await supabase
        .from('shot_generations')
        .select('metadata')
        .eq('id', shotGenerationId)
        .single();
      if (error) throw error;
      return data;
    },
    {
      onTimeout: ({ pendingMs }) => {
        log(`${logPrefix} ${timeoutLogMessage}`, {
          shotId: shortId(shotId),
          operationId,
          shotGenerationId: shortId(shotGenerationId),
          pendingMs,
        });
      },
    },
  );
  return (current?.metadata as Record<string, unknown>) || {};
}

async function writeShotGenerationMetadata(
  shotGenerationId: string,
  metadata: Record<string, unknown>,
  args: PersistTrailingEndpointArgs,
  timeoutOperation: string,
  timeoutLogMessage: string,
): Promise<void> {
  const { shotId, operationId, logPrefix, log } = args;
  await runTimelineWriteWithTimeout(
    timeoutOperation,
    async (signal) => {
      const { error } = await supabase
        .from('shot_generations')
        .update({ metadata: metadata as Json })
        .eq('id', shotGenerationId)
        .abortSignal(signal);
      if (error) throw error;
    },
    {
      onTimeout: ({ pendingMs }) => {
        log(`${logPrefix} ${timeoutLogMessage}`, {
          shotId: shortId(shotId),
          operationId,
          shotGenerationId: shortId(shotGenerationId),
          pendingMs,
        });
      },
    },
  );
}

export async function setTrailingEndpointFrame(
  args: PersistTrailingEndpointArgs,
  endFrame: number,
): Promise<void> {
  const lastShotGeneration = getLastPositionedShotGeneration(args.shotGenerations);
  if (!lastShotGeneration) {
    return;
  }

  const currentMetadata = await loadShotGenerationMetadata(
    lastShotGeneration.id,
    args,
    'timeline-positions-trailing-fetch',
    'trailing metadata fetch timed out',
  );

  await writeShotGenerationMetadata(
    lastShotGeneration.id,
    { ...currentMetadata, end_frame: endFrame },
    args,
    'timeline-positions-trailing-update',
    'trailing metadata update timed out',
  );
}

export async function clearTrailingEndpointFrame(args: PersistTrailingEndpointArgs): Promise<void> {
  const lastShotGeneration = getLastPositionedShotGeneration(args.shotGenerations);
  if (!lastShotGeneration) {
    return;
  }

  const currentMetadata = await loadShotGenerationMetadata(
    lastShotGeneration.id,
    args,
    'timeline-positions-trailing-clear-fetch',
    'trailing clear metadata fetch timed out',
  );
  delete currentMetadata.end_frame;

  await writeShotGenerationMetadata(
    lastShotGeneration.id,
    currentMetadata,
    args,
    'timeline-positions-trailing-clear-update',
    'trailing clear metadata update timed out',
  );
}
