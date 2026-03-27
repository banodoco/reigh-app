import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Download, Eye, GripHorizontal, History, Maximize2, Minimize2, Redo2, Settings, SlidersHorizontal, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/shared/components/ui/alert-dialog';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu';
import { Slider } from '@/shared/components/ui/slider';
import { usePanes } from '@/shared/contexts/PanesContext';
import { AgentChat } from '@/tools/video-editor/components/AgentChat';
import { CompactPreview } from '@/tools/video-editor/components/CompactPreview';
import { PreviewPanel } from '@/tools/video-editor/components/PreviewPanel/PreviewPanel';
import { RemotionPreview } from '@/tools/video-editor/components/PreviewPanel/RemotionPreview';
import { PropertiesPanel } from '@/tools/video-editor/components/PropertiesPanel/PropertiesPanel';
import { TimelineEditor } from '@/tools/video-editor/components/TimelineEditor/TimelineEditor';
import { useTimelineChromeContext } from '@/tools/video-editor/contexts/TimelineChromeContext';
import { useTimelineEditorContext } from '@/tools/video-editor/contexts/TimelineEditorContext';
import { useTimelinePlaybackContext } from '@/tools/video-editor/contexts/TimelinePlaybackContext';
import { useKeyboardShortcuts } from '@/tools/video-editor/hooks/useKeyboardShortcuts';
import { useTimelineRealtime } from '@/tools/video-editor/hooks/useTimelineRealtime';
import { getTimelineDurationInFrames } from '@/tools/video-editor/lib/config-utils';
import { dispatchAppEvent } from '@/shared/lib/typedEvents';

const MIN_TIMELINE_HEIGHT = 140;
const MIN_PREVIEW_HEIGHT = 180;
const STATUS_VARIANT = {
  saved: 'default',
  saving: 'secondary',
  dirty: 'outline',
  error: 'destructive',
} as const;
const CHECKPOINT_TRIGGER_LABELS = {
  session_boundary: 'Session boundary',
  edit_distance: 'Edit cap',
  semantic: 'Destructive edit',
  manual: 'Manual',
} as const;
const CHECKPOINT_TRIGGER_BADGE_VARIANT = {
  session_boundary: 'secondary',
  edit_distance: 'outline',
  semantic: 'destructive',
  manual: 'default',
} as const;

interface VideoEditorShellProps {
  mode: 'full' | 'compact';
  timelineId?: string | null;
  onCreateTimeline?: () => void;
}

function FullEditorLayout({ timelineId, forceCondensed = false }: { timelineId: string; forceCondensed?: boolean }) {
  const editor = useTimelineEditorContext();
  const chrome = useTimelineChromeContext();
  const playback = useTimelinePlaybackContext();
  const { isGenerationsPaneLocked, setIsGenerationsPaneLocked } = usePanes();
  const location = useLocation();
  const navigate = useNavigate();
  const isOnEditorPage = location.pathname.startsWith('/tools/video-editor');
  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const [timelineHeight, setTimelineHeight] = useState<number | null>(null);
  const [isTimelineMaximized, setIsTimelineMaximized] = useState(false);
  /** In condensed mode: 'preview' (default) or 'properties' for the right panel. */
  const [condensedRightPanel, setCondensedRightPanel] = useState<'preview' | 'properties'>('preview');
  const conflict = useTimelineRealtime({
    timelineId,
    conflictExhausted: chrome.isConflictExhausted,
    saveStatus: chrome.saveStatus,
    onKeepLocalChanges: chrome.retrySaveAfterConflict,
    onDiscardRemoteChanges: chrome.reloadFromServer,
  });

  useKeyboardShortcuts({
    hasSelectedClip: editor.selectedClipIds.size > 0,
    canMoveSelectedClipToTrack: editor.selectedClipIds.size >= 1,
    selectedClipIds: editor.selectedClipIds,
    moveSelectedClipsToTrack: editor.moveSelectedClipsToTrack,
    undo: chrome.undo,
    redo: chrome.redo,
    selectAllClips: () => editor.selectClips(Object.keys(editor.data?.meta ?? {})),
    togglePlayPause: () => playback.previewRef.current?.togglePlayPause(),
    seekRelative: (deltaSeconds) => playback.previewRef.current?.seek(Math.max(0, playback.currentTime + deltaSeconds)),
    toggleMute: () => editor.handleToggleMuteClips([...editor.selectedClipIds]),
    splitSelectedClip: editor.handleSplitSelectedClip,
    deleteSelectedClip: () => editor.handleDeleteClips([...editor.selectedClipIds]),
    clearSelection: editor.clearSelection,
  });

  const onDividerMouseDown = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    setIsTimelineMaximized(false);
    const container = containerRef.current;
    const divider = dividerRef.current;
    if (!container || !divider) {
      return;
    }

    divider.classList.add('is-dragging');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const nextHeight = Math.max(MIN_TIMELINE_HEIGHT, rect.bottom - moveEvent.clientY);
      if (rect.height - nextHeight < MIN_PREVIEW_HEIGHT) {
        return;
      }
      container.style.gridTemplateRows = `minmax(0,1fr) auto ${nextHeight}px`;
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      divider.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const match = container.style.gridTemplateRows.match(/(\d+)px$/);
      container.style.gridTemplateRows = '';
      if (match) {
        setTimelineHeight(Number.parseInt(match[1], 10));
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  // Switch to condensed when there isn't enough vertical space for preview + timeline
  const MIN_STANDARD_HEIGHT = MIN_PREVIEW_HEIGHT + MIN_TIMELINE_HEIGHT + 40 + 28 + 24; // preview + timeline + header + divider + padding
  const [tooSmall, setTooSmall] = useState(false);
  const outerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = outerRef.current;
    if (!el || forceCondensed || isGenerationsPaneLocked) return;

    const observer = new ResizeObserver(([entry]) => {
      setTooSmall(entry.contentRect.height < MIN_STANDARD_HEIGHT);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [forceCondensed, isGenerationsPaneLocked, MIN_STANDARD_HEIGHT]);

  const condensed = forceCondensed || isGenerationsPaneLocked || tooSmall;

  const gridTemplateRows = isTimelineMaximized
    ? `${MIN_PREVIEW_HEIGHT}px auto 1fr`
    : (timelineHeight ? `minmax(0,1fr) auto ${timelineHeight}px` : 'minmax(0,1fr) auto minmax(200px,36%)');

  const totalSeconds = useMemo(() => {
    if (!editor.resolvedConfig) return 1;
    return getTimelineDurationInFrames(editor.resolvedConfig, editor.resolvedConfig.output.fps) / editor.resolvedConfig.output.fps;
  }, [editor.resolvedConfig]);

  // ── Save badge (left of track buttons in toolbar) ───────────────────

  const saveBadge = (
    <Badge variant={STATUS_VARIANT[chrome.saveStatus]} className="h-5 px-1.5 text-[10px] capitalize">
      {chrome.saveStatus}
    </Badge>
  );
  const historyControls = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={chrome.undo}
        disabled={!chrome.canUndo}
        title="Undo"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={chrome.redo}
        disabled={!chrome.canRedo}
        title="Redo"
      >
        <Redo2 className="h-3.5 w-3.5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" title="History">
            <History className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel className="pb-1 text-xs font-semibold text-muted-foreground">
            History
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {chrome.checkpoints.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              No checkpoints yet. Save one manually or keep editing to build history.
            </div>
          ) : (
            chrome.checkpoints.map((checkpoint) => (
              <DropdownMenuItem
                key={checkpoint.id}
                className="flex flex-col items-start gap-1 py-2"
                onClick={() => chrome.jumpToCheckpoint(checkpoint.id)}
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <span className="truncate text-sm text-foreground">{checkpoint.label}</span>
                  <Badge
                    variant={CHECKPOINT_TRIGGER_BADGE_VARIANT[checkpoint.triggerType]}
                    className="shrink-0 px-1.5 py-0 text-[9px] uppercase tracking-[0.12em]"
                  >
                    {CHECKPOINT_TRIGGER_LABELS[checkpoint.triggerType]}
                  </Badge>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(checkpoint.createdAt), { addSuffix: true })}
                </span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void chrome.createManualCheckpoint()}>
            Save checkpoint
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  // ── Toolbar (shared between both layouts) ──────────────────────────

  const toolbar = (
    <div className="flex h-7 items-center justify-between gap-2 rounded-lg border border-border/70 bg-card/80 px-2 text-muted-foreground">
      <div className="flex items-center gap-1">
        {condensed && !forceCondensed && (
          <button
            type="button"
            className="mr-2 shrink-0 text-[11px] transition-colors hover:text-foreground"
            onClick={() => navigate('/')}
          >
            ← Back
          </button>
        )}
        {saveBadge}
        {historyControls}
      </div>
      {!condensed && (
        <div
          className="flex h-full flex-1 cursor-row-resize items-center justify-center"
          onMouseDown={onDividerMouseDown}
        >
          <GripHorizontal className="h-4 w-4 text-border" />
        </div>
      )}
      <div className="flex items-center gap-1">
        {!condensed && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsTimelineMaximized((value) => !value)}
            title={isTimelineMaximized ? 'Restore preview and timeline split' : 'Maximize timeline'}
          >
            {isTimelineMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        )}
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => chrome.setScaleWidth((value) => Math.max(value / 1.4, 40))}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => chrome.setScaleWidth((value) => Math.min(value * 1.4, 500))}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  // ── Preview overlay (time top-left, render top-right) ──────────────

  const previewOverlay = (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3 py-3">
      <span className="pointer-events-auto rounded bg-background/70 px-1.5 py-0.5 font-mono text-[11px] tracking-[0.08em] text-muted-foreground backdrop-blur-sm">{playback.formatTime(playback.currentTime)}</span>
      <div className="pointer-events-auto flex items-center gap-1">
        {condensed && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-3 text-[11px]"
            onClick={() => {
              if (isOnEditorPage && isGenerationsPaneLocked) {
                setIsGenerationsPaneLocked(false);
              } else {
                navigate(`/tools/video-editor?timeline=${timelineId}`);
              }
            }}
          >
            <Maximize2 className="h-3 w-3" />
            Editor
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1.5 px-3 text-[11px]"
          onClick={() => void chrome.startRender()}
          disabled={chrome.renderStatus === 'rendering'}
        >
          <Download className="h-3.5 w-3.5" />
          {chrome.renderStatus === 'rendering' && chrome.renderProgress
            ? `Render ${chrome.renderProgress.percent}%`
            : 'Render'}
        </Button>
        {chrome.renderResultUrl && chrome.renderStatus === 'done' && !chrome.renderDirty && (
          <a
            href={chrome.renderResultUrl}
            download={chrome.renderResultFilename ?? undefined}
            className="rounded-md border border-border/70 bg-background/80 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Download
          </a>
        )}
      </div>
    </div>
  );


  return (
    <>
      <div ref={outerRef} className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
        {!condensed && (
          <div className="flex h-10 items-center gap-3 border-b border-border bg-background px-3 text-sm text-muted-foreground">
            <button
              type="button"
              className="shrink-0 transition-colors hover:text-foreground"
              onClick={() => navigate('/')}
            >
              ← Back
            </button>
            <div className="truncate text-foreground">{chrome.timelineName ?? 'Untitled timeline'}</div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto h-7 w-7 text-muted-foreground"
              onClick={() => dispatchAppEvent('openSettings', {})}
              title="Settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {condensed ? (
          /* ── Condensed layout: timeline left, preview or props right ── */
          <main className="grid h-full min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] grid-rows-[auto_minmax(0,1fr)] gap-3 p-3">
            <div className="col-span-1">
              {toolbar}
            </div>

            <div className="row-span-2 flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/80">
              <div className="flex items-center border-b border-border">
                <button
                  type="button"
                  className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors ${condensedRightPanel === 'preview' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setCondensedRightPanel('preview')}
                >
                  <Eye className="h-3 w-3" />
                  Preview
                </button>
                <button
                  type="button"
                  className={`flex flex-1 items-center justify-center gap-1.5 border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors ${condensedRightPanel === 'properties' ? 'border-transparent bg-accent text-foreground' : editor.selectedClipIds.size > 0 ? 'border-sky-400 text-muted-foreground hover:text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setCondensedRightPanel('properties')}
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  Properties
                </button>
              </div>

              {condensedRightPanel === 'preview' ? (
                <div className="relative flex min-h-0 flex-1 flex-col">
                  {previewOverlay}
                  <div className="min-h-0 flex-1">
                    {editor.resolvedConfig && (
                      <RemotionPreview
                        ref={playback.previewRef}
                        config={editor.resolvedConfig}
                        compact
                        initialTime={playback.currentTime}
                        onTimeUpdate={playback.onPreviewTimeUpdate}
                        playerContainerRef={playback.playerContainerRef}
                      />
                    )}
                  </div>
                  <div className="border-t border-border px-3 py-2">
                    <Slider
                      value={[playback.currentTime]}
                      min={0}
                      max={Math.max(1, totalSeconds)}
                      step={0.05}
                      onValueChange={(value) => playback.previewRef.current?.seek(value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-auto p-3">
                  <PropertiesPanel />
                </div>
              )}
            </div>

            <div className="relative col-span-1 min-h-0 overflow-hidden">
              <TimelineEditor />

            </div>

            <AgentChat timelineId={timelineId} />
          </main>
        ) : (
          /* ── Standard layout: preview top, timeline bottom ── */
          <main
            ref={containerRef}
            className="grid h-full min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] gap-3 p-3"
            style={{ gridTemplateRows }}
          >
            <div className="relative min-h-0">
              {previewOverlay}
              <PreviewPanel />
            </div>

            <div className="row-span-2 min-h-0 overflow-hidden">
              <PropertiesPanel />
            </div>

            <div ref={dividerRef} className="col-span-1">
              {toolbar}
            </div>

            <div className="relative col-span-2 min-h-0 overflow-hidden">
              <TimelineEditor />

            </div>

            <AgentChat timelineId={timelineId} />
          </main>
        )}
      </div>

      <AlertDialog open={conflict.isOpen} onOpenChange={conflict.setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remote timeline changes detected</AlertDialogTitle>
            <AlertDialogDescription>
              Another tab updated this timeline while you still have unsaved local edits. Keep your local draft or discard it and reload the latest server version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => void conflict.keepLocalChanges()}>Keep local draft</AlertDialogCancel>
            <AlertDialogAction onClick={() => void conflict.discardAndReload()}>Discard and reload</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function VideoEditorShellComponent({ mode, timelineId, onCreateTimeline }: VideoEditorShellProps) {
  if (!timelineId) {
    if (mode === 'compact') {
      return <CompactPreview timelineId={timelineId} onCreateTimeline={onCreateTimeline} />;
    }
    return null;
  }

  return <FullEditorLayout timelineId={timelineId} forceCondensed={mode === 'compact'} />;
}

export const VideoEditorShell = memo(VideoEditorShellComponent);
