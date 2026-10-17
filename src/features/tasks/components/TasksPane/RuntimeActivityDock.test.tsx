// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, ManagedOutput, Task as RuntimeTask } from '@/integrations/runtime/generated.ts';
import type { AgentTaskLink } from '@/tools/video-editor/runtime/agentTaskLinks';
import { RuntimeActivityDock } from './RuntimeActivityDock';

const runtimeClientMock = vi.hoisted(() => ({ listTaskEvents: vi.fn(), listManagedOutputs: vi.fn() }));
vi.mock('@/integrations/runtime/client.ts', () => ({
  AstridRuntimeClient: class {
    listTaskEvents = runtimeClientMock.listTaskEvents;
    listManagedOutputs = runtimeClientMock.listManagedOutputs;
  },
}));

function task(taskId: string, family = 'generation.generate_image', overrides: Partial<RuntimeTask> & { progress?: unknown } = {}): RuntimeTask {
  return {
    task_id: taskId,
    run_id: `run-${taskId}`,
    project_id: 'project-1',
    state: 'running',
    version: 1,
    capability_id: family,
    capability_digest: 'sha256:capability',
    idempotency_key: `admit:${taskId}`,
    created_at: '2026-10-14T00:00:00Z',
    updated_at: '2026-10-14T00:01:00Z',
    runtime_epoch: 1,
    input_object_ids: [],
    spec: { spec: { family } },
    ...overrides,
  };
}

function event(overrides: Partial<Event> = {}): Event {
  return {
    event_id: 'event-1', sequence: 1, cursor: 'cursor-1', event_type: 'runtime.task.started',
    aggregate_type: 'task', aggregate_id: 'task-1', payload: {}, occurred_at: '2026-10-14T00:01:00Z',
    ...overrides,
  };
}

function output(overrides: Partial<ManagedOutput> = {}): ManagedOutput {
  return {
    association_id: 'association-1', project_id: 'project-1', run_id: 'run-task-1', task_id: 'task-1',
    attempt_id: 'attempt-1', output_port: 'video', group_key: 'group', variant_key: 'variant',
    selector: { group_key: 'group', variant_key: 'variant' }, object_id: 'sha256:secret-digest',
    digest: 'sha256:secret-digest', manifest_ref: null, size: 10, filename: '/private/user/output.mp4',
    media_type: 'video/mp4', ordinal: 0, role: 'render', producer: {}, provenance: {}, durability: 'durable',
    state: 'available', version: 1, lifecycle: {}, ...overrides,
  };
}

function dockElement(
  tasks: RuntimeTask[],
  links: AgentTaskLink[] = [],
  onOpenHistory = vi.fn(),
  requestedTaskInspection?: { taskId: string; anchor: { top: number; right: number } },
  options: { isPinned?: boolean; isHistoryOpen?: boolean } = {},
) {
  return <RuntimeActivityDock
    projectId="project-1" timelineId={null} tasks={tasks} links={links} isLoading={false} error={null} actionError={null}
    isPinned={options.isPinned ?? false} isHistoryOpen={options.isHistoryOpen ?? false} onTogglePinned={vi.fn()} onToggleHistory={vi.fn()} onTemporaryHistoryLeave={vi.fn()} onOpenHistory={onOpenHistory} onCancelTask={cancelTask} onRetryTask={vi.fn()}
    isTaskActionPending={() => false} onExportManagedOutput={vi.fn()} isExportTaskPending={() => false}
    requestedTaskInspection={requestedTaskInspection} onTaskInspectionRequestHandled={vi.fn()}
  />;
}

function renderDock(
  tasks: RuntimeTask[],
  links: AgentTaskLink[] = [],
  onOpenHistory = vi.fn(),
  requestedTaskInspection?: { taskId: string; anchor: { top: number; right: number } },
  options: { isPinned?: boolean; isHistoryOpen?: boolean } = {},
) {
  return render(dockElement(tasks, links, onOpenHistory, requestedTaskInspection, options));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const cancelTask = vi.fn();

describe('RuntimeActivityDock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeClientMock.listTaskEvents.mockResolvedValue({ items: [event()], next_cursor: null });
    runtimeClientMock.listManagedOutputs.mockResolvedValue({ items: [output()], next_cursor: null });
  });

  it('keeps the idle dock compact without permanent status tabs', () => {
    renderDock([]);
    const dock = document.querySelector<HTMLElement>('[data-runtime-activity-dock="true"]')!;
    expect(screen.getByText('No active tasks')).toBeInTheDocument();
    expect(dock.querySelector('header')?.className).toContain('h-[38px]');
    expect(screen.queryByRole('button', { name: /show (processing|succeeded|failed) tasks/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Peek at tasks' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Peek at tasks' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Peek at tasks' })).toHaveAttribute('title', 'Peek at tasks');
    expect(screen.getByRole('button', { name: 'Keep tasks open' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Keep tasks open' })).toHaveAttribute('title', 'Keep tasks open');
  });

  it('distinguishes a temporary peek from keeping the task area open', () => {
    renderDock([], [], vi.fn(), undefined, { isHistoryOpen: true, isPinned: true });
    const peek = screen.getByRole('button', { name: 'Stop peeking at tasks' });
    const keepOpen = screen.getByRole('button', { name: 'Stop keeping tasks open' });
    expect(peek).toHaveAttribute('aria-expanded', 'true');
    expect(peek.className).toContain('bg-amber-200/70');
    expect(keepOpen).toHaveAttribute('aria-pressed', 'true');
    expect(keepOpen.className).toContain('ring-1');
  });

  it('opens task history from the idle chevron when terminal tasks exist', () => {
    const toggleHistory = vi.fn();
    render(<RuntimeActivityDock
      projectId="project-1" timelineId={null} tasks={[task('done-task', 'generation.generate_image', { state: 'succeeded' })]}
      links={[]} isLoading={false} isPinned={false} isHistoryOpen={false} error={null} actionError={null}
      onTogglePinned={vi.fn()} onToggleHistory={toggleHistory} onTemporaryHistoryLeave={vi.fn()} onOpenHistory={vi.fn()} onCancelTask={cancelTask}
      onRetryTask={vi.fn()} isTaskActionPending={() => false} onExportManagedOutput={vi.fn()} isExportTaskPending={() => false}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Peek at tasks' }));
    expect(toggleHistory).toHaveBeenCalledOnce();
  });

  it('keeps the task history toggle available while task history is loading', () => {
    render(<RuntimeActivityDock
      projectId="project-1" timelineId={null} tasks={[]} links={[]} isLoading isPinned={false} isHistoryOpen={false} error={null} actionError={null}
      onTogglePinned={vi.fn()} onToggleHistory={vi.fn()} onTemporaryHistoryLeave={vi.fn()} onOpenHistory={vi.fn()} onCancelTask={cancelTask} onRetryTask={vi.fn()}
      isTaskActionPending={() => false} onExportManagedOutput={vi.fn()} isExportTaskPending={() => false}
    />);
    expect(screen.getByRole('button', { name: 'Peek at tasks' })).toBeEnabled();
  });

  it('shows at most three horizontal active rows and a history affordance for the rest', () => {
    renderDock(Array.from({ length: 5 }, (_, index) => task(`task-${index + 1}`, index % 2 ? 'generation.generate_video' : 'generation.generate_image')));
    expect(screen.getAllByTestId('activity-task-row')).toHaveLength(3);
    expect(screen.getByText('+2 more active tasks · open history')).toBeInTheDocument();
    expect(screen.getAllByText('Image generation')).toHaveLength(2);
    expect(screen.queryByText('task-1')).not.toBeInTheDocument();
  });

  it('uses modality icons for active rows and a neutral icon for unknown families', () => {
    renderDock([
      task('image-private-id', 'generation.generate_image'),
      task('video-private-id', 'generation.generate_video'),
      task('opaque-private-id', 'vendor.opaque_action'),
    ]);
    expect(document.querySelector('[data-activity-task-id="image-private-id"] [data-task-modality="image"]')).toBeInTheDocument();
    expect(document.querySelector('[data-activity-task-id="video-private-id"] [data-task-modality="video"]')).toBeInTheDocument();
    const neutralRow = document.querySelector('[data-activity-task-id="opaque-private-id"]')!;
    expect(neutralRow.querySelector('[data-task-modality="neutral"]')).toBeInTheDocument();
    expect(neutralRow.textContent).not.toContain('opaque-private-id');
  });

  it('opens a floating inspector with safe events, delegated children, results, and controls', async () => {
    const parent = task('task-1', 'media.clip_extract', { attempt_id: 'attempt-parent' });
    const child = task('child-1', 'media.clip_extract', {
      run_id: 'different-run',
      spec: { spec: { family: 'media.clip_extract', delegated_parent: { parent_task_id: 'task-1', parent_attempt_id: 'attempt-parent' } } },
    });
    const unrelated = task('unrelated-child', 'media.clip_extract', {
      project_id: 'other-project',
      spec: { spec: { family: 'media.clip_extract', delegated_parent: { parent_task_id: 'task-1' } } },
    });
    runtimeClientMock.listTaskEvents.mockResolvedValue({
      items: [
        event({ sequence: 2, event_id: 'private', payload: { message: '/private/user/secret.log sha256:private' } }),
        event({ sequence: 1, aggregate_id: 'other-task', event_id: 'wrong-aggregate', event_type: 'ignored.event' }),
      ], next_cursor: null,
    });
    const view = renderDock([parent, child, unrelated]);
    const row = document.querySelector<HTMLButtonElement>('[data-activity-task-id="task-1"]')!;
    fireEvent.mouseEnter(row);
    const inspector = await screen.findByLabelText('Clip extraction activity details');
    expect(inspector).toHaveClass('fixed');
    expect(inspector.closest('[data-runtime-activity-dock="true"]')).toBeNull();
    expect(within(inspector).getByText('Subtasks (1)')).toBeInTheDocument();
    expect(within(inspector).getAllByText('Clip extraction').length).toBeGreaterThan(0);
    expect(within(inspector).getByText('output.mp4')).toBeInTheDocument();
    expect(within(inspector).queryByText('/private/user/output.mp4')).not.toBeInTheDocument();
    expect(within(inspector).queryByText('sha256:secret-digest')).not.toBeInTheDocument();
    await waitFor(() => expect(within(inspector).queryByText('Ignored Event')).not.toBeInTheDocument());
    expect(within(inspector).queryByText('/private/user/secret.log sha256:private')).not.toBeInTheDocument();
    expect(runtimeClientMock.listTaskEvents).toHaveBeenCalledWith('task-1', undefined, 40);
    fireEvent.click(within(inspector).getByRole('button', { name: 'Cancel Clip extraction' }));
    expect(cancelTask).toHaveBeenCalledWith('task-1');
    expect(view.container.querySelector('[data-runtime-activity-dock="true"]')).toBeTruthy();
  });

  it('opens and pins the shared inspector for a completed history task', async () => {
    runtimeClientMock.listTaskEvents.mockResolvedValue({ items: [event({ aggregate_id: 'completed-task' })], next_cursor: null });
    runtimeClientMock.listManagedOutputs.mockResolvedValue({ items: [output({ task_id: 'completed-task', run_id: 'run-completed-task' })], next_cursor: null });
    renderDock(
      [task('completed-task', 'media.clip_extract', { state: 'succeeded' })],
      [],
      vi.fn(),
      { taskId: 'completed-task', anchor: { top: 120, right: 520 } },
    );

    const inspector = await screen.findByLabelText('Clip extraction activity details');
    expect(inspector).toHaveAttribute('data-pinned', 'true');
    expect(within(inspector).getByText('Results')).toBeInTheDocument();
    expect(within(inspector).getByText('output.mp4')).toBeInTheDocument();
    expect(runtimeClientMock.listTaskEvents).toHaveBeenCalledWith('completed-task', undefined, 40);
  });

  it('refreshes a pinned running task when Runtime reports terminal state and new results', async () => {
    const running = task('task-1', 'media.clip_extract');
    runtimeClientMock.listManagedOutputs.mockResolvedValue({ items: [], next_cursor: null });
    const view = renderDock([running]);
    fireEvent.click(screen.getByRole('button', { name: 'Clip extraction, Running' }));
    const inspector = await screen.findByLabelText('Clip extraction activity details');
    expect(within(inspector).getByText('No managed results yet.')).toBeInTheDocument();

    runtimeClientMock.listTaskEvents.mockResolvedValue({
      items: [event({ sequence: 2, event_id: 'completed', event_type: 'runtime.task.completed', aggregate_id: 'task-1' })],
      next_cursor: null,
    });
    runtimeClientMock.listManagedOutputs.mockResolvedValue({ items: [output()], next_cursor: null });
    view.rerender(dockElement([{
      ...running,
      state: 'succeeded',
      version: 2,
      updated_at: '2026-10-14T00:02:00Z',
    }]));

    expect(await within(screen.getByLabelText('Clip extraction activity details')).findByText('output.mp4')).toBeInTheDocument();
    expect(await within(screen.getByLabelText('Clip extraction activity details')).findByText('Task Completed')).toBeInTheDocument();
    expect(runtimeClientMock.listManagedOutputs).toHaveBeenCalledTimes(2);
  });

  it('does not show task A details while task B details are pending or fail', async () => {
    const taskA = task('task-a', 'generation.generate_image', { updated_at: '2026-10-14T00:02:00Z' });
    const taskB = task('task-b', 'generation.generate_video', { updated_at: '2026-10-14T00:01:00Z' });
    runtimeClientMock.listManagedOutputs.mockResolvedValue({
      items: [output({ task_id: 'task-a', run_id: 'run-task-a', filename: '/private/user/task-a-only.mp4' })],
      next_cursor: null,
    });
    runtimeClientMock.listTaskEvents.mockResolvedValue({ items: [event({ aggregate_id: 'task-a' })], next_cursor: null });
    const view = renderDock([taskA, taskB]);
    fireEvent.click(screen.getByRole('button', { name: 'Image generation, Running' }));
    expect(await screen.findByText('task-a-only.mp4')).toBeInTheDocument();

    const pendingEvents = deferred<{ items: Event[]; next_cursor: null }>();
    const pendingOutputs = deferred<{ items: ManagedOutput[]; next_cursor: null }>();
    runtimeClientMock.listTaskEvents.mockReturnValue(pendingEvents.promise);
    runtimeClientMock.listManagedOutputs.mockReturnValue(pendingOutputs.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Video generation, Running' }));
    expect(screen.getByLabelText('Video generation activity details')).toHaveAttribute('data-pinned', 'true');
    expect(screen.queryByText('task-a-only.mp4')).not.toBeInTheDocument();

    pendingEvents.reject(new Error('task B activity failed'));
    pendingOutputs.reject(new Error('task B output failed'));
    expect(await screen.findByText('task B activity failed')).toBeInTheDocument();
    expect(screen.queryByText('task-a-only.mp4')).not.toBeInTheDocument();
  });

  it('pins on row click, keeps the pinned inspector open on pointer exit, and closes on Escape', async () => {
    renderDock([task('task-1')]);
    fireEvent.click(screen.getByRole('button', { name: 'Image generation, Running' }));
    const inspector = await screen.findByLabelText('Image generation activity details');
    expect(inspector).toHaveAttribute('data-pinned', 'true');
    fireEvent.mouseLeave(inspector, { relatedTarget: document.body });
    fireEvent.pointerDown(document.body);
    expect(screen.getByLabelText('Image generation activity details')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByLabelText('Image generation activity details')).not.toBeInTheDocument();
  });

  it('keeps pinned task A through passive task B hover/focus, but lets intentional click pin B', async () => {
    renderDock([
      task('task-a', 'generation.generate_image', { updated_at: '2026-10-14T00:02:00Z' }),
      task('task-b', 'generation.generate_video', { updated_at: '2026-10-14T00:01:00Z' }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Image generation, Running' }));
    expect(await screen.findByLabelText('Image generation activity details')).toHaveAttribute('data-pinned', 'true');

    const rowB = screen.getByRole('button', { name: 'Video generation, Running' });
    fireEvent.mouseEnter(rowB);
    fireEvent.focus(rowB);
    fireEvent.mouseLeave(rowB, { relatedTarget: document.body });
    expect(screen.getByLabelText('Image generation activity details')).toHaveAttribute('data-pinned', 'true');

    fireEvent.click(rowB);
    expect(await screen.findByLabelText('Video generation activity details')).toHaveAttribute('data-pinned', 'true');
    expect(screen.queryByLabelText('Image generation activity details')).not.toBeInTheDocument();
  });

  it('dismisses an unpinned inspector after focus or pointer moves outside', async () => {
    renderDock([task('task-1')]);
    const row = screen.getByRole('button', { name: 'Image generation, Running' });
    fireEvent.focus(row);
    const inspector = await screen.findByLabelText('Image generation activity details');
    expect(inspector).toHaveAttribute('data-pinned', 'false');
    fireEvent.focus(within(inspector).getByRole('button', { name: 'Cancel Image generation' }));
    expect(screen.getByLabelText('Image generation activity details')).toBeInTheDocument();
    fireEvent.focusIn(document.body);
    expect(screen.queryByLabelText('Image generation activity details')).not.toBeInTheDocument();

    fireEvent.mouseEnter(row);
    expect(screen.getByLabelText('Image generation activity details')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByLabelText('Image generation activity details')).not.toBeInTheDocument();
  });

  it('animates only a live linked task once and honors rehydrated links without the arrival effect', async () => {
    const current = task('task-1');
    const liveLink: AgentTaskLink = { project_id: 'project-1', run_id: 'run-task-1', task_id: 'task-1', capability_id: 'generation.generate_image', sessionId: 'session-1', toolCallId: 'call-1', liveObserved: true };
    const { unmount } = renderDock([current], [liveLink]);
    await waitFor(() => expect(screen.getByTestId('activity-task-row')).toHaveClass('motion-safe:animate-[pulse_700ms_ease-out_1]'));
    unmount();
    renderDock([current], [{ ...liveLink, liveObserved: false }]);
    expect(screen.getByTestId('activity-task-row')).not.toHaveClass('motion-safe:animate-[pulse_700ms_ease-out_1]');
  });
});
