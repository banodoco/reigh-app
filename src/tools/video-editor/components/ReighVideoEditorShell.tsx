import { memo, useCallback, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useHomeNavigation } from '@/shared/hooks/useHomeNavigation.ts';
import { usePanesStore } from '@/shared/state/panesStore.ts';
import { CompactPreview } from '@/tools/video-editor/components/CompactPreview.tsx';
import { TimelineEditorShellCore } from '@/tools/video-editor/components/TimelineEditorShellCore.tsx';
import type { AppHeaderNavigationMode } from '@/shared/components/AppHeader.tsx';

interface ReighVideoEditorShellProps {
  mode: 'full' | 'compact';
  timelineId?: string | null;
  onCreateTimeline?: () => void;
  /** Shared header controls rendered beside the navigation action. */
  navigationControls?: ReactNode;
  navigationMode?: AppHeaderNavigationMode;
  showHeader?: boolean;
}

function ReighVideoEditorShellComponent({
  mode,
  timelineId,
  onCreateTimeline,
  navigationControls,
  navigationMode,
  showHeader = true,
}: ReighVideoEditorShellProps) {
  const { navigateHome } = useHomeNavigation();
  const isEditorPaneLocked = usePanesStore((state) => state.isEditorPaneLocked);
  const isGenerationsPaneLocked = usePanesStore((state) => state.isGenerationsPaneLocked);
  const isGenerationsPaneOpen = usePanesStore((state) => state.isGenerationsPaneOpen);
  const setIsGenerationsPaneLocked = usePanesStore((state) => state.setIsGenerationsPaneLocked);
  const location = useLocation();
  const navigate = useNavigate();
  const isOnEditorPage = location.pathname.startsWith('/tools/video-editor');
  const openEditorRoute = useCallback((nextTimelineId: string) => {
    navigate(`/tools/video-editor?timeline=${nextTimelineId}`);
  }, [navigate]);

  if (!timelineId) {
    if (mode === 'compact') {
      return <CompactPreview timelineId={timelineId} onCreateTimeline={onCreateTimeline} />;
    }
    return null;
  }

  return (
    <TimelineEditorShellCore
      timelineId={timelineId}
      forceCondensed={mode === 'compact'}
      isOnEditorPage={isOnEditorPage}
      isEditorPaneLocked={isEditorPaneLocked}
      isGenerationsPaneLocked={isGenerationsPaneLocked}
      isGenerationsPaneOpen={isGenerationsPaneOpen}
      onSetGenerationsPaneLocked={setIsGenerationsPaneLocked}
      onNavigateHome={navigateHome}
      onOpenEditorRoute={openEditorRoute}
      navigationControls={navigationControls}
      navigationMode={navigationMode}
      showHeader={showHeader}
    />
  );
}

export const ReighVideoEditorShell = memo(ReighVideoEditorShellComponent);
