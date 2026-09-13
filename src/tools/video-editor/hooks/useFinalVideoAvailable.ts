import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AstridLocalClient } from '@/integrations/astrid/client.ts';
import {
  ReighRuntimeClient,
  RUNTIME_BASE_URL,
} from '@/integrations/runtime/client.ts';
import type {
  ManagedOutput,
  Task as RuntimeTask,
} from '@/integrations/runtime/generated.ts';
import { asRecord } from '@/shared/lib/typeCoercion';
import { useRuntimeTasks } from '@/features/tasks/components/TasksPane/hooks/useRuntimeTasks';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import type { ShotFinalVideo } from '@/tools/travel-between-images/hooks/video/useShotFinalVideos.ts';
import { useBridgeTaskSnapshot } from '@/shared/hooks/tasks/useBridgeTaskSnapshot.ts';

export type { ShotFinalVideo };

type RuntimeFinalVideoClient = Pick<
  ReighRuntimeClient,
  'listProjectTasks' | 'getTask' | 'listManagedOutputs' | 'objectContentUrl'
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

async function listAllRuntimeManagedOutputs(
  client: Pick<ReighRuntimeClient, 'listManagedOutputs'>,
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

/** Read completed Runtime render associations without using the legacy bridge. */
export async function readRuntimeFinalVideos(
  client: RuntimeFinalVideoClient,
  projectId: string,
  taskInput?: readonly RuntimeTask[],
): Promise<Map<string, ShotFinalVideo>> {
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
  const details = await Promise.all(completedRenderTasks.map((task) => client.getTask(task.task_id)));
  const next = new Map<string, ShotFinalVideo>();

  for (const detail of details) {
    if (detail.state !== 'succeeded') continue;
    const owner = runtimeTaskOwner(detail);
    if (!owner || next.has(owner)) continue;
    const outputs = await listAllRuntimeManagedOutputs(client, detail.task_id);
    const output = outputs.find(isPlayableManagedOutput);
    if (!output) continue;
    next.set(owner, {
      id: output.object_id,
      location: client.objectContentUrl(output.object_id),
      thumbnailUrl: null,
      variantFetchGenerationId: null,
    });
  }

  return next;
}

export function useFinalVideoAvailable() {
  const runtime = useVideoEditorRuntime();
  const { shots } = runtime;
  const [taskVideos, setTaskVideos] = useState<Map<string, ShotFinalVideo>>(new Map());
  const [dismissedTaskOutputs, setDismissedTaskOutputs] = useState<ReadonlySet<string>>(new Set());
  const projectSlug = runtime.project.projectId;
  const runtimeBaseUrl = (runtime.provider as { apiBaseUrl?: string }).apiBaseUrl;
  const isRuntimeMode = runtimeBaseUrl === RUNTIME_BASE_URL;
  const taskSnapshot = useBridgeTaskSnapshot(isRuntimeMode ? [] : projectSlug ? [projectSlug] : []);
  const runtimeTasks = useRuntimeTasks(isRuntimeMode ? projectSlug : null);
  const runtimeClient = useMemo(
    () => new ReighRuntimeClient({ baseUrl: runtimeBaseUrl ?? RUNTIME_BASE_URL }),
    [runtimeBaseUrl],
  );
  const runtimeTaskFingerprint = useMemo(
    () => (runtimeTasks.data ?? []).map((task) => `${task.task_id}:${task.state}:${task.version}:${task.updated_at}`).join('|'),
    [runtimeTasks.data],
  );
  const runtimeFinalVideos = useQuery<Map<string, ShotFinalVideo>, Error>({
    queryKey: ['runtime-final-videos', runtimeBaseUrl ?? RUNTIME_BASE_URL, projectSlug ?? '__no-project__', runtimeTaskFingerprint],
    queryFn: () => readRuntimeFinalVideos(runtimeClient, projectSlug!, runtimeTasks.data),
    enabled: isRuntimeMode && Boolean(projectSlug) && runtimeTasks.data !== undefined,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
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
    const merged = new Map(shots.finalVideoMap);
    for (const [owner, video] of taskVideos) {
      if (!dismissedTaskOutputs.has(video.id)) merged.set(owner, video);
    }
    return merged;
  }, [dismissedTaskOutputs, shots.finalVideoMap, taskVideos]);

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
  };
}
