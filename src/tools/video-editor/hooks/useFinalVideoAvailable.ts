import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AstridLocalClient } from '@/integrations/astrid/client.ts';
import {
  AstridRuntimeClient,
  RUNTIME_BASE_URL,
} from '@/integrations/runtime/client.ts';
import type {
  ManagedOutput,
  ManagedOutputExportReceipt,
  Task as RuntimeTask,
} from '@/integrations/runtime/generated.ts';
import { asRecord } from '@/shared/lib/typeCoercion';
import { mapWithConcurrency } from '@/shared/lib/async/mapWithConcurrency';
import { useRuntimeTasks } from '@/features/tasks/components/TasksPane/hooks/useRuntimeTasks';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import type { ShotFinalVideo } from '@/tools/travel-between-images/hooks/video/useShotFinalVideos.ts';
import { useBridgeTaskSnapshot } from '@/shared/hooks/tasks/useBridgeTaskSnapshot.ts';
import {
  managedOutputIdentityForOccurrence,
  managedOutputMatchesOccurrence,
} from '@/tools/video-editor/data/shotCompositionProjection.ts';
import type { PreparedShotComposition } from '@/tools/video-editor/data/shotCompositionAdapter.ts';

export type { ShotFinalVideo };

export type RuntimeShotFinalVideo = ShotFinalVideo & {
  /** Runtime-owned association retained for the selected-output export action. */
  managedOutput?: ManagedOutput;
  canonicalOccurrenceId?: string;
  canonicalOutputIdentity?: string;
};

type RuntimeFinalVideoMap = Map<string, RuntimeShotFinalVideo> & {
  retryableNoOutput?: boolean;
  retryDelayMs?: number | false;
};

type RuntimeFinalVideoClient = Pick<
  AstridRuntimeClient,
  | 'listProjectTasks'
  | 'getTask'
  | 'listManagedOutputs'
  | 'objectContentUrl'
  | 'exportManagedOutput'
>;

function runtimeTaskSpec(task: RuntimeTask): Record<string, unknown> {
  const envelope = asRecord(task.spec);
  return asRecord(envelope?.spec) ?? envelope ?? {};
}

function runtimeTaskFamily(task: RuntimeTask): string | null {
  const family = runtimeTaskSpec(task).family ?? task.capability_id;
  return typeof family === 'string' && family.length > 0 ? family : null;
}

function isRenderTask(task: RuntimeTask): boolean {
  const family = runtimeTaskFamily(task);
  return family === 'rendering.timeline_visualize'
    || family === 'rendering.render'
    || family === 'render_export';
}

function runtimeTaskOwner(task: RuntimeTask): string | null {
  const spec = runtimeTaskSpec(task);
  const params = asRecord(spec.params) ?? asRecord(spec.inputs);
  const owner = params?.shot_id ?? params?.timeline_ref;
  return typeof owner === 'string' && owner.length > 0 ? owner : null;
}

function isPlayableManagedOutput(output: ManagedOutput): boolean {
  return output.state === 'available'
    && output.object_id.startsWith('sha256:')
    && (
      output.output_port === 'video'
      || output.role === 'render'
      || output.media_type.startsWith('video/')
  );
}

function isProvenNonVideoOutput(output: ManagedOutput): boolean {
  const mediaType = output.media_type.toLowerCase();
  return output.output_port !== 'video'
    && output.role !== 'render'
    && mediaType.includes('/')
    && !mediaType.startsWith('video/')
    && mediaType !== 'application/octet-stream';
}

async function listAllRuntimeManagedOutputs(
  client: Pick<AstridRuntimeClient, 'listManagedOutputs'>,
  taskId: string,
): Promise<ManagedOutput[]> {
  const outputs: ManagedOutput[] = [];
  let cursor: string | undefined;
  const seenCursors = new Set<string>();

  while (true) {
    const page = await client.listManagedOutputs(taskId, cursor, 50);
    outputs.push(...page.items);
    if (page.next_cursor === null) return outputs;
    if (seenCursors.has(page.next_cursor)) {
      throw new Error('Workspace Runtime managed-output pagination repeated a cursor');
    }
    seenCursors.add(page.next_cursor);
    cursor = page.next_cursor;
  }
}

export function getManagedOutputExportExpectedIdentity(output: ManagedOutput): Record<string, unknown> {
  const expected: Record<string, unknown> = {
    project_id: output.project_id,
    run_id: output.run_id,
    task_id: output.task_id,
    attempt_id: output.attempt_id,
    association_id: output.association_id,
    output_port: output.output_port,
    role: output.role,
    object_id: output.object_id,
    digest: output.digest,
    size: output.size,
    filename: output.filename,
    media_type: output.media_type,
  };
  const provenance = asRecord(output.provenance);
  for (const field of ['executor_id', 'lease_id'] as const) {
    if (typeof provenance?.[field] === 'string') {
      expected[field] = provenance[field];
    }
  }
  for (const field of ['fence', 'runtime_epoch'] as const) {
    if (typeof provenance?.[field] === 'number') {
      expected[field] = provenance[field];
    }
  }
  return expected;
}

export function formatManagedOutputExportReceipt(receipt: ManagedOutputExportReceipt): string {
  return [
    `export_id=${receipt.export_id}`,
    `association_id=${receipt.association_id}`,
    `object_id=${receipt.object_id}`,
    `digest=${receipt.digest}`,
    `bytes=${receipt.size}`,
    `filename=${receipt.filename}`,
    `runtime_epoch=${receipt.runtime_epoch}`,
  ].join(' · ');
}

/** Maximum Runtime detail/output requests in flight while resolving renders. */
export const FINAL_VIDEO_RESOLVE_CONCURRENCY = 4;

/**
 * A succeeded render task is immutable: its detail and managed output never
 * change. It is therefore resolved once and remembered, so a later sweep
 * fetches only tasks it has not seen.
 */
export type ResolvedRender = {
  detail: RuntimeTask;
  output: ManagedOutput | undefined;
  retryableNoOutput: boolean;
};
export type ResolvedRenderCache = Map<string, Promise<ResolvedRender>>;

const sharedResolvedRenders = new Map<string, ResolvedRenderCache>();

/** Cache shared by every consumer of the same Runtime base URL. */
export function resolvedRenderCacheFor(baseUrl: string): ResolvedRenderCache {
  let cache = sharedResolvedRenders.get(baseUrl);
  if (!cache) {
    cache = new Map();
    sharedResolvedRenders.set(baseUrl, cache);
  }
  return cache;
}

export function nextFinalVideoRetryDelay(
  retryableNoOutput: boolean,
  previousDelayMs?: number | false,
): number | false {
  if (!retryableNoOutput) return false;
  return Math.min(30_000, typeof previousDelayMs === 'number' ? previousDelayMs * 2 : 1_000);
}

/** Stable identity of what the sweep depends on: succeeded render task ids, in list order. */
export function completedRenderTaskIds(tasks: readonly RuntimeTask[] | undefined): string[] {
  return (tasks ?? [])
    .filter((task) => task.state === 'succeeded' && isRenderTask(task))
    .map((task) => task.task_id);
}

/** Read completed Runtime render associations without using the legacy bridge. */
export async function readRuntimeFinalVideos(
  client: RuntimeFinalVideoClient,
  projectId: string,
  taskInput?: readonly RuntimeTask[],
  canonicalComposition?: PreparedShotComposition | null,
  resolved: ResolvedRenderCache = new Map(),
): Promise<RuntimeFinalVideoMap> {
  const tasks = taskInput ? [...taskInput] : await (async () => {
    const listed: RuntimeTask[] = [];
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    while (true) {
      const page = await client.listProjectTasks(projectId, cursor, 200);
      listed.push(...page.items);
      if (page.next_cursor === null) break;
      if (seenCursors.has(page.next_cursor)) {
        throw new Error('Workspace Runtime task pagination repeated a cursor');
      }
      seenCursors.add(page.next_cursor);
      cursor = page.next_cursor;
    }
    return listed;
  })();

  const completedRenderTasks = tasks.filter((task) => task.state === 'succeeded' && isRenderTask(task));
  // Ownerless tasks skip the output listing outside canonical mode, so the
  // two modes must not share an entry.
  const resolveRender = (taskId: string): Promise<ResolvedRender> => {
    const cacheKey = `${canonicalComposition ? 'canonical' : 'owner'}:${taskId}`;
    const cached = resolved.get(cacheKey);
    if (cached) return cached;
    const pending = (async (): Promise<ResolvedRender> => {
      const detail = await client.getTask(taskId);
      if (detail.state !== 'succeeded') return { detail, output: undefined, retryableNoOutput: false };
      if (!runtimeTaskOwner(detail) && !canonicalComposition) {
        return { detail, output: undefined, retryableNoOutput: false };
      }
      const outputs = await listAllRuntimeManagedOutputs(client, taskId);
      const playableOutput = outputs.find(isPlayableManagedOutput);
      return {
        detail,
        output: playableOutput,
        // Retry empty, incomplete, and ambiguous listings. Only an explicit
        // non-video MIME type with no video role/port is safe to cache.
        retryableNoOutput: !playableOutput
          && (outputs.length === 0 || outputs.some((output) => !isProvenNonVideoOutput(output))),
      };
    })();
    resolved.set(cacheKey, pending);
    // An empty output listing remains retryable; any listed output (including
    // a proven non-video result) is immutable for this succeeded task.
    pending.then(
      (result) => {
        if (result.detail.state !== 'succeeded' || result.retryableNoOutput) resolved.delete(cacheKey);
      },
      () => { resolved.delete(cacheKey); },
    );
    return pending;
  };
  const renders = await mapWithConcurrency(
    completedRenderTasks,
    FINAL_VIDEO_RESOLVE_CONCURRENCY,
    (task) => resolveRender(task.task_id),
  );
  const next: RuntimeFinalVideoMap = new Map();
  Object.defineProperty(next, 'retryableNoOutput', {
    value: renders.some((render) => render.retryableNoOutput),
    writable: true,
  });

  for (const { detail, output } of renders) {
    if (detail.state !== 'succeeded') continue;
    const owner = runtimeTaskOwner(detail);
    if (!owner && !canonicalComposition) continue;
    if (!output) continue;
    const taskSpec = runtimeTaskSpec(detail);
    const taskParams = asRecord(taskSpec.params) ?? asRecord(taskSpec.inputs) ?? {};
    const canonicalOccurrence = canonicalComposition?.occurrences.find((occurrence) => (
      managedOutputMatchesOccurrence({
        ...(output as unknown as Record<string, unknown>),
        ...taskParams,
      }, occurrence)
    ));
    // Linked occurrences share shot_id but must never share a final-video
    // output. Canonical mode therefore requires occurrence-qualified output
    // metadata and drops ambiguous legacy associations.
    if (canonicalComposition && !canonicalOccurrence) continue;
    const ownerKey = canonicalOccurrence?.occurrenceId ?? owner;
    if (!ownerKey || next.has(ownerKey)) continue;
    const outputIdentity = managedOutputIdentityForOccurrence(output as unknown as Record<string, unknown>);
    next.set(ownerKey, {
      id: output.object_id,
      location: client.objectContentUrl(output.object_id),
      thumbnailUrl: null,
      variantFetchGenerationId: null,
      managedOutput: output,
      ...(canonicalOccurrence ? {
        canonicalOccurrenceId: canonicalOccurrence.occurrenceId,
        canonicalOutputIdentity: outputIdentity.outputIdentity ?? canonicalOccurrence.outputIdentity,
      } : {}),
    });
  }

  return next;
}

export function useFinalVideoAvailable() {
  const runtime = useVideoEditorRuntime();
  const { shots } = runtime;
  const canonicalComposition = runtime.userId === null ? shots.canonicalComposition : null;
  const [taskVideos, setTaskVideos] = useState<Map<string, ShotFinalVideo>>(new Map());
  const [dismissedTaskOutputs, setDismissedTaskOutputs] = useState<ReadonlySet<string>>(new Set());
  const projectSlug = runtime.project.projectId;
  const runtimeBaseUrl = (runtime.provider as { apiBaseUrl?: string }).apiBaseUrl;
  const isRuntimeMode = runtimeBaseUrl === RUNTIME_BASE_URL;
  const taskSnapshot = useBridgeTaskSnapshot(isRuntimeMode ? [] : projectSlug ? [projectSlug] : []);
  const canonicalCompositionSettled = Boolean(
    shots.canonicalComposition || shots.canonicalCompositionError,
  );
  const runtimeTasks = useRuntimeTasks(
    isRuntimeMode && canonicalCompositionSettled ? projectSlug : null,
  );
  const runtimeClient = useMemo(
    () => new AstridRuntimeClient({ baseUrl: runtimeBaseUrl ?? RUNTIME_BASE_URL }),
    [runtimeBaseUrl],
  );
  const exportRuntimeManagedOutput = useCallback(async (output: ManagedOutput) => {
    if (!isRuntimeMode) {
      throw new Error('Selected output is not a Runtime-managed output.');
    }
    return runtimeClient.exportManagedOutput(
      output.association_id,
      output.filename,
      getManagedOutputExportExpectedIdentity(output),
    );
  }, [isRuntimeMode, runtimeClient]);
  // Only succeeded render tasks feed the sweep, and they are immutable, so
  // the key is their id set. Updates to unrelated (or still-running) tasks
  // no longer invalidate it.
  const runtimeTaskFingerprint = useMemo(
    () => completedRenderTaskIds(runtimeTasks.data).join('|'),
    [runtimeTasks.data],
  );
  const runtimeFinalVideoQueryKey = [
    'runtime-final-videos',
    runtimeBaseUrl ?? RUNTIME_BASE_URL,
    projectSlug ?? '__no-project__',
    canonicalComposition?.headRevisionId ?? '__no-canonical-head__',
    runtimeTaskFingerprint,
  ] as const;
  const runtimeFinalVideos = useQuery<RuntimeFinalVideoMap, Error>({
    // Canonical output ownership is pinned to the same immutable parent head
    // as the editor/player graph. A head advance must invalidate this cache
    // even when the underlying render-task list is unchanged.
    queryKey: runtimeFinalVideoQueryKey,
    queryFn: async ({ client: queryClient }) => {
      const previous = queryClient.getQueryData<RuntimeFinalVideoMap>(runtimeFinalVideoQueryKey);
      const next = await readRuntimeFinalVideos(
        runtimeClient,
        projectSlug!,
        runtimeTasks.data,
        canonicalComposition,
        resolvedRenderCacheFor(runtimeBaseUrl ?? RUNTIME_BASE_URL),
      );
      next.retryDelayMs = nextFinalVideoRetryDelay(
        next.retryableNoOutput ?? false,
        previous?.retryableNoOutput ? previous.retryDelayMs : false,
      );
      return next;
    },
    enabled: isRuntimeMode && Boolean(projectSlug) && runtimeTasks.data !== undefined,
    // Task ids and the canonical head are part of the key. Keep this sweep
    // fresh for that immutable input so multiple mounted consumers share it.
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: (query) => query.state.data?.retryDelayMs ?? false,
  });

  useEffect(() => {
    if (isRuntimeMode) {
      if (runtimeFinalVideos.error) {
        runtime.telemetry.warn('[useFinalVideoAvailable] Runtime render hydration failed', runtimeFinalVideos.error);
      }
      setTaskVideos(runtimeFinalVideos.data ?? new Map());
      return;
    }
    if (!projectSlug || !taskSnapshot.data) return;
    let disposed = false;
    const bridgeBaseUrl = runtimeBaseUrl;
    const client = new AstridLocalClient({ projectSlug, baseUrl: bridgeBaseUrl });

    const hydrateOutputs = async () => {
      try {
        const renderTasks = taskSnapshot.data.filter((task) =>
          task.taskType === 'rendering.timeline_visualize'
          || task.taskType === 'rendering.render'
          || task.taskType === 'render_export',
        );
        const details = await Promise.all(renderTasks.map((task) => client.tasks.get(task.id)));
        if (disposed) return;
        const next = new Map<string, ShotFinalVideo>();
        for (const detail of details) {
          if (detail.status !== 'succeeded') continue;
          const output = (detail.outputs ?? []).find((candidate) => candidate.role === 'render')
            ?? (detail.outputs ?? []).find((candidate) => candidate.is_primary)
            ?? detail.outputs?.[0];
          if (!output) continue;
          const params = detail.spec?.params ?? {};
          const owner = typeof params.shot_id === 'string'
            ? params.shot_id
            : typeof params.timeline_ref === 'string'
              ? params.timeline_ref
              : null;
          if (!owner || next.has(owner)) continue;
          next.set(owner, {
            id: output.media_id,
            location: client.media.contentUrl(output.media_id),
            thumbnailUrl: null,
            variantFetchGenerationId: null,
          });
        }
        setTaskVideos(next);
      } catch (error) {
        runtime.telemetry.warn('[useFinalVideoAvailable] Astrid render hydration failed', error);
      }
    };

    void hydrateOutputs();
    return () => {
      disposed = true;
    };
  }, [isRuntimeMode, projectSlug, runtimeBaseUrl, runtime.telemetry, runtimeFinalVideos.data, runtimeFinalVideos.error, taskSnapshot.data]);

  const finalVideoMap = useMemo(() => {
    const merged = new Map<string, RuntimeShotFinalVideo>();
    for (const [owner, video] of taskVideos) {
      if (!dismissedTaskOutputs.has(video.id)) merged.set(owner, video);
    }
    if (!canonicalComposition) {
      for (const [owner, video] of shots.finalVideoMap) {
        merged.set(owner, video);
      }
    }
    return merged;
  }, [canonicalComposition, dismissedTaskOutputs, shots.finalVideoMap, taskVideos]);

  const dismissFinalVideo = useCallback((finalVideoId: string) => {
    if (Array.from(taskVideos.values()).some((video) => video.id === finalVideoId)) {
      setDismissedTaskOutputs((current) => new Set(current).add(finalVideoId));
      return;
    }
    shots.dismissFinalVideo(finalVideoId);
  }, [shots, taskVideos]);

  return {
    finalVideoMap,
    dismissFinalVideo,
    exportRuntimeManagedOutput,
  };
}
