/**
 * ProjectContext Tests
 *
 * Tests for project state management context.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock dependencies
vi.mock('../AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({ userId: 'user-123' }),
}));

vi.mock('../UserSettingsContext', () => ({
  useUserSettings: vi.fn().mockReturnValue({
    userSettings: {},
    isLoadingSettings: false,
    updateUserSettings: vi.fn(),
  }),
}));

vi.mock('@/shared/hooks/useProjectSelection', () => ({
  useProjectSelection: vi.fn().mockReturnValue({
    selectedProjectId: 'proj-1',
    setSelectedProjectId: vi.fn(),
    handleProjectsLoaded: vi.fn(),
    handleProjectCreated: vi.fn(),
    handleProjectDeleted: vi.fn(),
    applyCrossDeviceSync: vi.fn(),
  }),
}));

vi.mock('@/shared/hooks/useProjectCRUD', () => ({
  useProjectCRUD: vi.fn().mockReturnValue({
    projects: [{ id: 'proj-1', name: 'Test Project' }],
    isLoadingProjects: false,
    fetchProjects: vi.fn(),
    addNewProject: vi.fn(),
    isCreatingProject: false,
    updateProject: vi.fn(),
    isUpdatingProject: false,
    deleteProject: vi.fn(),
    isDeletingProject: false,
  }),
}));

vi.mock('@/shared/hooks/useProjectDefaults', () => ({
  useProjectDefaults: vi.fn(),
}));

import { ProjectProvider, useProject } from '../ProjectContext';

// Test consumer component
function ProjectConsumer() {
  const ctx = useProject();
  return (
    <div>
      <span data-testid="selectedProjectId">{ctx.selectedProjectId ?? 'null'}</span>
      <span data-testid="userId">{ctx.userId ?? 'null'}</span>
      <span data-testid="projectCount">{ctx.projects.length}</span>
      <span data-testid="isLoading">{String(ctx.isLoadingProjects)}</span>
    </div>
  );
}

describe('ProjectContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useProject hook', () => {
    it('throws when used outside ProjectProvider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      function BadConsumer() {
        useProject();
        return null;
      }

      expect(() => {
        render(<BadConsumer />);
      }).toThrow('useProject must be used within a ProjectProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('ProjectProvider', () => {
    it('renders children', () => {
      render(
        <ProjectProvider>
          <div data-testid="child">Hello</div>
        </ProjectProvider>
      );

      expect(screen.getByTestId('child')).toHaveTextContent('Hello');
    });

    it('provides context values from composed hooks', () => {
      render(
        <ProjectProvider>
          <ProjectConsumer />
        </ProjectProvider>
      );

      expect(screen.getByTestId('selectedProjectId')).toHaveTextContent('proj-1');
      expect(screen.getByTestId('userId')).toHaveTextContent('user-123');
      expect(screen.getByTestId('projectCount')).toHaveTextContent('1');
      expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
    });

    it('exposes project context on window for hooks that need it', () => {
      render(
        <ProjectProvider>
          <ProjectConsumer />
        </ProjectProvider>
      );

      expect((window as Record<string, unknown>).__PROJECT_CONTEXT__).toEqual({
        selectedProjectId: 'proj-1',
        projects: [{ id: 'proj-1', name: 'Test Project' }],
      });
    });
  });
});
