import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProjectSessionCoordinator } from './useProjectSessionCoordinator';
import * as authModule from './AuthContext';
import * as userSettingsModule from './UserSettingsContext';
import * as projectSelectionModule from '@/shared/hooks/projects/useProjectSelection';
import * as projectCrudModule from '@/shared/hooks/projects/useProjectCRUD';
import * as projectDefaultsModule from '@/shared/hooks/projects/useProjectDefaults';

describe('useProjectSessionCoordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('coordinates auth/settings/selection/crud/defaults hooks and returns composed result', () => {
    const updateUserSettings = vi.fn();
    const selection = {
      selectedProjectId: 'project-1',
      handleProjectsLoaded: vi.fn(),
      handleProjectCreated: vi.fn(),
      handleProjectDeleted: vi.fn(),
      applyCrossDeviceSync: vi.fn(),
    };
    const crud = {
      isLoadingProjects: false,
      projects: [{ id: 'project-1', name: 'Project 1' }],
      fetchProjects: vi.fn(),
    };

    const useAuthSpy = vi.spyOn(authModule, 'useAuth').mockReturnValue({ userId: 'user-1' } as never);
    const useUserSettingsSpy = vi.spyOn(userSettingsModule, 'useUserSettings').mockReturnValue({
      userSettings: { preferredProjectId: 'project-1' },
      isLoadingSettings: false,
      updateUserSettings,
    } as never);
    const useProjectSelectionSpy = vi.spyOn(projectSelectionModule, 'useProjectSelection').mockReturnValue(selection as never);
    const useProjectCrudSpy = vi.spyOn(projectCrudModule, 'useProjectCRUD').mockReturnValue(crud as never);
    const useProjectDefaultsSpy = vi.spyOn(projectDefaultsModule, 'useProjectDefaults').mockImplementation(() => {});

    const { result } = renderHook(() => useProjectSessionCoordinator());

    expect(useAuthSpy).toHaveBeenCalledTimes(1);
    expect(useUserSettingsSpy).toHaveBeenCalledTimes(1);
    expect(useProjectSelectionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        isLoadingPreferences: false,
        updateUserSettings,
      }),
    );
    expect(useProjectCrudSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        selectedProjectId: 'project-1',
        updateUserSettings,
      }),
    );
    expect(useProjectDefaultsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        selectedProjectId: 'project-1',
        isLoadingProjects: false,
      }),
    );
    expect(result.current).toEqual({
      userId: 'user-1',
      selection,
      crud,
    });
  });
});
