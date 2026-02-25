import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDarkMode } from '@/shared/hooks/core/useDarkMode';
import { useProject } from '@/shared/contexts/ProjectContext';

interface UseGlobalHeaderProjectOptions {
  onOpenCreateProject: (initialName?: string) => void;
}

export function useGlobalHeaderProject({ onOpenCreateProject }: UseGlobalHeaderProjectOptions) {
  const navigate = useNavigate();
  const { darkMode } = useDarkMode();
  const { projects, selectedProjectId, setSelectedProjectId, isLoadingProjects } = useProject();

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const handleProjectChange = useCallback((projectId: string) => {
    if (projectId === 'create-new') {
      onOpenCreateProject(undefined);
      return;
    }
    if (projectId !== selectedProjectId) {
      setSelectedProjectId(projectId);
      navigate('/tools');
    }
  }, [onOpenCreateProject, selectedProjectId, setSelectedProjectId, navigate]);

  return {
    navigate,
    darkMode,
    projects,
    selectedProject,
    isLoadingProjects,
    handleProjectChange,
  };
}
