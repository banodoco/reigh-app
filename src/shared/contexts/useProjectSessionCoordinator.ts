import { useAuth } from './AuthContext';
import { useUserSettings } from './UserSettingsContext';
import { useProjectSelection } from '../hooks/projects/useProjectSelection';
import { useProjectCRUD } from '../hooks/projects/useProjectCRUD';
import { useProjectDefaults } from '../hooks/projects/useProjectDefaults';

export function useProjectSessionCoordinator() {
  const { userId } = useAuth();
  const {
    userSettings: userPreferences,
    isLoadingSettings: isLoadingPreferences,
    updateUserSettings,
  } = useUserSettings();

  const selection = useProjectSelection({
    userId: userId ?? null,
    userPreferences,
    isLoadingPreferences,
    updateUserSettings,
  });

  const crud = useProjectCRUD({
    userId: userId ?? null,
    selectedProjectId: selection.selectedProjectId,
    onProjectsLoaded: selection.handleProjectsLoaded,
    onProjectCreated: selection.handleProjectCreated,
    onProjectDeleted: selection.handleProjectDeleted,
    updateUserSettings,
  });

  useProjectDefaults({
    userId: userId ?? null,
    selectedProjectId: selection.selectedProjectId,
    isLoadingProjects: crud.isLoadingProjects,
    projects: crud.projects,
    fetchProjects: crud.fetchProjects,
    applyCrossDeviceSync: selection.applyCrossDeviceSync,
  });

  return {
    userId: userId ?? null,
    selection,
    crud,
  };
}
