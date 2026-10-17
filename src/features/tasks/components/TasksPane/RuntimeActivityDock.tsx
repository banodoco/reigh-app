import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, ChevronDown, ChevronUp, CircleDot, Clock3, FileOutput, Film, Image as ImageIcon, Loader2, Lock, Music2, Pin, PinOff, RotateCcw, Square, Unlock, Video, X } from 'lucide-react';
import type { Event, ManagedOutput, Task as RuntimeTask } from '@/integrations/runtime/generated.ts';
import { AstridRuntimeClient } from '@/integrations/runtime/client.ts';
import { Button } from '@/shared/components/ui/button';
import { UI_Z_LAYERS } from '@/shared/lib/uiLayers';
import { asRecord } from '@/shared/lib/typeCoercion';
import type { AgentTaskLink } from '@/tools/video-editor/runtime/agentTaskLinks';
import {
  runtimeTaskIsCancellable,
  runtimeTaskIsRetryable,
  runtimeTaskIsSelectedTimelineRender,
  type RuntimeTaskAction,
} from './hooks/useRuntimeTasks';
import { runtimeTaskLabel, runtimeTaskModality, runtimeTaskProgress, runtimeTaskStateLabel } from './activityPresentation';

const MAX_VISIBLE_ROWS = 3;
const INSPECTOR_WIDTH = 344;

export interface RuntimeTaskInspectionRequest {
  taskId: string;
  anchor: { top: number; right: number };
}

interface RuntimeActivityDockProps {
  projectId: string;
  timelineId: string | null;
  tasks: RuntimeTask[];
  links: AgentTaskLink[];
  isLoading: boolean;
  error: Error | null;
  actionError: Error | null;
  isPinned: boolean;
  isHistoryOpen: boolean;
  onTogglePinned: () => void;
  onToggleHistory: () => void;
  onTemporaryHistoryLeave: (event: React.MouseEvent | React.FocusEvent) => void;
  onOpenHistory: () => void;
  onCancelTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
  isTaskActionPending: (taskId: string, action: RuntimeTaskAction) => boolean;
  onExportManagedOutput: (taskId: string, timelineId: string) => void;
  isExportTaskPending: (taskId: string) => boolean;
  requestedTaskInspection?: RuntimeTaskInspectionRequest | null;
  onTaskInspectionRequestHandled?: () => void;
}

interface SafeTaskEvent {
  key: string;
  label: string;
  when: string;
  detail?: string;
}

function taskSpec(task: RuntimeTask): Record<string, unknown> {
  const envelope = asRecord(task.spec);
  return asRecord(envelope?.spec) ?? envelope ?? {};
}

function delegatedParent(task: RuntimeTask): { taskId: string; attemptId?: string } | null {
  const parent = asRecord(taskSpec(task).delegated_parent);
  const taskId = parent?.parent_task_id;
  if (typeof taskId !== 'string' || !taskId) return null;
  const attemptId = parent?.parent_attempt_id;
  return { taskId, ...(typeof attemptId === 'string' && attemptId ? { attemptId } : {}) };
}

function childTasksFor(parent: RuntimeTask, tasks: RuntimeTask[], projectId: string): RuntimeTask[] {
  return tasks.filter((candidate) => {
    if (candidate.project_id !== projectId || candidate.task_id === parent.task_id) return false;
    const relationship = delegatedParent(candidate);
    if (relationship?.taskId !== parent.task_id) return false;
    return !relationship.attemptId || relationship.attemptId === parent.attempt_id;
  }).sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
}

function isExactLiveTaskLink(link: AgentTaskLink, task: RuntimeTask, projectId: string): boolean {
  return link.liveObserved
    && link.project_id === projectId
    && link.project_id === task.project_id
    && link.run_id === task.run_id
    && link.task_id === task.task_id
    && link.capability_id === task.capability_id;
}

function cleanErrorMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const message = value.trim();
  if (!message || /(?:\/Users\/|\/private\/|\/tmp\/|sha256:|lease|token|secret|credential)/i.test(message)) return undefined;
  return message.slice(0, 160);
}

function safeEvent(event: Event): SafeTaskEvent {
  const payload = asRecord(event.payload);
  const error = asRecord(payload?.error);
  const message = cleanErrorMessage(error?.message ?? payload?.message);
  const rawCode = error?.code ?? payload?.error_code;
  const code = typeof rawCode === 'string' && /^[a-z0-9._-]{1,48}$/i.test(rawCode)
    ? rawCode
    : undefined;
  const rawState = payload?.state;
  const state = typeof rawState === 'string' && ['queued', 'ready', 'running', 'cancel_requested', 'retrying', 'succeeded', 'failed', 'cancelled'].includes(rawState)
    ? rawState
    : undefined;
  const eventType = /^[a-z0-9._-]{1,64}$/i.test(event.event_type) ? event.event_type : '';
  const eventLabel = eventType
    .replace(/^(runtime\.)/i, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .slice(0, 64);
  return {
    key: `${event.sequence}:${event.event_id}`,
    label: eventLabel || 'Task updated',
    when: event.occurred_at,
    ...(message ? { detail: `${code ? `${code}: ` : ''}${message}` } : state ? { detail: `State: ${state}` } : {}),
  };
}

function safeOutputName(output: ManagedOutput): string {
  const base = output.filename.split(/[\\/]/).filter(Boolean).at(-1);
  return base?.slice(0, 100) || 'Output file';
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function TaskModalityIcon({ task }: { task: RuntimeTask }) {
  const modality = runtimeTaskModality(task);
  const className = 'h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300';
  const icon = modality === 'image' ? <ImageIcon className={className} />
    : modality === 'video' ? <Video className={className} />
      : modality === 'audio' ? <Music2 className={className} />
        : modality === 'render' ? <Film className={className} />
          : <CircleDot className={className} />;
  return <span data-task-modality={modality} aria-hidden="true">{icon}</span>;
}

function ActivityTaskInspector({
  task,
  projectId,
  allTasks,
  pinned,
  position,
  onPin,
  onClose,
  onCancelTask,
  onRetryTask,
  isTaskActionPending,
  timelineId,
  onExportManagedOutput,
  isExportTaskPending,
}: {
  task: RuntimeTask;
  projectId: string;
  allTasks: RuntimeTask[];
  pinned: boolean;
  position: { left: number; top: number };
  onPin: () => void;
  onClose: () => void;
  onCancelTask: RuntimeActivityDockProps['onCancelTask'];
  onRetryTask: RuntimeActivityDockProps['onRetryTask'];
  isTaskActionPending: RuntimeActivityDockProps['isTaskActionPending'];
  timelineId: string | null;
  onExportManagedOutput: RuntimeActivityDockProps['onExportManagedOutput'];
  isExportTaskPending: RuntimeActivityDockProps['isExportTaskPending'];
}) {
  const client = useMemo(() => new AstridRuntimeClient(), []);
  const [events, setEvents] = useState<Event[]>([]);
  const [outputs, setOutputs] = useState<ManagedOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const children = useMemo(() => childTasksFor(task, allTasks, projectId), [task, allTasks, projectId]);
  const progress = runtimeTaskProgress(task);
  const taskId = task.task_id;
  const taskState = task.state;
  const taskUpdatedAt = task.updated_at;
  const taskVersion = task.version;
  const taskIsCancellable = runtimeTaskIsCancellable(task);
  const cancelPending = isTaskActionPending(task.task_id, 'cancel');
  const retryPending = isTaskActionPending(task.task_id, 'retry');
  const exportPending = isExportTaskPending(task.task_id);
  const canExport = runtimeTaskIsSelectedTimelineRender(task, timelineId);

  useEffect(() => {
    let active = true;
    let fetching = false;
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      setLoading(true);
      setError(null);
      try {
        const [eventPage, outputPage] = await Promise.all([
          client.listTaskEvents(taskId, undefined, 40),
          client.listManagedOutputs(taskId, undefined, 50),
        ]);
        if (!active) return;
        setEvents(eventPage.items
          .filter((event) => event.aggregate_id === taskId)
          .sort((left, right) => left.sequence - right.sequence));
        setOutputs(outputPage.items.filter((output) => output.project_id === projectId && output.task_id === taskId));
      } catch (cause: unknown) {
        if (!active) return;
        setEvents([]);
        setOutputs([]);
        setError(cause instanceof Error ? cause.message.slice(0, 180) : 'Activity details are unavailable.');
      } finally {
        if (active) setLoading(false);
        fetching = false;
      }
    };

    void refresh();
    const intervalMs = taskIsCancellable ? 2_000 : 5_000;
    const interval = window.setInterval(() => { void refresh(); }, intervalMs);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [client, projectId, taskId, taskState, taskUpdatedAt, taskVersion, taskIsCancellable]);

  const rows = events.slice(-8).reverse().map(safeEvent);
  const actionError = error && /(?:\/Users\/|\/private\/|\/tmp\/|sha256:|lease|token|secret|credential)/i.test(error)
    ? 'Activity details are unavailable.'
    : error;

  return createPortal(
    <section
      className="fixed overflow-hidden rounded-xl border border-amber-300/80 bg-background/98 text-foreground shadow-2xl ring-1 ring-black/10 backdrop-blur"
      style={{ left: position.left, top: position.top, width: INSPECTOR_WIDTH, maxHeight: 'min(70vh, 560px)', zIndex: UI_Z_LAYERS.TASKS_PANE_CONTENT + 1 }}
      aria-label={`${runtimeTaskLabel(task)} activity details`}
      data-activity-inspector="true"
      data-pinned={String(pinned)}
      onMouseLeave={(event) => {
        if (!pinned && !(event.relatedTarget instanceof Element && event.relatedTarget.closest('[data-activity-task-row]'))) onClose();
      }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/70 bg-amber-50/70 px-3 py-2 dark:bg-amber-950/30">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{runtimeTaskLabel(task)}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{runtimeTaskStateLabel(task.state)}{progress ? ` · ${progress.phase}` : ''}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={pinned ? 'Unpin activity details' : 'Pin activity details'} onClick={onPin}>
            {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Close activity details" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <div className="max-h-[calc(70vh-3rem)] space-y-3 overflow-y-auto p-3 text-xs">
        {progress && <div>
          <div className="mb-1 flex items-center justify-between text-muted-foreground"><span>{progress.phase}</span><span>{Math.round(progress.percent)}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${runtimeTaskLabel(task)} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
            <div className="h-full rounded-full bg-amber-500 transition-[width] duration-300" style={{ width: `${progress.percent}%` }} />
          </div>
          {progress.current !== undefined && progress.total !== undefined && <p className="mt-1 text-muted-foreground">{progress.current} of {progress.total}</p>}
        </div>}

        <div className="flex flex-wrap gap-1.5" aria-label="Task controls">
          {runtimeTaskIsCancellable(task) && <Button variant="outline" size="sm" className="h-7 gap-1" aria-label={`Cancel ${runtimeTaskLabel(task)}`} disabled={cancelPending || retryPending} onClick={() => onCancelTask(task.task_id)}><Square className="h-3 w-3" />{cancelPending ? 'Stopping…' : 'Cancel'}</Button>}
          {runtimeTaskIsRetryable(task) && <Button variant="outline" size="sm" className="h-7 gap-1" aria-label={`Retry ${runtimeTaskLabel(task)}`} disabled={cancelPending || retryPending} onClick={() => onRetryTask(task.task_id)}><RotateCcw className="h-3 w-3" />{retryPending ? 'Retrying…' : 'Retry'}</Button>}
          {canExport && timelineId && <Button variant="outline" size="sm" className="h-7 gap-1" disabled={cancelPending || retryPending || exportPending} onClick={() => onExportManagedOutput(task.task_id, timelineId)}><FileOutput className="h-3 w-3" />{exportPending ? 'Exporting…' : 'Export render'}</Button>}
        </div>

        {children.length > 0 && <section>
          <h4 className="mb-1.5 flex items-center gap-1 font-medium"><Activity className="h-3 w-3" />Subtasks ({children.length})</h4>
          <ul className="space-y-1.5">
            {children.map((child) => <li key={child.task_id} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5"><span className="truncate">{runtimeTaskLabel(child)}</span><span className="shrink-0 text-muted-foreground">{runtimeTaskStateLabel(child.state)}</span></li>)}
          </ul>
        </section>}

        <section>
          <h4 className="mb-1.5 flex items-center gap-1 font-medium"><FileOutput className="h-3 w-3" />Results</h4>
          {outputs.length > 0 ? <ul className="space-y-1.5">{outputs.map((output) => <li key={output.association_id} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5"><span className="truncate">{safeOutputName(output)}</span><span className="shrink-0 text-muted-foreground">{/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(output.media_type) ? output.media_type : 'Result'}</span></li>)}</ul> : <p className="text-muted-foreground">{loading ? 'Checking results…' : 'No managed results yet.'}</p>}
        </section>

        <section>
          <h4 className="mb-1.5 flex items-center gap-1 font-medium"><Clock3 className="h-3 w-3" />Activity</h4>
          {loading && rows.length === 0 ? <p className="text-muted-foreground">Loading activity…</p>
            : actionError ? <p className="text-muted-foreground" role="status">{actionError}</p>
              : rows.length === 0 ? <p className="text-muted-foreground">No activity events yet.</p>
                : <ol className="space-y-1.5">{rows.map((event) => <li key={event.key} className="flex items-start justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5"><span className="min-w-0"><span className="block truncate font-medium">{event.label}</span>{event.detail && <span className="mt-0.5 block break-words text-muted-foreground">{event.detail}</span>}</span><time className="shrink-0 text-muted-foreground">{formatTime(event.when)}</time></li>)}</ol>}
        </section>
      </div>
    </section>,
    document.body,
  );
}

export function RuntimeActivityDock(props: RuntimeActivityDockProps) {
  const {
    projectId, timelineId, tasks, links, isLoading, error, actionError, isPinned, isHistoryOpen, onTogglePinned, onToggleHistory, onTemporaryHistoryLeave, onOpenHistory,
    onCancelTask, onRetryTask, isTaskActionPending, onExportManagedOutput, isExportTaskPending,
    requestedTaskInspection, onTaskInspectionRequestHandled,
  } = props;
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [pinnedTaskId, setPinnedTaskId] = useState<string | null>(null);
  const [animatedTaskIds, setAnimatedTaskIds] = useState<Set<string>>(() => new Set());
  const [position, setPosition] = useState({ left: 8, top: 48 });
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const seenLiveTaskIds = useRef(new Set<string>());
  const activeTasks = useMemo(() => tasks
    .filter(runtimeTaskIsCancellable)
    .sort((left, right) => new Date(right.updated_at || right.created_at).getTime() - new Date(left.updated_at || left.created_at).getTime()), [tasks]);
  const visibleTasks = activeTasks.slice(0, MAX_VISIBLE_ROWS);
  const selectedTask = tasks.find((task) => task.task_id === selectedTaskId) ?? null;
  const pinned = pinnedTaskId === selectedTask?.task_id;

  useEffect(() => {
    if (!requestedTaskInspection) return;
    if (tasks.some((task) => task.task_id === requestedTaskInspection.taskId)) {
      setSelectedTaskId(requestedTaskInspection.taskId);
      setPinnedTaskId(requestedTaskInspection.taskId);
      const left = Math.max(8, Math.min(requestedTaskInspection.anchor.right - INSPECTOR_WIDTH, window.innerWidth - INSPECTOR_WIDTH - 8));
      const top = Math.max(8, Math.min(requestedTaskInspection.anchor.top, window.innerHeight - 360));
      setPosition({ left, top });
    }
    onTaskInspectionRequestHandled?.();
  }, [requestedTaskInspection, tasks, onTaskInspectionRequestHandled]);

  useEffect(() => {
    const newLiveTaskIds = links
      .filter((link) => visibleTasks.some((task) => isExactLiveTaskLink(link, task, projectId)))
      .map((link) => link.task_id)
      .filter((taskId) => !seenLiveTaskIds.current.has(taskId));
    if (newLiveTaskIds.length === 0) return;
    newLiveTaskIds.forEach((taskId) => seenLiveTaskIds.current.add(taskId));
    setAnimatedTaskIds((current) => new Set([...current, ...newLiveTaskIds]));
  }, [links, projectId, visibleTasks]);

  const updatePosition = useCallback((taskId: string) => {
    const row = rowRefs.current.get(taskId);
    if (!row) return;
    const rect = row.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - INSPECTOR_WIDTH, window.innerWidth - INSPECTOR_WIDTH - 8));
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - 360));
    setPosition({ left, top });
  }, []);

  useEffect(() => {
    if (!selectedTaskId) return;
    updatePosition(selectedTaskId);
    const onViewportChange = () => updatePosition(selectedTaskId);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [selectedTaskId, updatePosition]);

  useEffect(() => {
    if (!selectedTaskId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinnedTaskId(null);
        setSelectedTaskId(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedTaskId]);

  const showTask = (taskId: string, intentional = false) => {
    if (pinned && !intentional && taskId !== selectedTask?.task_id) return;
    setSelectedTaskId(taskId);
    updatePosition(taskId);
  };
  const hideUnpinned = (event: React.MouseEvent | React.FocusEvent) => {
    if (pinned) return;
    if (event.relatedTarget instanceof Element && (
      event.relatedTarget.closest('[data-activity-inspector]')
      || event.relatedTarget.closest('[data-activity-task-row]')
    )) return;
    setSelectedTaskId(null);
  };
  const toggleTaskPin = () => {
    if (!selectedTask) return;
    setPinnedTaskId((current) => current === selectedTask.task_id ? null : selectedTask.task_id);
  };
  const closeInspector = useCallback(() => {
    setPinnedTaskId(null);
    setSelectedTaskId(null);
  }, []);

  useEffect(() => {
    if (!selectedTaskId || pinned) return;
    const dismissOutside = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && (
        target.closest('[data-activity-inspector]')
        || target.closest('[data-activity-task-row]')
      )) return;
      closeInspector();
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
    };
  }, [selectedTaskId, pinned, closeInspector]);

  return <section className="mx-2 my-1 overflow-visible rounded-lg border border-amber-300/70 bg-amber-50/75 text-amber-950 shadow-sm dark:border-amber-800/70 dark:bg-amber-950/25 dark:text-amber-50" data-runtime-activity-dock="true" onMouseLeave={onTemporaryHistoryLeave} onBlur={onTemporaryHistoryLeave}>
    <header className="flex h-[38px] items-center justify-between gap-2 px-2.5" aria-label="Runtime activity">
      <div className="flex min-w-0 items-center gap-2">
        <Activity className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
        <span className="text-xs font-semibold">Activity</span>
        {activeTasks.length > 0 ? <span className="rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[10px] tabular-nums text-amber-950 dark:bg-amber-900 dark:text-amber-50">{activeTasks.length}</span>
          : <span className="truncate text-[11px] text-amber-900/60 dark:text-amber-100/60">{isLoading ? 'Checking…' : 'No active tasks'}</span>}
        {error && <span role="status" className="truncate text-[10px] text-red-700 dark:text-red-300">Activity unavailable</span>}
        {actionError && <span role="status" className="truncate text-[10px] text-red-700 dark:text-red-300">Task action failed</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={`h-6 w-6 text-amber-900/70 dark:text-amber-100/70 ${isHistoryOpen ? 'bg-amber-200/70 text-amber-950 dark:bg-amber-900/70 dark:text-amber-50' : ''}`}
          aria-label={isHistoryOpen ? 'Stop peeking at tasks' : 'Peek at tasks'}
          aria-expanded={isHistoryOpen}
          title={isHistoryOpen ? 'Stop peeking at tasks' : 'Peek at tasks'}
          onClick={onToggleHistory}
        >
          {isHistoryOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`h-6 w-6 text-amber-900/70 dark:text-amber-100/70 ${isPinned ? 'bg-amber-200 text-amber-950 ring-1 ring-inset ring-amber-400/70 dark:bg-amber-900 dark:text-amber-50 dark:ring-amber-700' : ''}`}
          aria-label={isPinned ? 'Stop keeping tasks open' : 'Keep tasks open'}
          aria-pressed={isPinned}
          title={isPinned ? 'Stop keeping tasks open' : 'Keep tasks open'}
          onClick={onTogglePinned}
        >
          {isPinned ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </header>

    {visibleTasks.length > 0 && <div className="space-y-1 px-2 pb-2" data-activity-rows="true">
      {visibleTasks.map((task) => {
        const progress = runtimeTaskProgress(task);
        const isNewLiveTask = animatedTaskIds.has(task.task_id);
        return <button
          key={task.task_id}
          ref={(node) => { if (node) rowRefs.current.set(task.task_id, node); else rowRefs.current.delete(task.task_id); }}
          type="button"
          className={`flex min-h-9 w-full items-center gap-2 rounded-md border border-amber-200/80 bg-background/70 px-2 text-left text-[11px] transition-colors hover:bg-amber-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-900/70 dark:bg-background/50 dark:hover:bg-amber-900/30 ${isNewLiveTask ? 'motion-safe:animate-[pulse_700ms_ease-out_1]' : ''}`}
          data-activity-task-row="true"
          data-testid="activity-task-row"
          data-activity-task-id={task.task_id}
          aria-label={`${runtimeTaskLabel(task)}, ${runtimeTaskStateLabel(task.state)}`}
          onMouseEnter={() => showTask(task.task_id)}
          onMouseLeave={hideUnpinned}
          onFocus={() => showTask(task.task_id)}
          onBlur={hideUnpinned}
          onClick={() => { showTask(task.task_id, true); setPinnedTaskId((current) => current === task.task_id ? null : task.task_id); }}
        >
          <TaskModalityIcon task={task} />
          {task.state === 'running' && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-600/80 dark:text-amber-300/80" aria-hidden="true" />}
          <span className="min-w-0 flex-1 truncate font-medium">{runtimeTaskLabel(task)}</span>
          <span className="shrink-0 text-muted-foreground">{progress ? `${runtimeTaskStateLabel(task.state)} · ${Math.round(progress.percent)}%` : runtimeTaskStateLabel(task.state)}</span>
          {progress && <span className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true"><span className="block h-full bg-amber-500" style={{ width: `${progress.percent}%` }} /></span>}
        </button>;
      })}
      {activeTasks.length > MAX_VISIBLE_ROWS && <button type="button" className="w-full px-2 pt-0.5 text-left text-[10px] text-amber-900/70 underline-offset-2 hover:underline dark:text-amber-100/70" onClick={onOpenHistory}>+{activeTasks.length - MAX_VISIBLE_ROWS} more active tasks · open history</button>}
    </div>}

    {selectedTask && <ActivityTaskInspector
      key={`${projectId}:${selectedTask.task_id}`}
      task={selectedTask}
      projectId={projectId}
      allTasks={tasks}
      pinned={pinned}
      position={position}
      onPin={toggleTaskPin}
      onClose={closeInspector}
      onCancelTask={onCancelTask}
      onRetryTask={onRetryTask}
      isTaskActionPending={isTaskActionPending}
      timelineId={timelineId}
      onExportManagedOutput={onExportManagedOutput}
      isExportTaskPending={isExportTaskPending}
    />}
  </section>;
}
