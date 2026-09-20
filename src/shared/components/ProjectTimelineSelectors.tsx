import { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover.tsx';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/components/ui/command.tsx';
import { ChevronsUpDown, HardDrive, Star } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn.ts';
import type { UseAstridBridgeDiscoveryResult } from '@/tools/video-editor/hooks/useAstridBridgeDiscovery.ts';

interface ProjectTimelineSelectorsProps {
  localProjectSlug: string | null;
  localTimelineId: string | null;
  localTimelineName: string | null;
  /** Result of `useAstridBridgeDiscovery` (owned by the page). */
  discovery: UseAstridBridgeDiscoveryResult;
  /** Called with the selected Astrid project slug. */
  onSelectProject: (projectSlug: string) => void;
  onSelectTimeline: (timelineId: string) => void;
  /** Persists the project-level primary timeline selection. */
  onSetPrimaryTimeline?: (timelineId: string) => void;
  /** Canonical timeline id currently being promoted, if any. */
  settingPrimaryTimelineId?: string | null;
  /** Disables the triggers while a save is in flight. */
  disabled?: boolean;
  /** The app-wide header already owns the project selector in the live shell. */
  showProjectSelector?: boolean;
  /** The shared app header omits the editor timeline picker outside the editor. */
  showTimelineSelector?: boolean;
  /** Reports whether any dropdown is open (drives discovery refetch/polling). */
  onOpenChange?: (open: boolean) => void;
}

const triggerClass = cn(
  'flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-border/70 bg-card/80 px-2 text-xs',
  'text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'disabled:pointer-events-none disabled:opacity-50',
);

const timelineRecency = (timeline: { created_at?: string; updated_at?: string }): number | null => {
  const value = timeline.updated_at ?? timeline.created_at;
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

export function ProjectTimelineSelectors({
  localProjectSlug,
  localTimelineId,
  localTimelineName,
  discovery,
  onSelectProject,
  onSelectTimeline,
  onSetPrimaryTimeline,
  settingPrimaryTimelineId = null,
  disabled = false,
  showProjectSelector = true,
  showTimelineSelector = true,
  onOpenChange,
}: ProjectTimelineSelectorsProps) {
  const [projectOpen, setProjectOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  useEffect(() => {
    onOpenChange?.(projectOpen || timelineOpen);
  }, [projectOpen, timelineOpen, onOpenChange]);

  const localProjects = discovery.projectsQuery.data?.projects ?? [];
  const discoveredLocalTimelines = discovery.timelinesQuery.data?.timelines ?? [];
  const localTimelines = discoveredLocalTimelines
    .map((timeline, index) => ({ timeline, index }))
    .filter(({ timeline }) => (
      !timeline.is_shot
      || timeline.timeline_id === localTimelineId
      || timeline.timeline_ulid === localTimelineId
    ))
    .sort((left, right) => {
      const leftRecency = timelineRecency(left.timeline);
      const rightRecency = timelineRecency(right.timeline);
      if (leftRecency !== null && rightRecency !== null && leftRecency !== rightRecency) {
        return rightRecency - leftRecency;
      }
      if ((leftRecency !== null) !== (rightRecency !== null)) {
        return leftRecency === null ? 1 : -1;
      }
      // The current Astrid list contract does not expose timestamps. Its
      // stable response order is oldest-first, so reverse that order as the
      // deterministic fallback until timestamps are available.
      return right.index - left.index;
    })
    .map(({ timeline }) => timeline);

  const projectTriggerLabel = localProjectSlug ?? 'Select project';
  const timelineTriggerLabel = localTimelineName ?? localTimelineId ?? 'Timeline';

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2" data-testid="editor-project-timeline-selectors">
      {showProjectSelector && (
        <Popover open={projectOpen} onOpenChange={setProjectOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={projectOpen}
              aria-label="Select project"
              disabled={disabled}
              className={cn(triggerClass, 'max-w-56')}
            >
              <HardDrive className="h-3.5 w-3.5 shrink-0" />
              <span className={cn('truncate', localProjectSlug && 'preserve-case')}>
                {projectTriggerLabel}
              </span>
              <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search projects..." className="h-8" />
              <CommandList>
                <CommandEmpty>No projects found.</CommandEmpty>
                <CommandGroup heading="Astrid projects">
                  {localProjects.length === 0 ? (
                    <div className="space-y-1.5 px-2 py-3 text-xs text-muted-foreground" data-testid="local-projects-empty">
                      {discovery.healthQuery.isLoading ? (
                        <p>Checking Astrid bridge…</p>
                      ) : discovery.projectsQuery.isLoading ? (
                        <p>Loading Astrid projects…</p>
                      ) : discovery.bridgeDown ? (
                        <>
                          <p className="font-medium text-foreground">No Astrid projects found</p>
                          <p>
                            Launch the bridge:{' '}
                            <code className="rounded bg-muted px-1 py-0.5">cd ../Astrid &amp;&amp; astrid serve --port 17333</code>
                          </p>
                          <p>
                            Or run <code className="rounded bg-muted px-1 py-0.5">npm run dev:editor:bridge</code>
                          </p>
                        </>
                      ) : (
                        <p>Start Astrid with a projects root that contains project.json files.</p>
                      )}
                    </div>
                  ) : (
                      localProjects.map((project) => (
                      <CommandItem
                        key={project.slug}
                        value={project.slug}
                        keywords={[project.name, project.slug]}
                        onSelect={() => {
                          onSelectProject(project.slug);
                          setProjectOpen(false);
                        }}
                      >
                        <HardDrive className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate preserve-case">{project.name}</span>
                        <span className="ml-auto shrink-0 pl-2 font-mono text-[10px] text-muted-foreground">
                          {project.slug}
                        </span>
                      </CommandItem>
                    ))
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {showTimelineSelector && (
        <Popover open={timelineOpen} onOpenChange={setTimelineOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={timelineOpen}
              aria-label="Select timeline"
              disabled={disabled}
              className={cn(triggerClass, 'max-w-48')}
            >
              <span className={cn('truncate', localTimelineName && 'preserve-case')}>
                {timelineTriggerLabel}
              </span>
              <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search timelines..." className="h-8" />
              <CommandList>
                <CommandEmpty>No timelines found.</CommandEmpty>
                <CommandGroup heading="Timelines">
                  {localTimelines.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground" data-testid="local-timelines-empty">
                      {discovery.timelinesQuery.isLoading ? 'Loading timelines…' : 'No timelines for this project yet.'}
                    </div>
                  ) : (
                    localTimelines.map((timeline) => {
                      const isPrimary = timeline.is_default === true;
                      const isSettingPrimary = settingPrimaryTimelineId === timeline.timeline_id;
                      return (
                        <CommandItem
                          key={timeline.timeline_id}
                          value={timeline.timeline_id}
                          keywords={[timeline.name, timeline.timeline_id, timeline.slug ?? '']}
                          className="group"
                          onSelect={() => {
                            // The ULID is the routable address for bridge
                            // requests; the canonical timeline_id is identity.
                            onSelectTimeline(timeline.timeline_ulid ?? timeline.timeline_id);
                            setTimelineOpen(false);
                          }}
                        >
                          <span className="truncate preserve-case">{timeline.name}</span>
                          {isPrimary && (
                            <span className="ml-auto shrink-0 pl-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                              Primary
                            </span>
                          )}
                          {!isPrimary && onSetPrimaryTimeline && (
                            <button
                              type="button"
                              aria-label={`Make ${timeline.name} primary`}
                              title={`Make ${timeline.name} primary`}
                              disabled={settingPrimaryTimelineId !== null}
                              className={cn(
                                'ml-auto shrink-0 rounded p-1 text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground',
                                'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                                settingPrimaryTimelineId !== null && 'opacity-100',
                              )}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onSetPrimaryTimeline(timeline.timeline_id);
                              }}
                            >
                              <Star className={cn('h-3.5 w-3.5', isSettingPrimary && 'animate-pulse fill-current')} />
                            </button>
                          )}
                        </CommandItem>
                      );
                    })
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
