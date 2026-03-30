import React, { useEffect, useMemo } from 'react';
import { Film } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/shared/components/ui/contracts/cn';
import { PaneControlTab } from '@/shared/components/PaneControlTab';
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { useToolSettings } from '@/shared/hooks/settings/useToolSettings';
import { Button } from '@/shared/components/ui/button';
import { isVideoEditorRoute } from '@/app/hooks/useVideoEditorRouteState';
import { SupabaseDataProvider } from '@/tools/video-editor/data/SupabaseDataProvider';
import { VideoEditorProvider } from '@/tools/video-editor/contexts/VideoEditorProvider';
import { useTimelinesList } from '@/tools/video-editor/hooks/useTimelinesList';
import { videoEditorSettings } from '@/tools/video-editor/settings/videoEditorDefaults';
import { VideoEditorShell } from '@/tools/video-editor/components/VideoEditorShell';

function useEditorPane() {
  const {
    isEditorPaneLocked,
    setIsEditorPaneLocked,
    setIsEditorPaneOpen,
    effectiveEditorPaneHeight,
    isShotsPaneLocked,
    shotsPaneWidth,
    isTasksPaneLocked,
    tasksPaneWidth,
  } = usePanes();

  const pane = useSlidingPane({
    side: 'top',
    isLocked: isEditorPaneLocked,
    onToggleLock: () => setIsEditorPaneLocked(!isEditorPaneLocked),
    onOpenChange: setIsEditorPaneOpen,
  });

  const adjustedEditorPaneHeight = effectiveEditorPaneHeight;

  return {
    pane,
    effectiveEditorPaneHeight: adjustedEditorPaneHeight,
    isEditorPaneLocked,
    setIsEditorPaneLocked,
    isShotsPaneLocked,
    shotsPaneWidth,
    isTasksPaneLocked,
    tasksPaneWidth,
  };
}

const EditorPaneComponent: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedProjectId } = useProjectSelectionContext();
  const { userId } = useAuth();
  const { settings, update } = useToolSettings(videoEditorSettings.id, {
    projectId: selectedProjectId ?? undefined,
    enabled: Boolean(selectedProjectId),
  });
  const timelines = useTimelinesList(selectedProjectId, userId);
  const {
    pane,
    effectiveEditorPaneHeight,
    isEditorPaneLocked,
    setIsEditorPaneLocked,
    isShotsPaneLocked,
    shotsPaneWidth,
    isTasksPaneLocked,
    tasksPaneWidth,
  } = useEditorPane();

  const activeTimelineId = settings?.lastTimelineId ?? timelines.data?.[0]?.id ?? null;
  const provider = useMemo(() => {
    if (!selectedProjectId || !userId) {
      return null;
    }
    return new SupabaseDataProvider({ projectId: selectedProjectId, userId });
  }, [selectedProjectId, userId]);

  useEffect(() => {
    if (isVideoEditorRoute(location.pathname) && isEditorPaneLocked) {
      setIsEditorPaneLocked(false);
    }
  }, [location.pathname, isEditorPaneLocked, setIsEditorPaneLocked]);

  if (isVideoEditorRoute(location.pathname)) {
    return null;
  }

  const horizontalOffset =
    (isShotsPaneLocked ? shotsPaneWidth : 0) -
    (isTasksPaneLocked ? tasksPaneWidth : 0);
  const activeTimelineName = timelines.data?.find((timeline) => timeline.id === activeTimelineId)?.name ?? null;
  const createTimeline = async () => {
    const created = await timelines.createTimeline.mutateAsync('Main timeline');
    await update('project', { lastTimelineId: created.id });
    navigate(`/tools/video-editor?timeline=${created.id}`);
  };

  return (
    <>
      {/* Control tab */}
      <PaneControlTab
        position={{
          side: 'top',
          paneDimension: effectiveEditorPaneHeight,
          horizontalOffset,
        }}
        state={{ isLocked: pane.isLocked, isOpen: pane.isOpen }}
        handlers={{
          toggleLock: pane.toggleLock,
          openPane: pane.openPane,
          handlePaneEnter: pane.handlePaneEnter,
          handlePaneLeave: pane.handlePaneLeave,
        }}
        display={{
          paneTooltip: 'Open editor',
          shortcutHint: '⌥W',
        }}
        actions={{
          thirdButton: {
            onClick: () => {
              if (activeTimelineId) {
                navigate(`/tools/video-editor?timeline=${activeTimelineId}`);
                return;
              }
              navigate('/tools/video-editor');
            },
            ariaLabel: 'Go to editor',
            tooltip: 'Go to editor (⌥⇧W)',
            content: <Film className="h-4 w-4" />,
          },
        }}
      />

      {/* Pane surface */}
      <div
        {...pane.paneProps}
        data-testid="editor-pane"
        style={{
          height: `${effectiveEditorPaneHeight}px`,
          marginLeft: isShotsPaneLocked ? `${shotsPaneWidth}px` : '0px',
          marginRight: isTasksPaneLocked ? `${tasksPaneWidth}px` : '0px',
          zIndex: 59,
        }}
        className={cn(
          'fixed top-0 left-0 right-0 flex flex-col border-b border-border bg-background/95 shadow-xl backdrop-blur-sm transform transition-[margin,padding] duration-300 ease-smooth pointer-events-auto',
          pane.transformClass,
        )}
      >
        {provider && userId && activeTimelineId ? (
          <VideoEditorProvider dataProvider={provider} timelineId={activeTimelineId} timelineName={activeTimelineName} userId={userId}>
            <VideoEditorShell mode="compact" timelineId={activeTimelineId} onCreateTimeline={() => void createTimeline()} />
          </VideoEditorProvider>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="rounded-xl border border-dashed border-border bg-card/70 p-6 text-center">
              <div className="text-sm font-medium text-foreground">No active timeline</div>
              <div className="mt-1 text-xs text-muted-foreground">Create one in the standalone editor or from this pane.</div>
              <div className="mt-4 flex justify-center gap-2">
                <Button type="button" size="sm" onClick={() => void createTimeline()} disabled={!selectedProjectId || !userId}>
                  Create timeline
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => navigate('/tools/video-editor')}>
                  Open editor
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export const EditorPane = React.memo(EditorPaneComponent);
