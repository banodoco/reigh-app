import { createContext, useContext, ReactNode, useEffect, useMemo } from 'react';
import { Project } from '@/types/project';
import { useRenderLogger } from '@/shared/lib/debugRendering';
import { useAuth } from './AuthContext';
import { useUserSettings } from './UserSettingsContext';
import { useProjectSelection } from '@/shared/hooks/useProjectSelection';
import { useProjectCRUD } from '@/shared/hooks/useProjectCRUD';
import { useProjectDefaults } from '@/shared/hooks/useProjectDefaults';

// Type for updating projects (re-exported for consumers that may need it)
interface ProjectUpdate {
  name?: string;
  aspectRatio?: string;
}

interface ProjectContextType {
  projects: Project[];
  selectedProjectId: string | null;
  project: Project | null;
  setSelectedProjectId: (projectId: string | null) => void;
  isLoadingProjects: boolean;
  fetchProjects: () => Promise<void>;
  addNewProject: (projectData: { name: string; aspectRatio: string }) => Promise<Project | null>;
  isCreatingProject: boolean;
  updateProject: (projectId: string, updates: ProjectUpdate) => Promise<boolean>;
  isUpdatingProject: boolean;
  deleteProject: (projectId: string) => Promise<boolean>;
  isDeletingProject: boolean;
  /** Current authenticated user ID, null if not logged in */
  userId: string | null;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const { userId } = useAuth();
  useRenderLogger('ProjectProvider', { userId });
  const { userSettings: userPreferences, isLoadingSettings: isLoadingPreferences, updateUserSettings } = useUserSettings();

  // ── Selection: owns selectedProjectId, localStorage persistence, cross-device sync ──
  const selection = useProjectSelection({
    userId: userId ?? null,
    userPreferences,
    isLoadingPreferences,
    updateUserSettings,
  });

  // ── CRUD: owns projects list, loading flags, fetch/create/update/delete ──
  const crud = useProjectCRUD({
    userId: userId ?? null,
    selectedProjectId: selection.selectedProjectId,
    onProjectsLoaded: selection.handleProjectsLoaded,
    onProjectCreated: selection.handleProjectCreated,
    onProjectDeleted: selection.handleProjectDeleted,
    updateUserSettings,
  });

  // ── Side effects: fetch trigger, cross-device sync, prefetch, mobile fallback ──
  useProjectDefaults({
    userId: userId ?? null,
    selectedProjectId: selection.selectedProjectId,
    isLoadingProjects: crud.isLoadingProjects,
    projects: crud.projects,
    fetchProjects: crud.fetchProjects,
    applyCrossDeviceSync: selection.applyCrossDeviceSync,
  });

  // ── Expose context snapshot for hooks that need project ID outside React context ──
  // This is a [structural] global (not debug-only) — consumed by useProjectGenerations,
  // useTasks, and ImageGenerationToolPage as a fallback when projectId isn't passed as a prop.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__PROJECT_CONTEXT__ = {
        selectedProjectId: selection.selectedProjectId ?? undefined,
        projects: crud.projects,
      };
    }
  }, [selection.selectedProjectId, crud.projects]);

  // ── Build context value ──
  const contextValue = useMemo(
    (): ProjectContextType => ({
      projects: crud.projects || [],
      selectedProjectId: selection.selectedProjectId,
      project: (crud.projects || []).find((item) => item.id === selection.selectedProjectId) ?? null,
      setSelectedProjectId: selection.setSelectedProjectId,
      isLoadingProjects: crud.isLoadingProjects,
      fetchProjects: crud.fetchProjects,
      addNewProject: crud.addNewProject,
      isCreatingProject: crud.isCreatingProject,
      updateProject: crud.updateProject,
      isUpdatingProject: crud.isUpdatingProject,
      deleteProject: crud.deleteProject,
      isDeletingProject: crud.isDeletingProject,
      userId: userId ?? null,
    }),
    [
      crud.projects,
      selection.selectedProjectId,
      selection.setSelectedProjectId,
      crud.isLoadingProjects,
      crud.fetchProjects,
      crud.addNewProject,
      crud.isCreatingProject,
      crud.updateProject,
      crud.isUpdatingProject,
      crud.deleteProject,
      crud.isDeletingProject,
      userId,
    ]
  );

  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    const errorMessage = 'useProject must be used within a ProjectProvider. ' +
      'Make sure the component is rendered inside the ProjectProvider tree. ' +
      'Check that the component is not being rendered outside of App.tsx or in an error boundary that is outside the provider.';
    console.error('[ProjectContext]', errorMessage, {
      stack: new Error().stack,
      windowLocation: typeof window !== 'undefined' ? window.location.href : 'N/A'
    });
    throw new Error(errorMessage);
  }
  return context;
};
