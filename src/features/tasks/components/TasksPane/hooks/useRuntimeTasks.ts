import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_PRESETS } from '@/shared/lib/query/queryDefaults';
import { ReighRuntimeClient } from '@/integrations/runtime/client.ts';
import type {
  ManagedOutput,
  ManagedOutputExportReceipt,
  MutationResult,
  Task as RuntimeTask,
} from '@/integrations/runtime/generated.ts';
import { asRecord } from '@/shared/lib/typeCoercion';

const RUNTIME_TASK_PAGE_LIMIT = 200;
const RUNTIME_TASK_REFRESH_MS = 2_000;

export type RuntimeTaskAction = 'cancel' | 'retry';

export function runtimeTaskIsCancellable(task: Pick<RuntimeTask, 'state'>): boolean {
  return task.state === 'queued'
    || task.state === 'ready'
    || task.state === 'running'
    || task.state === 'cancel_requested'
    || task.state === 'retrying';
}

export function runtimeTaskIsRetryable(task: Pick<RuntimeTask, 'state'>): boolean {
  return task.state === 'failed' || task.state === 'cancelled';
}

export const runtimeTaskQueryKey = (projectId: string | null) =>
  ['runtime-tasks', projectId ?? '__no-project__'] as const;

export function runtimeTaskType(task: RuntimeTask): string {
  const family = runtimeTaskSpec(task).family;
  return typeof family === 'string' && family.trim().length > 0
    ? family
    : task.capability_id;
}

function runtimeTaskSpec(task: RuntimeTask): Record<string, unknown> {
  const envelope = asRecord(task.spec);
  return asRecord(envelope?.spec) ?? envelope ?? {};
}

function runtimeTaskFamily(task: RuntimeTask): string {
  const family = runtimeTaskSpec(task).family ?? task.capability_id;
  return typeof family === 'string' ? family : task.capability_id;
}

export function runtimeTaskTimelineRef(task: RuntimeTask): string | null {
  const spec = runtimeTaskSpec(task);
  const params = asRecord(spec.params) ?? asRecord(spec.inputs);
  const timelineRef = params?.timeline_ref;
  return typeof timelineRef === 'string' && timelineRef.length > 0 ? timelineRef : null;
}

export function runtimeTaskIsSelectedTimelineRender(
  task: RuntimeTask,
  timelineId: string | null,
): boolean {
  if (!timelineId || task.state !== 'succeeded') return false;
  return runtimeTaskTimelineRef(task) === timelineId
    && ['rendering.timeline_visualize', 'rendering.render', 'render_export'].includes(runtimeTaskFamily(task));
}

export function runtimeTaskStatusGroup(task: RuntimeTask): 'Processing' | 'Succeeded' | 'Failed' {
  if (runtimeTaskIsCancellable(task)) return 'Processing';
  if (task.state === 'succeeded') return 'Succeeded';
  return 'Failed';
}

export async function listAllRuntimeTasks(
  client: Pick<ReighRuntimeClient, 'listProjectTasks'>,
  projectId: string,
): Promise<RuntimeTask[]> {
  const tasks: RuntimeTask[] = [];
  let cursor: string | undefined;
  const seenCursors = new Set<string>();

  while (true) {
    const page = await client.listProjectTasks(projectId, cursor, RUNTIME_TASK_PAGE_LIMIT);
    tasks.push(...page.items);
    if (page.next_cursor === null) return tasks;
    if (seenCursors.has(page.next_cursor)) {
      throw new Error('Workspace Runtime task pagination repeated a cursor');
    }
    seenCursors.add(page.next_cursor);
    cursor = page.next_cursor;
  }
}

interface RuntimeTaskMutationInput {
  taskId: string;
  action: RuntimeTaskAction;
}

function idempotencyKey(
  projectId: string,
  taskId: string,
  action: RuntimeTaskAction,
  version: number,
): string {
  return `reigh.runtime.task.${action}:${projectId}:${taskId}:v${version}`;
}

export async function transitionRuntimeTask(
  client: Pick<ReighRuntimeClient, 'getTask' | 'cancelTask' | 'retryTask'>,
  projectId: string,
  input: RuntimeTaskMutationInput,
): Promise<MutationResult<RuntimeTask>> {
  const current = await client.getTask(input.taskId);
  if (current.project_id !== projectId) {
    throw new Error(
      `Workspace Runtime task ${input.taskId} belongs to project ${String(current.project_id)}, not ${projectId}`,
    );
  }
  if (!Number.isInteger(current.version) || current.version < 1) {
    throw new Error(`Workspace Runtime task ${input.taskId} has no positive version`);
  }

  const key = idempotencyKey(projectId, current.task_id, input.action, current.version);
  return input.action === 'cancel'
    ? client.cancelTask(current.task_id, key, current.version)
    : client.retryTask(current.task_id, key, current.version);
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

function isPlayableManagedOutput(output: ManagedOutput): boolean {
  return output.state === 'available'
    && output.object_id.startsWith('sha256:')
    && (
      output.output_port === 'video'
      || output.role === 'render'
      || output.media_type.startsWith('video/')
    );
}

function managedOutputExpectedIdentity(output: ManagedOutput): Record<string, unknown> {
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
    if (typeof provenance?.[field] === 'string') expected[field] = provenance[field];
  }
  for (const field of ['fence', 'runtime_epoch'] as const) {
    if (typeof provenance?.[field] === 'number') expected[field] = provenance[field];
  }
  return expected;
}

export async function exportSelectedRuntimeTaskOutput(
  client: Pick<ReighRuntimeClient, 'getTask' | 'listManagedOutputs' | 'exportManagedOutput'>,
  projectId: string,
  taskId: string,
  timelineId: string,
): Promise<MutationResult<ManagedOutputExportReceipt>> {
  const current = await client.getTask(taskId);
  if (current.project_id !== projectId) {
    throw new Error(
      `Workspace Runtime task ${taskId} belongs to project ${String(current.project_id)}, not ${projectId}`,
    );
  }
  if (!runtimeTaskIsSelectedTimelineRender(current, timelineId)) {
    throw new Error(`Workspace Runtime task ${taskId} is not the selected timeline render`);
  }

  const output = (await listAllRuntimeManagedOutputs(client, taskId)).find(isPlayableManagedOutput);
  if (!output) {
    throw new Error(`Workspace Runtime task ${taskId} has no available video managed output`);
  }
  return client.exportManagedOutput(
    output.association_id,
    output.filename,
    managedOutputExpectedIdentity(output),
  );
}

function mergeRuntimeTaskResults(
  current: RuntimeTask[] | undefined,
  updates: readonly RuntimeTask[],
): RuntimeTask[] | undefined {
  if (!current) return current;
  const byId = new Map(updates.map((task) => [task.task_id, task]));
  return current.map((task) => byId.get(task.task_id) ?? task);
}

export function useRuntimeTasks(projectId: string | null) {
  const client = useMemo(() => new ReighRuntimeClient(), []);
  const queryClient = useQueryClient();
  const queryKey = runtimeTaskQueryKey(projectId);

  const query = useQuery<RuntimeTask[], Error>({
    queryKey,
    queryFn: () => listAllRuntimeTasks(client, projectId!),
    enabled: Boolean(projectId),
    ...QUERY_PRESETS.realtimeBacked,
    refetchInterval: projectId ? RUNTIME_TASK_REFRESH_MS : false,
  });

  const transitionMutation = useMutation<
    MutationResult<RuntimeTask>,
    Error,
    RuntimeTaskMutationInput
  >({
    mutationFn: (input) => {
      if (!projectId) {
        throw new Error('A Runtime project is required for task mutation');
      }
      return transitionRuntimeTask(client, projectId, input);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<RuntimeTask[]>(queryKey, (current) =>
        mergeRuntimeTaskResults(current, [updated]),
      );
    },
  });

  const cancelAllMutation = useMutation<
    readonly MutationResult<RuntimeTask>[],
    Error,
    void
  >({
    mutationFn: async () => {
      if (!projectId) return [];
      const pending = (query.data ?? []).filter(runtimeTaskIsCancellable);
      return Promise.all(pending.map((task) => transitionRuntimeTask(client, projectId, {
        taskId: task.task_id,
        action: 'cancel',
      })));
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<RuntimeTask[]>(queryKey, (current) =>
        mergeRuntimeTaskResults(current, updated),
      );
    },
  });

  const exportMutation = useMutation<
    MutationResult<ManagedOutputExportReceipt>,
    Error,
    { taskId: string; timelineId: string }
  >({
    mutationFn: ({ taskId, timelineId }) => {
      if (!projectId) {
        throw new Error('A Runtime project is required for managed-output export');
      }
      return exportSelectedRuntimeTaskOutput(client, projectId, taskId, timelineId);
    },
  });

  const isTaskActionPending = (taskId: string, action: RuntimeTaskAction): boolean => (
    transitionMutation.isPending
    && transitionMutation.variables?.taskId === taskId
    && transitionMutation.variables.action === action
  );

  const isExportTaskPending = (taskId: string): boolean => (
    exportMutation.isPending && exportMutation.variables?.taskId === taskId
  );

  return {
    ...query,
    tasks: query.data ?? [],
    cancelTask: (taskId: string) => transitionMutation.mutate({ taskId, action: 'cancel' }),
    retryTask: (taskId: string) => transitionMutation.mutate({ taskId, action: 'retry' }),
    exportManagedOutput: (taskId: string, timelineId: string) =>
      exportMutation.mutate({ taskId, timelineId }),
    isExportTaskPending,
    cancelAllPending: () => cancelAllMutation.mutate(),
    isCancelAllPending: cancelAllMutation.isPending,
    isTaskActionPending,
    actionError: transitionMutation.error ?? cancelAllMutation.error ?? exportMutation.error,
    isActionPending: transitionMutation.isPending || cancelAllMutation.isPending || exportMutation.isPending,
    canCancel: runtimeTaskIsCancellable,
    canRetry: runtimeTaskIsRetryable,
  };
}
