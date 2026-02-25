import { createContext, useContext, ReactNode, useMemo } from 'react';
import { Project } from '@/types/project';
import { useRenderLogger } from '@/shared/lib/debug/debugRendering';
import { useProjectSessionCoordinator } from './useProjectSessionCoordinator';
import { normalizeAndPresentAndRethrow } from '@/shared/lib/errorHandling/runtimeError';

// Type for updating projects (re-exported for consumers that may need it)
interface ProjectUpdate {
  name?: string;
  aspectRatio?: string;
}

interface ProjectSelectionContextType {
  selectedProjectId: string | null;
  project: Project | null;
  setSelectedProjectId: (projectId: string | null) => void;
}

interface ProjectCrudContextType {
  projects: Project[];
  isLoadingProjects: boolean;
  fetchProjects: () => Promise<void>;
  addNewProject: (projectData: { name: string; aspectRatio: string }) => Promise<Project | null>;
  isCreatingProject: boolean;
  updateProject: (projectId: string, updates: ProjectUpdate) => Promise<boolean>;
  isUpdatingProject: boolean;
  deleteProject: (projectId: string) => Promise<boolean>;
  isDeletingProject: boolean;
}

interface ProjectIdentityContextType {
  /** Current authenticated user ID, null if not logged in */
  userId: string | null;
}

interface ProjectContextType
  extends ProjectSelectionContextType,
    ProjectCrudContextType,
    ProjectIdentityContextType {}

const ProjectSelectionContext = createContext<ProjectSelectionContextType | undefined>(undefined);
const ProjectCrudContext = createContext<ProjectCrudContextType | undefined>(undefined);
const ProjectIdentityContext = createContext<ProjectIdentityContextType | undefined>(undefined);

function throwMissingProvider(hookName: string): never {
  const errorMessage = `${hookName} must be used within a ProjectProvider. ` +
    'Make sure the component is rendered inside the ProjectProvider tree. ' +
    'Check that the component is not being rendered outside of App.tsx or in an error boundary that is outside the provider.';
  return normalizeAndPresentAndRethrow(new Error(errorMessage), {
    context: hookName,
    showToast: false,
    logData: {
      windowLocation: typeof window !== 'undefined' ? window.location.href : 'N/A',
    },
  });
}

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const { userId, selection, crud } = useProjectSessionCoordinator();
  useRenderLogger('ProjectProvider', { userId });

  const projects = crud.projects || [];
  const selectedProjectId = selection.selectedProjectId;
  const project = projects.find((item) => item.id === selectedProjectId) ?? null;

  const selectionValue = useMemo(
    (): ProjectSelectionContextType => ({
      selectedProjectId,
      project,
      setSelectedProjectId: selection.setSelectedProjectId,
    }),
    [selectedProjectId, project, selection.setSelectedProjectId],
  );

  const crudValue = useMemo(
    (): ProjectCrudContextType => ({
      projects: crud.projects || [],
      isLoadingProjects: crud.isLoadingProjects,
      fetchProjects: crud.fetchProjects,
      addNewProject: crud.addNewProject,
      isCreatingProject: crud.isCreatingProject,
      updateProject: crud.updateProject,
      isUpdatingProject: crud.isUpdatingProject,
      deleteProject: crud.deleteProject,
      isDeletingProject: crud.isDeletingProject,
    }),
    [
      crud.projects,
      crud.isLoadingProjects,
      crud.fetchProjects,
      crud.addNewProject,
      crud.isCreatingProject,
      crud.updateProject,
      crud.isUpdatingProject,
      crud.deleteProject,
      crud.isDeletingProject,
    ],
  );

  const identityValue = useMemo(
    (): ProjectIdentityContextType => ({
      userId: userId ?? null,
    }),
    [userId],
  );

  return (
    <ProjectIdentityContext.Provider value={identityValue}>
      <ProjectCrudContext.Provider value={crudValue}>
        <ProjectSelectionContext.Provider value={selectionValue}>
          {children}
        </ProjectSelectionContext.Provider>
      </ProjectCrudContext.Provider>
    </ProjectIdentityContext.Provider>
  );
};

export const useProjectSelectionContext = () => {
  const context = useContext(ProjectSelectionContext);
  if (context === undefined) {
    throwMissingProvider('useProjectSelectionContext');
  }
  return context;
};

export const useProjectCrudContext = () => {
  const context = useContext(ProjectCrudContext);
  if (context === undefined) {
    throwMissingProvider('useProjectCrudContext');
  }
  return context;
};

export const useProjectIdentityContext = () => {
  const context = useContext(ProjectIdentityContext);
  if (context === undefined) {
    throwMissingProvider('useProjectIdentityContext');
  }
  return context;
};

/** Compatibility hook for existing callers that still need the combined project contract. */
export const useProject = () => {
  const selection = useProjectSelectionContext();
  const crud = useProjectCrudContext();
  const identity = useProjectIdentityContext();

  return useMemo<ProjectContextType>(() => ({
    ...crud,
    ...selection,
    ...identity,
  }), [crud, selection, identity]);
};
