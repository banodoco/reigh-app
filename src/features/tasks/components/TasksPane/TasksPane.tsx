import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { shallow } from 'zustand/shallow';
import { useRenderLogger } from '@/shared/lib/debug/debugRendering';
import { TaskList } from './TaskList';
import { RuntimeTaskList } from './RuntimeTaskList';
import { cn } from '@/shared/components/ui/contracts/cn';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { ListTodo, Loader2, Lock, MessageSquareText, Mic, Square, Unlock } from 'lucide-react';
import { PaneControlTab } from '@/shared/components/PaneControlTab';
import { useAgentChatActions, useOptionalAgentChatBridge } from '@/shared/contexts/AgentChatContext';
import { AgentChatPanel } from '@/tools/video-editor/components/AgentChat';
import { useProjectCrudContext, useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { TasksPaneProcessingWarning } from '@/shared/components/ProcessingWarnings';
import { useBottomOffset } from '@/shared/hooks/layout/useBottomOffset';
import { MediaLightbox } from '@/domains/media-lightbox/MediaLightbox';
import { useShots } from '@/shared/contexts/ShotsContext';
import { useLastAffectedShot } from '@/shared/hooks/shots/useLastAffectedShot';
import { useCurrentShot } from '@/shared/state/selectionStore';
import { usePaneInteractionLifecycle } from '@/shared/components/panes/usePaneInteractionLifecycle';
import { PaneBackdrop } from '@/shared/components/panes/PaneBackdrop';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/shared/components/ui/select';

// Import from new modules
import { STATUS_GROUPS, type FilterGroup } from './constants';
import { PaginationControls } from './components/PaginationControls';
import { useTasksLightbox } from './hooks/useTasksLightbox';
import { useShotActions } from './hooks/useShotActions';
import { useTasksPaneController } from './hooks/useTasksPaneController';
import { useTasksPaneSlidingPane } from './hooks/useTasksPaneSlidingPane';
import { useRenderBudget } from '@/shared/dev/useRenderBudget';
import { UI_Z_LAYERS } from '@/shared/lib/uiLayers';
import { usePanesStore } from '@/shared/state/panesStore';
import { isElementWithinKnownOverlay } from '@/shared/components/ui/overlay';

interface TasksPaneProps {
  onOpenSettings: () => void;
}

const EXPANDED_HALF_STORAGE_KEY = 'tasksPane:expandedHalf';
type ExpandedHalf = 'chat' | null;

function readPersistedExpandedHalf(): ExpandedHalf {
  if (typeof window === 'undefined') return 'chat';
  const stored = window.localStorage.getItem(EXPANDED_HALF_STORAGE_KEY);
  return stored === 'split' || stored === 'tasks' ? null : 'chat';
}

const TasksPaneComponent: React.FC<TasksPaneProps> = ({ onOpenSettings }) => {
  useRenderBudget('TasksPane', 5);
  const { pathname, search } = useLocation();
  const runtimeParams = useMemo(() => new URLSearchParams(search), [search]);
  const selectedEditor = useOptionalAgentChatBridge()?.editorContext;
  const routeRuntimeProjectId = pathname === '/tools/video-editor'
    && runtimeParams.get('runtime') === '1'
    && runtimeParams.get('runtimeTimeline')
    ? runtimeParams.get('runtimeProject')?.trim() || null
    : null;
  const runtimeProjectId = selectedEditor?.projectId ?? routeRuntimeProjectId;
  const runtimeTimelineId = selectedEditor?.projectId
    ? selectedEditor.timelineId
    : routeRuntimeProjectId ? runtimeParams.get('runtimeTimeline')?.trim() || null : null;
  const {
    isTasksPaneLocked,
    setIsTasksPaneLocked,
    tasksPaneWidth,
    activeTaskId,
    setActiveTaskId,
    isTasksPaneOpenProgrammatic,
    setIsTasksPaneOpenProgrammatic,
  } = usePanesStore((state) => ({
    isTasksPaneLocked: state.isTasksPaneLocked,
    setIsTasksPaneLocked: state.setIsTasksPaneLocked,
    tasksPaneWidth: state.tasksPaneWidth,
    activeTaskId: state.activeTaskId,
    setActiveTaskId: state.setActiveTaskId,
    isTasksPaneOpenProgrammatic: state.isTasksPaneOpen,
    setIsTasksPaneOpenProgrammatic: state.setIsTasksPaneOpen,
  }), shallow);

  // Project context & task helpers
  const { selectedProjectId } = useProjectSelectionContext();
  const { projects } = useProjectCrudContext();

  // Shots data for lightbox
  // Consume the authority-selected context. Astrid mode intentionally exposes
  // an empty compatibility view; the explicit supabase-deferred provider owns
  // the legacy relational query. This pane is mounted in the global shell, so
  // a direct useListShots call here would leak a cloud request on every route.
  const { shots } = useShots();
  const { currentShotId } = useCurrentShot();
  const { lastAffectedShotId } = useLastAffectedShot();

  // Get incoming/placeholder tasks for count calculation + cancellation
  const { incomingTasks, cancelAllIncoming } = useIncomingTasks();

  const {
    selectedFilter,
    selectedTaskType,
    projectScope,
    currentPage,
    mobileActiveTaskId,
    setProjectScope,
    setMobileActiveTaskId,
    handleFilterChange,
    handleTaskTypeChange,
    handlePageChange,
    handleCancelAllPending,
    isCancelAllPending,
    paginatedData,
    isPaginatedLoading,
    displayStatusCounts,
    isStatusCountsDegraded,
    failedStatusQueries,
    taskTypeOptions,
    totalTasks,
    totalPages,
    cancellableTaskCount,
    isAllProjectsMode,
    projectNameMap,
    isRuntimeMode,
    runtimeTaskData,
    runtimeTaskError,
    runtimeTaskActionError,
    runtimeTaskActions,
  } = useTasksPaneController({
    selectedProjectId,
    runtimeProjectId,
    projects,
    incomingTasks,
    cancelAllIncoming,
  });

  // Simplified shot options for MediaLightbox
  const simplifiedShotOptions = useMemo(() => shots?.map(s => ({ id: s.id, name: s.name })) || [], [shots]);

  // Use extracted lightbox hook
  const {
    lightboxData,
    lightboxSelectedShotId,
    setLightboxSelectedShotId,
    taskDetailsData,
    lightboxProps,
    handleOpenImageLightbox,
    handleOpenVideoLightbox,
    handleCloseLightbox,
    handleOpenExternalGeneration,
  } = useTasksLightbox({
    selectedProjectId,
    currentShotId,
    lastAffectedShotId,
    setActiveTaskId,
    setIsTasksPaneOpen: setIsTasksPaneOpenProgrammatic,
  });

  // Use extracted shot actions hook
  const {
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    handleAddToShot,
    handleAddToShotWithoutPosition,
    handleOptimisticPositioned,
    handleOptimisticUnpositioned,
  } = useShotActions({
    lightboxSelectedShotId,
    currentShotId,
    lastAffectedShotId,
    selectedProjectId,
  });

  useRenderLogger('TasksPane', { cancellableCount: cancellableTaskCount });

  const { isLocked, isOpen, toggleLock, openPane, paneProps, transformClass, handlePaneEnter, handlePaneLeave, showBackdrop, closePane } = useTasksPaneSlidingPane({
    isTasksPaneLocked,
    setIsTasksPaneLocked,
    isTasksPaneOpenProgrammatic,
    setIsTasksPaneOpenProgrammatic,
  });

  const { isPointerEventsEnabled } = usePaneInteractionLifecycle({
    isOpen: Boolean(isOpen),
  });

  // Sprint 3 adapter boundary: AgentChatPanel remains app-owned in TasksPane
  // instead of moving into the editor shell. The core talks to chat through
  // registration bridges; this pane still owns when chat is mounted and how the
  // split-button affordance drives it on Reigh routes.
  // Agent chat lives inside the action pane only on tool routes (where a timeline
  // makes sense). On other routes the pane is task-only.
  const isToolRoute = pathname.startsWith('/tools') || pathname === '/shots' || pathname === '/art';
  // null until AgentChatPanel mounts and registers; the split button stays hidden
  // until then so it can't be clicked before its handlers exist.
  const agentChatActions = useAgentChatActions();
  const readyAgentChatActions = isToolRoute ? agentChatActions : null;

  // Keep the established stored preference: chat = compact tasks; split =
  // tasks pinned at their normal half-height. Legacy tasks-full maps to split.
  const [expandedHalf, setExpandedHalf] = useState<ExpandedHalf>(readPersistedExpandedHalf);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (expandedHalf) {
      window.localStorage.setItem(EXPANDED_HALF_STORAGE_KEY, expandedHalf);
    } else {
      window.localStorage.setItem(EXPANDED_HALF_STORAGE_KEY, 'split');
    }
  }, [expandedHalf]);
  const showChatHalf = isToolRoute;
  const [isTasksPeeking, setIsTasksPeeking] = useState(false);
  const compactTasks = isToolRoute;
  const isTasksPinned = expandedHalf === null;
  const showTasksHalf = !isToolRoute || isTasksPinned || isTasksPeeking;
  const toggleTasksPinned = () => setExpandedHalf(isTasksPinned ? 'chat' : null);
  useEffect(() => { setIsTasksPeeking(false); }, [expandedHalf, isOpen]);
  const leaveTaskPeek = (event: React.MouseEvent | React.FocusEvent) => {
    if (event.relatedTarget instanceof Element && (
      event.relatedTarget.closest('[data-task-peek-surface]')
      || isElementWithinKnownOverlay(event.relatedTarget)
    )) return;
    setIsTasksPeeking(false);
  };

  // Which agent action was used most recently. Drives which control sits as
  // the primary in the pane-control split button — secondary appears on hover.
  // Persisted to localStorage so the preference survives close/reopen.
  const [lastAgentAction, setLastAgentAction] = useState<'message' | 'voice'>(() => {
    if (typeof window === 'undefined') return 'message';
    const stored = window.localStorage.getItem('agentChat:lastAction');
    return stored === 'voice' || stored === 'message' ? stored : 'message';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('agentChat:lastAction', lastAgentAction);
  }, [lastAgentAction]);

  return (
    <>
      {/* Backdrop overlay for mobile - z-index just below TasksPane content (100016) */}
      <PaneBackdrop show={showBackdrop} zIndex={100000} onClose={closePane} />
      
      <PaneControlTab
        position={{ side: "right", paneDimension: tasksPaneWidth, bottomOffset: useBottomOffset() }}
        state={{ isLocked, isOpen: !!isOpen }}
        handlers={{ toggleLock, openPane, handlePaneEnter, handlePaneLeave }}
        display={{ paneIcon: "tasks", paneTooltip: "Open Action pane", allowMobileLock: true, shortcutHint: '⌥D' }}
        actions={{
          thirdButton: {
            onClick: openPane,
            ariaLabel: `Open Action pane (${cancellableTaskCount} active tasks)`,
            content: <span className="text-xs font-light">{cancellableTaskCount}</span>,
            tooltip: `${cancellableTaskCount} active task${cancellableTaskCount === 1 ? '' : 's'}`,
          },
          splitButton: readyAgentChatActions
            ? (() => {
                const messageAction = {
                  onClick: () => {
                    setLastAgentAction('message');
                    // markEngaged signals the auto-create-session gate inside the
                    // panel WITHOUT writing to panesStore.isTasksPaneOpen (which
                    // would short-circuit useSlidingPane.setOpen(false)).
                    readyAgentChatActions.markEngaged();
                    openPane();
                    // focusComposer is ref-backed, so even if the panel unmounts
                    // before the next frame the call is a safe no-op.
                    requestAnimationFrame(() => readyAgentChatActions.focusComposer());
                  },
                  ariaLabel: 'Open message composer',
                  tooltip: 'Open message',
                  content: <MessageSquareText className="h-4 w-4" />,
                };
                const voiceAction = {
                  onClick: () => {
                    setLastAgentAction('voice');
                    readyAgentChatActions.toggleRecording();
                  },
                  ariaLabel: readyAgentChatActions.isRecording ? 'Stop recording' : 'Start voice recording',
                  tooltip: readyAgentChatActions.isRecording ? 'Stop' : 'Voice (⌘⇧R)',
                  content: readyAgentChatActions.isRecording
                    ? <Square className="h-4 w-4" />
                    : <Mic className="h-4 w-4" />,
                };
                // Whichever the user invoked most recently is the primary
                // (full-cell) button; the other appears as a hover bubble.
                return lastAgentAction === 'voice'
                  ? { primary: voiceAction, secondary: messageAction }
                  : { primary: messageAction, secondary: voiceAction };
              })()
            : undefined,
        }}
        dataTour="tasks-pane-tab"
      />
      
      <div
        className="pointer-events-none"
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: `${tasksPaneWidth}px`,
          // Content must sit above MediaLightbox and GenerationsPane; see UI_Z_LAYERS.
          zIndex: UI_Z_LAYERS.TASKS_PANE_CONTENT,
        }}
      >
        <div
          {...paneProps}
          data-tasks-pane="true"
          data-scroll-lock-scrollable="true"
          className={cn(
            'absolute top-0 right-0 h-full w-full bg-zinc-900/95 border-l border-zinc-700 shadow-xl transform transition-transform duration-300 ease-smooth flex flex-col pointer-events-auto',
            transformClass
          )}
        >
          {/* The pane-open-transition pointer-events gate is applied only to
              the tasks half (the original gated content). The chat half is the
              former popup — it lived outside the pane and was never gated, so
              we keep it always interactive to preserve that. Otherwise the
              attachment X buttons drop clicks during the 300ms slide-in. */}
          <div
            className="relative flex flex-col h-full"
            onPointerDownCapture={(event) => {
              if (event.target instanceof Element && !event.target.closest('[data-task-peek-surface]') && !isElementWithinKnownOverlay(event.target)) setIsTasksPeeking(false);
            }}
          >
            {compactTasks && (
              <div
                data-task-peek-surface="header"
                role="region"
                aria-label="Tasks"
                className="group/tasks-header z-30 flex h-20 shrink-0 flex-col justify-center gap-1 border-b border-zinc-600/70 bg-zinc-800/80 px-2 py-2"
                onMouseEnter={() => setIsTasksPeeking(true)}
                onMouseLeave={leaveTaskPeek}
                onFocus={() => setIsTasksPeeking(true)}
                onBlur={leaveTaskPeek}
              >
                <div className="flex h-6 items-center justify-between pl-1">
                  <h2 className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
                    <ListTodo className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                    Tasks
                  </h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-zinc-400 opacity-0 transition-opacity [&_svg]:size-3 group-hover/tasks-header:opacity-100 group-focus-within/tasks-header:opacity-100 focus-visible:opacity-100"
                    aria-label={isTasksPinned ? 'Unlock tasks' : 'Lock tasks open'}
                    aria-pressed={isTasksPinned}
                    title={isTasksPinned ? 'Unlock tasks' : 'Lock tasks open'}
                    onClick={toggleTasksPinned}
                  >
                    {isTasksPinned ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  </Button>
                </div>
                <div className="flex items-center gap-1 rounded-md bg-zinc-950/30 p-0.5">
                {(['Processing', 'Succeeded', 'Failed'] as FilterGroup[]).map((filter) => {
                  const count = filter === 'Processing' ? cancellableTaskCount
                    : filter === 'Succeeded' ? (displayStatusCounts?.recentSuccesses ?? 0)
                      : (displayStatusCounts?.recentFailures ?? 0);
                  return (
                    <Button
                      key={filter}
                      variant="ghost"
                      size="sm"
                      aria-pressed={selectedFilter === filter}
                      aria-label={`Show ${filter.toLowerCase()} tasks (${count})`}
                      onClick={() => { handleFilterChange(filter); setIsTasksPeeking(true); }}
                      className={cn('min-w-0 flex-1 gap-1 px-1 text-[11px]', selectedFilter === filter ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400')}
                    >
                      <span className="truncate">{filter}</span>
                      <span className="tabular-nums opacity-70">({count})</span>
                    </Button>
                  );
                })}
                </div>
              </div>
            )}
            {/* Header plus task body reserve exactly half the pane while
                peeking or pinned, so chat resizes without being remounted. */}
            {showTasksHalf && (
            <div
              data-task-peek-surface="tasks"
              onMouseEnter={() => { if (compactTasks) setIsTasksPeeking(true); }}
              onMouseLeave={leaveTaskPeek}
              onFocus={() => { if (compactTasks) setIsTasksPeeking(true); }}
              onBlur={leaveTaskPeek}
              className={cn(
              'min-h-0 flex flex-col overflow-hidden',
              isToolRoute
                ? 'relative h-[calc(50%_-_5rem)] shrink-0 bg-zinc-900'
                : 'relative flex-1',
              isPointerEventsEnabled ? 'pointer-events-auto' : 'pointer-events-none'
            )}>
            {/* Status Filter Toggle — three buttons side-by-side, count inline as (N) so the row never overflows */}
            <div className="p-2 border-b border-zinc-800 flex-shrink-0">
              {!compactTasks && <div className="bg-zinc-800 rounded-lg p-1">
                <div className="flex gap-1">
                  {(['Processing', 'Succeeded', 'Failed'] as FilterGroup[]).map((filter) => {
                    const count = filter === 'Processing'
                      ? cancellableTaskCount
                      : filter === 'Succeeded'
                        ? (displayStatusCounts?.recentSuccesses || 0)
                        : (displayStatusCounts?.recentFailures || 0);

                    return (
                      <Button
                        key={filter}
                        variant={selectedFilter === filter ? "default" : "ghost"}
                        size="sm"
                        onClick={() => handleFilterChange(filter)}
                        className={cn(
                          "flex-1 text-xs flex items-center justify-center gap-1 px-2 min-w-0",
                          selectedFilter === filter
                            ? "bg-zinc-600 text-zinc-100 md:hover:bg-zinc-500"
                            : "text-zinc-400 md:hover:text-zinc-200 md:hover:bg-zinc-700"
                        )}
                      >
                        <span className="truncate">{filter}</span>
                        <span className={cn(
                          'font-light tabular-nums',
                          count === 0 ? 'opacity-40' : 'opacity-80'
                        )}>
                          ({count})
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>}

              {isStatusCountsDegraded && (
                <p className="mt-2 text-[11px] text-amber-300">
                  Task counters are partially degraded
                  {failedStatusQueries ? ` (${failedStatusQueries})` : ''}.
                </p>
              )}
              
              {/* Task Type + Project Scope Filters */}
              <div className={cn('flex items-center gap-1', !compactTasks && 'mt-2')}>
                <Select
                  value={selectedTaskType || 'all'}
                  onValueChange={(value) => handleTaskTypeChange(value === 'all' ? null : value)}
                >
                  <SelectTrigger variant="retro-dark" size="sm" colorScheme="zinc" className="h-7 !text-xs flex-1 min-w-0">
                    <SelectValue placeholder="All task types" />
                  </SelectTrigger>
                  <SelectContent variant="zinc">
                    <SelectItem variant="zinc" value="all" className="!text-xs">All task types</SelectItem>
                    {taskTypeOptions.length > 0 && <SelectSeparator className="bg-zinc-700" />}
                    {taskTypeOptions.map((type) => (
                      <SelectItem variant="zinc" key={type.value} value={type.value} className="!text-xs">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {isRuntimeMode ? (
                  <div
                    className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-zinc-700 px-2 text-xs text-zinc-300"
                    data-runtime-task-project={runtimeProjectId ?? ''}
                    title={runtimeProjectId ?? undefined}
                  >
                    <span className="truncate">Runtime project</span>
                  </div>
                ) : (
                  <Select
                    value={projectScope}
                    onValueChange={(value) => {
                      setProjectScope(value ?? 'current');
                      handlePageChange(1);
                    }}
                  >
                    <SelectTrigger variant="retro-dark" size="sm" colorScheme="zinc" className="h-7 !text-xs flex-1 min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent variant="zinc">
                      <SelectItem variant="zinc" value="current" className="!text-xs">This project</SelectItem>
                      <SelectItem variant="zinc" value="all" className="!text-xs">All projects</SelectItem>
                      {projects.filter(p => p.id !== selectedProjectId).length > 0 && <SelectSeparator className="bg-zinc-700" />}
                      {projects
                        .filter(p => p.id !== selectedProjectId)
                        .sort((a, b) => {
                          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                          return bDate - aDate;
                        })
                        .map((project) => (
                          <SelectItem variant="zinc" key={project.id} value={project.id} className="!text-xs preserve-case">
                            {project.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleCancelAllPending}
                      disabled={isCancelAllPending || cancellableTaskCount === 0}
                      className="h-7 shrink-0 gap-1 px-2 text-[10px]"
                    >
                      {isCancelAllPending && <Loader2 className="h-3 w-3 animate-spin" />}
                      Cancel All
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Cancel all queued tasks</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              totalItems={totalTasks}
              isLoading={isPaginatedLoading}
              filterType={selectedFilter}
              recentCount={
                selectedFilter === 'Succeeded' ? displayStatusCounts?.recentSuccesses :
                selectedFilter === 'Failed' ? displayStatusCounts?.recentFailures :
                undefined
              }
            />

            <TasksPaneProcessingWarning onOpenSettings={onOpenSettings} />

            {/* Task list area — relative wrapper hosts the absolute-positioned
                bottom fade so scrolled-out content visibly trails off rather
                than hard-clipping at the divider. */}
            <div className="relative flex-grow overflow-hidden">
              <div
                className="absolute inset-0 overflow-y-auto"
                data-scroll-lock-scrollable="true"
              >
                {isRuntimeMode ? (
                  <RuntimeTaskList
                    tasks={runtimeTaskData?.tasks ?? []}
                    isLoading={isPaginatedLoading}
                    error={runtimeTaskError}
                    actionError={runtimeTaskActionError}
                    onCancelTask={runtimeTaskActions.cancelTask}
                    onRetryTask={runtimeTaskActions.retryTask}
                    isTaskActionPending={runtimeTaskActions.isTaskActionPending}
                    timelineId={runtimeTimelineId}
                    onExportManagedOutput={runtimeTaskActions.exportManagedOutput}
                    isExportTaskPending={runtimeTaskActions.isExportTaskPending}
                  />
                ) : (
                <TaskList
                  filterStatuses={STATUS_GROUPS[selectedFilter]}
                  activeFilter={selectedFilter}
                  statusCounts={displayStatusCounts}
                  paginatedData={paginatedData}
                  isLoading={isPaginatedLoading}
                  currentPage={currentPage}
                  activeTaskId={activeTaskId}
                  onOpenImageLightbox={handleOpenImageLightbox}
                  onOpenVideoLightbox={handleOpenVideoLightbox}
                  onCloseLightbox={handleCloseLightbox}
                  mobileActiveTaskId={mobileActiveTaskId}
                  onMobileActiveTaskChange={setMobileActiveTaskId}
                  taskTypeFilter={selectedTaskType ?? undefined}
                  showProjectIndicator={isAllProjectsMode}
                  projectNameMap={projectNameMap}
                />
                )}
              </div>
              {/* Bottom fade — only visible when the chat half sits below */}
              {showChatHalf && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-zinc-900 via-zinc-900/70 to-transparent" />
              )}
            </div>
            </div>
            )}
            {/* Chat remains mounted while tasks peek, pin, or collapse. */}
            {showChatHalf && (
              <div
                className={cn(
                  // bg sits on the wrapper, NOT inside AgentChatPanel, so the
                  // pane bg → chat bg transition happens precisely at the
                  // border-t-2 divider line.
                  'overflow-hidden border-t-2 border-zinc-700 relative bg-zinc-950/60',
                  'flex-1 min-h-0'
                )}
              >
                <AgentChatPanel isExpanded={!showTasksHalf} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Centralized MediaLightbox */}
      {lightboxData && lightboxProps && createPortal(
        <MediaLightbox
          media={lightboxProps.media}
          onClose={handleCloseLightbox}
          navigation={{
            onNext: lightboxProps.onNext,
            onPrevious: lightboxProps.onPrevious,
            showNavigation: lightboxProps.showNavigation,
            hasNext: lightboxProps.hasNext,
            hasPrevious: lightboxProps.hasPrevious,
          }}
          features={{
            showImageEditTools: lightboxProps.showImageEditTools,
            showDownload: true,
            showMagicEdit: lightboxProps.showMagicEdit,
            showTaskDetails: true,
          }}
          taskDetailsData={taskDetailsData ?? undefined}
          shotWorkflow={{
            allShots: simplifiedShotOptions,
            selectedShotId: lightboxSelectedShotId || currentShotId || lastAffectedShotId || undefined,
            onShotChange: setLightboxSelectedShotId,
            onAddToShot: handleAddToShot,
            onAddToShotWithoutPosition: handleAddToShotWithoutPosition,
            optimisticPositionedIds,
            optimisticUnpositionedIds,
            onOptimisticPositioned: handleOptimisticPositioned,
            onOptimisticUnpositioned: handleOptimisticUnpositioned,
            onShowTick: async () => {},
          }}
          showTickForImageId={undefined}
          onOpenExternalGeneration={handleOpenExternalGeneration}
          tasksPaneOpen={true}
          tasksPaneWidth={tasksPaneWidth}
          initialVariantId={lightboxProps.initialVariantId}
          videoProps={{ fetchVariantsForSelf: lightboxProps.fetchVariantsForSelf }}
        />,
        document.body
      )}
    </>
  );
};

// Memoize TasksPane with custom comparison
export const TasksPane = React.memo(TasksPaneComponent, (prevProps, nextProps) => {
  return prevProps.onOpenSettings === nextProps.onOpenSettings;
});
