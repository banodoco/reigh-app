import React, { useCallback } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/shared/components/ui/contracts/cn';
import { PaneControlTab } from '@/shared/components/PaneControlTab';
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { ShotsPanelContent } from '@/features/editor/components/ShotsPanelContent';
import type { Shot } from '@/domains/generation/types';

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
  const navigate = useNavigate();
  const { selectedProjectId } = useProjectSelectionContext();
  const {
    pane,
    effectiveEditorPaneHeight,
    isShotsPaneLocked,
    shotsPaneWidth,
    isTasksPaneLocked,
    tasksPaneWidth,
  } = useEditorPane();

  const horizontalOffset =
    (isShotsPaneLocked ? shotsPaneWidth : 0) -
    (isTasksPaneLocked ? tasksPaneWidth : 0);

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
          paneTooltip: 'Shots',
          shortcutHint: '⌥W',
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
        {selectedProjectId ? (
          <ShotsPanelContent
            projectId={selectedProjectId}
            onOpenVideoGeneration={(shot) => navigate(`/tools/travel-between-images?shot=${shot.id}`)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Select a project to browse shots
          </div>
        )}
      </div>
    </>
  );
};

export const EditorPane = React.memo(EditorPaneComponent);
