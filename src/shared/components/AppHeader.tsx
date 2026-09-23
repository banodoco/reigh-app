import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Home, LayoutGrid, Settings } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button.tsx';
import { cn } from '@/shared/components/ui/contracts/cn.ts';
import { dispatchAppEvent } from '@/shared/lib/typedEvents.ts';
import { ProjectTimelineSelectors } from '@/shared/components/ProjectTimelineSelectors.tsx';
import { ProjectHeaderActions } from '@/shared/components/ProjectHeaderActions.tsx';
import { useAstridBridgeDiscovery } from '@/tools/video-editor/hooks/useAstridBridgeDiscovery.ts';
import { useQueryClient } from '@tanstack/react-query';

export type AppHeaderNavigationMode = 'home' | 'tools';

interface AppHeaderProps {
  navigationMode?: AppHeaderNavigationMode;
  onNavigate?: () => void;
  navigationControls?: ReactNode;
  timelineName?: string | null;
  showProjectControls?: boolean;
}

function AppHeaderProjectControls() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const localProjectSlug = searchParams.get('localProject');
  const localTimelineId = searchParams.get('localTimeline');
  const [selectorsOpen, setSelectorsOpen] = useState(false);
  const discovery = useAstridBridgeDiscovery({
    open: selectorsOpen,
    // Astrid is the product authority. URL parameters select a project and
    // timeline; they do not switch the header between cloud and local modes.
    currentLocal: true,
    selectedProjectSlug: localProjectSlug,
  });
  const selectedProject = discovery.projectsQuery.data?.projects?.find(
    (project) => project.slug === localProjectSlug,
  ) ?? null;

  const refreshProjects = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['astrid-bridge', 'projects'] });
  }, [queryClient]);

  const handleProjectChange = useCallback((nextProjectSlug: string) => {
    if (nextProjectSlug) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('localProject', nextProjectSlug);
        next.delete('localTimeline');
        next.delete('timeline');
        return next;
      }, { replace: true });
    }
  }, [setSearchParams]);

  return (
    <>
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
        <ProjectTimelineSelectors
          localProjectSlug={localProjectSlug}
          localTimelineId={localTimelineId}
          localTimelineName={null}
          discovery={discovery}
          onSelectProject={handleProjectChange}
          onSelectTimeline={() => undefined}
          disabled={false}
          showProjectSelector
          showTimelineSelector={false}
          onOpenChange={setSelectorsOpen}
        />
        <ProjectHeaderActions
          selectedProject={selectedProject}
          onProjectCreated={refreshProjects}
          onProjectUpdated={refreshProjects}
          disabled={discovery.projectsQuery.isLoading}
        />
      </div>
    </>
  );
}

/**
 * The single built-in app header. It is shared by the loaded editor,
 * project/timeline fallback states, and the other tools so navigation does not
 * change when the route changes.
 */
export function AppHeader({
  navigationMode = 'home',
  onNavigate,
  navigationControls,
  timelineName,
  showProjectControls = false,
}: AppHeaderProps) {
  const isToolsNavigation = navigationMode === 'tools';
  const navigationLabel = isToolsNavigation ? 'Tools' : 'Home';
  const NavigationIcon = isToolsNavigation ? LayoutGrid : Home;

  return (
    <header
      className="flex min-h-10 w-full min-w-0 flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-1.5 text-sm text-muted-foreground"
      data-testid="video-editor-header"
    >
      {onNavigate && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
          onClick={onNavigate}
          aria-label={isToolsNavigation ? 'Open tools' : 'Go home'}
          title={isToolsNavigation ? 'Open tools' : 'Go home'}
        >
          <NavigationIcon className="h-3.5 w-3.5" />
          <span>{navigationLabel}</span>
        </Button>
      )}

      {showProjectControls && (
        <AppHeaderProjectControls />
      )}

      {navigationControls && (
        <div
          className="flex min-w-0 max-w-full flex-1 flex-wrap items-center gap-2"
          data-testid="video-editor-navigation-controls"
        >
          {navigationControls}
        </div>
      )}

      {timelineName && (
        <div className={cn('min-w-0 truncate text-foreground', !navigationControls && 'ml-1')}>
          <span className="preserve-case">{timelineName}</span>
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="ml-auto h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => dispatchAppEvent('openSettings', {})}
        title="Settings"
        aria-label="Settings"
      >
        <Settings className="h-3.5 w-3.5" />
      </Button>

    </header>
  );
}
