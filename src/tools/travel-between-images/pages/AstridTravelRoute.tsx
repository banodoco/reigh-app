import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card.tsx';
import { useAstridBridgeDiscovery } from '@/tools/video-editor/hooks/useAstridBridgeDiscovery.ts';
import { LocalTimelineShotBrowser } from './LocalTimelineShotBrowser.tsx';

function chooseTimeline(
  timelines: Array<{
    timeline_id: string;
    timeline_ulid?: string;
    slug?: string;
    is_default?: boolean;
  }>,
) {
  return timelines.find((timeline) => timeline.is_default)
    ?? timelines.find((timeline) => timeline.slug === 'main')
    ?? timelines.find((timeline) => timeline.slug === 'rough-cut')
    ?? timelines[0]
    ?? null;
}

/**
 * Astrid-first entry route for Travel Between Images.
 *
 * Project/timeline URL parameters are selection state, not an authority
 * switch. A project selected from the shared header resolves its primary
 * timeline here, then the document-native shot browser owns the page.
 */
export function AstridTravelRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectSlug = searchParams.get('localProject')?.trim() || null;
  const timelineRef = searchParams.get('localTimeline')?.trim() || null;
  const discovery = useAstridBridgeDiscovery({
    open: true,
    currentLocal: true,
    selectedProjectSlug: projectSlug,
  });
  const timelines = discovery.timelinesQuery.data?.timelines ?? null;
  const selectedProject = useMemo(
    () => discovery.projectsQuery.data?.projects?.find((project) => project.slug === projectSlug) ?? null,
    [discovery.projectsQuery.data?.projects, projectSlug],
  );
  const defaultTimeline = useMemo(
    () => timelines ? chooseTimeline(timelines) : null,
    [timelines],
  );

  useEffect(() => {
    if (
      !projectSlug
      || timelineRef
      || discovery.timelinesQuery.isLoading
      || discovery.timelinesQuery.error
      || !defaultTimeline
    ) {
      return;
    }

    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('localProject', projectSlug);
      next.set('localTimeline', defaultTimeline.timeline_ulid ?? defaultTimeline.timeline_id);
      return next;
    }, { replace: true });
  }, [
    defaultTimeline,
    discovery.timelinesQuery.error,
    discovery.timelinesQuery.isLoading,
    projectSlug,
    setSearchParams,
    timelineRef,
  ]);

  if (projectSlug && timelineRef) {
    return (
      <LocalTimelineShotBrowser
        projectSlug={projectSlug}
        projectId={selectedProject?.project_id}
        timelineRef={timelineRef}
      />
    );
  }

  let title = 'Select an Astrid project';
  let description = 'Choose a project from the header to open its primary timeline.';

  if (discovery.healthQuery.isLoading || discovery.projectsQuery.isLoading) {
    title = 'Loading Astrid projects';
    description = 'Connecting to the local Astrid workspace…';
  } else if (discovery.bridgeDown) {
    title = 'Astrid is unavailable';
    description = discovery.healthQuery.error?.message ?? 'Start the Astrid bridge, then refresh this page.';
  } else if (projectSlug && !selectedProject && discovery.projectsQuery.data) {
    title = 'Astrid project not found';
    description = `No project named “${projectSlug}” was returned by the Astrid workspace.`;
  } else if (projectSlug && discovery.timelinesQuery.isLoading) {
    title = 'Loading project timelines';
    description = 'Finding the primary timeline for this Astrid project…';
  } else if (projectSlug && timelines?.length === 0) {
    title = 'No timelines in this project';
    description = 'Create a timeline with Astrid, then refresh this page.';
  } else if (projectSlug && discovery.timelinesQuery.error) {
    title = 'Unable to load project timelines';
    description = discovery.timelinesQuery.error.message;
  }

  return (
    <div className="flex h-full min-h-0 items-center justify-center px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {discovery.bridgeDown && <AlertCircle className="h-4 w-4 text-destructive" />}
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
