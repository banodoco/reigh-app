import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectCRUD } from '../useProjectCRUD';

const mocks = vi.hoisted(() => ({
  workspaceV1: false,
  clientOptions: [] as unknown[],
  createProject: vi.fn(),
  ensureProjectHasTimeline: vi.fn(),
}));

vi.mock('@/integrations/astrid/workspaceV1', () => ({
  get isAstridWorkspaceV1() { return mocks.workspaceV1; },
}));

vi.mock('@/integrations/astrid/client', () => ({
  AstridLocalClient: class MockAstridLocalClient {
    projects = { create: mocks.createProject };

    constructor(options: unknown) {
      mocks.clientOptions.push(options);
    }
  },
}));

vi.mock('@/integrations/runtime/createDefaultTimeline', () => ({
  ensureProjectHasTimeline: mocks.ensureProjectHasTimeline,
}));

describe('useProjectCRUD local workspace project creation', () => {
  beforeEach(() => {
    mocks.workspaceV1 = true;
    mocks.clientOptions = [];
    mocks.createProject.mockReset().mockResolvedValue({
      data: {
        project_id: 'project-canonical-id',
        slug: 'astrid-local-launch-smoke-2026-10-14',
        name: 'Astrid local launch smoke 2026-10-14',
        metadata: { aspect_ratio: '16:9' },
        created_at: '2026-10-14T00:00:00.000Z',
      },
    });
    mocks.ensureProjectHasTimeline.mockReset().mockResolvedValue('created-main-timeline');
    window.history.replaceState({}, '', '/tools/video-editor');
  });

  it('creates through workspace.v1 before a project is selected or present in the URL', async () => {
    const onProjectsLoaded = vi.fn();
    const onProjectCreated = vi.fn();
    const { result } = renderHook(() => useProjectCRUD({
      userId: 'local-user',
      selectedProjectId: null,
      onProjectsLoaded,
      onProjectCreated,
      onProjectDeleted: vi.fn(),
      updateUserSettings: vi.fn(async () => undefined),
    }));

    let createdProject;
    await act(async () => {
      createdProject = await result.current.addNewProject({
        name: 'Astrid local launch smoke 2026-10-14',
        aspectRatio: '16:9',
      });
    });

    expect(mocks.clientOptions).toEqual([{ projectSlug: '__discovery__' }]);
    expect(mocks.createProject).toHaveBeenCalledWith({
      name: 'Astrid local launch smoke 2026-10-14',
      slug: 'astrid-local-launch-smoke-2026-10-14',
      metadata: { aspect_ratio: '16:9' },
    });
    expect(mocks.ensureProjectHasTimeline).toHaveBeenCalledWith('project-canonical-id');
    expect(createdProject).toMatchObject({
      id: 'astrid-local-launch-smoke-2026-10-14',
      name: 'Astrid local launch smoke 2026-10-14',
      user_id: 'local-user',
      aspectRatio: '16:9',
    });
    expect(onProjectCreated).toHaveBeenCalledWith(createdProject);
    expect(onProjectsLoaded).not.toHaveBeenCalled();
  });

  it('keeps the created project and callback usable when first timeline creation needs a retry', async () => {
    mocks.ensureProjectHasTimeline.mockRejectedValueOnce(new Error('Runtime temporarily unavailable'));
    const onProjectCreated = vi.fn();
    const { result } = renderHook(() => useProjectCRUD({
      userId: 'local-user',
      selectedProjectId: null,
      onProjectsLoaded: vi.fn(),
      onProjectCreated,
      onProjectDeleted: vi.fn(),
      updateUserSettings: vi.fn(async () => undefined),
    }));

    let createdProject;
    await act(async () => {
      createdProject = await result.current.addNewProject({
        name: 'Astrid local launch smoke 2026-10-14',
        aspectRatio: '16:9',
      });
    });

    expect(createdProject).toMatchObject({ id: 'astrid-local-launch-smoke-2026-10-14' });
    expect(onProjectCreated).toHaveBeenCalledWith(createdProject);
  });
});
