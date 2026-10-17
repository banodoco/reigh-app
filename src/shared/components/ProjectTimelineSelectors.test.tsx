// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ProjectTimelinePicker, ProjectTimelineSelectors } from '@/shared/components/ProjectTimelineSelectors.tsx';
import type { UseAstridBridgeDiscoveryResult } from '@/tools/video-editor/hooks/useAstridBridgeDiscovery.ts';

const LOCAL_PROJECTS = [
  { slug: 'ados-talks', name: 'Ados Talks' },
  { slug: 'other-project', name: 'Other Project' },
];

const LOCAL_TIMELINES = [
  {
    timeline_id: '11111111-1111-1111-1111-111111111111',
    timeline_ulid: '01JM4K5N7P0000000000000017',
    slug: 'intro-cut',
    name: 'Intro Cut',
    is_default: true,
  },
  {
    timeline_id: '22222222-2222-2222-2222-222222222222',
    timeline_ulid: '01JM4K5N7P0000000000000018',
    slug: 'alt-cut',
    name: 'Alt Cut',
    is_default: false,
  },
];

function makeDiscovery(overrides?: Partial<UseAstridBridgeDiscoveryResult>): UseAstridBridgeDiscoveryResult {
  return {
    healthQuery: {
      isLoading: false,
      isError: false,
      error: null,
      data: true,
    } as UseAstridBridgeDiscoveryResult['healthQuery'],
    projectsQuery: {
      isLoading: false,
      isError: false,
      error: null,
      data: { projects: LOCAL_PROJECTS },
    } as UseAstridBridgeDiscoveryResult['projectsQuery'],
    timelinesQuery: {
      isLoading: false,
      isError: false,
      error: null,
      data: { timelines: LOCAL_TIMELINES },
    } as UseAstridBridgeDiscoveryResult['timelinesQuery'],
    bridgeHealthy: true,
    bridgeDown: false,
    projectsEmpty: false,
    ...overrides,
  };
}

function renderSelectors({
  discovery,
  localProjectSlug = 'ados-talks',
  localProjectName = null,
  onSelectProject = vi.fn(),
  onSelectTimeline = vi.fn(),
  onSetPrimaryTimeline,
  disabled = false,
  onOpenChange,
  localTimelineName = 'Intro Cut',
}: {
  discovery?: UseAstridBridgeDiscoveryResult;
  localProjectSlug?: string | null;
  localProjectName?: string | null;
  onSelectProject?: (value: string) => void;
  onSelectTimeline?: (timelineId: string) => void;
  onSetPrimaryTimeline?: (timelineId: string) => void;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  localTimelineName?: string | null;
} = {}) {
  return render(
    <ProjectTimelineSelectors
      localProjectSlug={localProjectSlug}
      localProjectName={localProjectName}
      localTimelineId="11111111-1111-1111-1111-111111111111"
      localTimelineName={localTimelineName}
      discovery={discovery ?? makeDiscovery()}
      onSelectProject={onSelectProject}
      onSelectTimeline={onSelectTimeline}
      onSetPrimaryTimeline={onSetPrimaryTimeline}
      disabled={disabled}
      onOpenChange={onOpenChange}
    />,
  );
}

beforeAll(() => {
  // jsdom does not provide scrollIntoView, which cmdk calls internally.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
});

describe('ProjectTimelineSelectors', () => {
  it('shows a loading label while an explicit URL project is unresolved', () => {
    const discovery = makeDiscovery({
      healthQuery: {
        isLoading: true,
        isError: false,
        error: null,
        data: undefined,
      } as UseAstridBridgeDiscoveryResult['healthQuery'],
      projectsQuery: {
        isLoading: true,
        isError: false,
        isFetching: true,
        error: null,
        data: undefined,
      } as UseAstridBridgeDiscoveryResult['projectsQuery'],
    });

    renderSelectors({ discovery, localProjectSlug: 'the-lion-kink' });

    expect(screen.getByRole('combobox', { name: 'Select project' })).toHaveTextContent('Loading project…');
    expect(screen.queryByText('Select project')).not.toBeInTheDocument();
  });

  it('keeps the loaded project name visible while discovery refetches', () => {
    const loaded = makeDiscovery({
      projectsQuery: {
        isLoading: false,
        isError: false,
        isFetching: false,
        error: null,
        data: { projects: [{ slug: 'the-lion-kink', name: 'The Lion Kink' }] },
      } as UseAstridBridgeDiscoveryResult['projectsQuery'],
    });
    const view = renderSelectors({ discovery: loaded, localProjectSlug: 'the-lion-kink' });
    const refetching = makeDiscovery({
      projectsQuery: {
        isLoading: false,
        isError: false,
        isFetching: true,
        error: null,
        data: undefined,
      } as UseAstridBridgeDiscoveryResult['projectsQuery'],
    });

    view.rerender(
      <ProjectTimelineSelectors
        localProjectSlug="the-lion-kink"
        localProjectName={null}
        localTimelineId="11111111-1111-1111-1111-111111111111"
        localTimelineName={null}
        discovery={refetching}
        onSelectProject={vi.fn()}
        onSelectTimeline={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Select project' })).toHaveTextContent('The Lion Kink');
  });

  it('shows a loading label while discovering projects before restoring a selection', () => {
    const discovery = makeDiscovery({
      projectsQuery: {
        isLoading: true,
        isError: false,
        isFetching: true,
        error: null,
        data: undefined,
      } as UseAstridBridgeDiscoveryResult['projectsQuery'],
    });

    renderSelectors({ discovery, localProjectSlug: null });

    expect(screen.getByRole('combobox', { name: 'Select project' })).toHaveTextContent('Loading projects…');
  });

  it('reports an explicit project missing after the authoritative lookup', () => {
    const discovery = makeDiscovery({
      projectsQuery: {
        isLoading: false,
        isError: false,
        isFetching: false,
        error: null,
        data: { projects: LOCAL_PROJECTS },
      } as UseAstridBridgeDiscoveryResult['projectsQuery'],
    });

    renderSelectors({ discovery, localProjectSlug: 'missing-project' });

    expect(screen.getByRole('combobox', { name: 'Select project' })).toHaveTextContent('Project not found');
    expect(screen.getByRole('combobox', { name: 'Select project' })).not.toHaveTextContent('Loading project');
  });

  it('renders Astrid projects and reports the selected slug', async () => {
    const onSelectProject = vi.fn();
    renderSelectors({ onSelectProject });

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Select project' }));
    expect(await screen.findByText('Projects')).toBeInTheDocument();
    expect(screen.queryByText('Astrid App projects')).toBeNull();
    await user.click(await screen.findByText('Other Project'));

    expect(onSelectProject).toHaveBeenCalledWith('other-project');
  });

  it('shows the launch hint when the bridge is down and keeps the dropdown openable', async () => {
    const discovery = makeDiscovery({
      bridgeHealthy: false,
      bridgeDown: true,
      projectsEmpty: true,
      healthQuery: {
        isLoading: false,
        isError: true,
        error: new Error('unreachable'),
        data: false,
      } as UseAstridBridgeDiscoveryResult['healthQuery'],
      projectsQuery: {
        isLoading: false,
        isError: false,
        error: null,
        data: undefined,
      } as UseAstridBridgeDiscoveryResult['projectsQuery'],
    });
    renderSelectors({ discovery });

    // The trigger stays enabled even though there is nothing to select, so
    // the hint is reachable.
    const trigger = screen.getByRole('combobox', { name: 'Select project' });
    expect(trigger).not.toBeDisabled();

    const user = userEvent.setup();
    await user.click(trigger);

    expect(await screen.findByText(/Unable to connect to the local workspace/)).toBeInTheDocument();
  });

  it('shows the projects-root hint when the bridge is reachable but empty', async () => {
    const discovery = makeDiscovery({
      bridgeHealthy: true,
      bridgeDown: false,
      projectsEmpty: true,
      projectsQuery: {
        isLoading: false,
        isError: false,
        error: null,
        data: { projects: [] },
      } as UseAstridBridgeDiscoveryResult['projectsQuery'],
    });
    renderSelectors({ discovery });

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Select project' }));

    expect(await screen.findByText('No projects available.')).toBeInTheDocument();
  });

  it('renders the Astrid timeline dropdown', async () => {
    renderSelectors({});

    expect(screen.getByRole('combobox', { name: 'Select timeline' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Select timeline' })).toHaveTextContent('Intro Cut');
  });

  it('uses the discovered timeline name when the bridge name is unavailable', () => {
    renderSelectors({ localTimelineName: null });

    expect(screen.getByRole('combobox', { name: 'Select timeline' })).toHaveTextContent('Intro Cut');
  });

  it('lists the newest local timeline first', async () => {
    const discovery = makeDiscovery({
      timelinesQuery: {
        isLoading: false,
        isError: false,
        error: null,
        data: {
          timelines: [
            {
              ...LOCAL_TIMELINES[0],
              created_at: '2026-09-16T10:00:00Z',
            },
            {
              ...LOCAL_TIMELINES[1],
              created_at: '2026-09-17T10:00:00Z',
            },
          ],
        },
      } as UseAstridBridgeDiscoveryResult['timelinesQuery'],
    });
    renderSelectors({ discovery });

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Select timeline' }));

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('Alt Cut');
    expect(options[1]).toHaveTextContent('Intro Cut');
  });

  it('reports timeline selections through onSelectTimeline', async () => {
    const onSelectTimeline = vi.fn();
    renderSelectors({ onSelectTimeline });

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Select timeline' }));

    expect(await screen.findByRole('option', { name: /Intro Cut/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Alt Cut/ })).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /Alt Cut/ }));

    // The dropdown reports the ULID (the routable address), not the canonical
    // timeline_id (identity only).
    expect(onSelectTimeline).toHaveBeenCalledWith('01JM4K5N7P0000000000000018');
  });

  it('renames the current timeline with a trimmed name without selecting it', async () => {
    const onRenameTimeline = vi.fn().mockResolvedValue(undefined);
    const onSelectTimeline = vi.fn();
    render(
      <ProjectTimelinePicker
        projects={[]}
        timelines={[{ id: 'timeline-1', name: 'Intro Cut' }]}
        projectId="project-1"
        timelineId="timeline-1"
        onSelectProject={vi.fn()}
        onSelectTimeline={onSelectTimeline}
        onRenameTimeline={onRenameTimeline}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Select timeline' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Rename timeline' }));
    const input = await screen.findByRole('textbox', { name: 'Timeline name' });
    fireEvent.change(input, { target: { value: '  Opening Cut  ' } });
    fireEvent.submit(input.closest('form')!);

    expect(onRenameTimeline).toHaveBeenCalledWith('timeline-1', 'Opening Cut');
    expect(onSelectTimeline).not.toHaveBeenCalled();
  });

  it('shows only Astrid projects', async () => {
    renderSelectors({});

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Select project' }));

    expect(screen.queryByText('Astrid App projects')).toBeNull();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Project One/ })).toBeNull();
    expect(screen.getByRole('option', { name: /Ados Talks/ })).toBeInTheDocument();
  });

  it('offers a primary action for non-primary timelines', async () => {
    const onSetPrimaryTimeline = vi.fn();
    renderSelectors({ onSetPrimaryTimeline });

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Select timeline' }));
    await user.click(screen.getByRole('button', { name: 'Make Alt Cut primary' }));

    expect(onSetPrimaryTimeline).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
    expect(onSetPrimaryTimeline).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when the selected local project has no timelines', async () => {
    const discovery = makeDiscovery({
      timelinesQuery: {
        isLoading: false,
        isError: false,
        error: null,
        data: { timelines: [] },
      } as UseAstridBridgeDiscoveryResult['timelinesQuery'],
    });
    renderSelectors({ discovery });

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Select timeline' }));

    expect(await screen.findByText('No timelines for this project yet.')).toBeInTheDocument();
  });

  it('disables the triggers while a save is in flight', () => {
    renderSelectors({ disabled: true });

    expect(screen.getByRole('combobox', { name: 'Select project' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Select timeline' })).toBeDisabled();
  });

  it('reports dropdown open state through onOpenChange', async () => {
    const onOpenChange = vi.fn();
    renderSelectors({ onOpenChange });

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Select project' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole('combobox', { name: 'Select project' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
