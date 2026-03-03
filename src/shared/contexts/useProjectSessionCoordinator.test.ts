import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProjectSessionCoordinator } from './useProjectSessionCoordinator';

const useAuthSpy = vi.fn();
const useUserSettingsSpy = vi.fn();
const useProjectSelectionSpy = vi.fn();
const useProjectCrudSpy = vi.fn();
const useProjectDefaultsSpy = vi.fn();

vi.mock('./AuthContext', () => ({
  useAuth: () => useAuthSpy(),
}));

vi.mock('./UserSettingsContext', () => ({
  useUserSettings: () => useUserSettingsSpy(),
}));

vi.mock('@/shared/hooks/projects/useProjectSelection', () => ({
  useProjectSelection: (args: unknown) => useProjectSelectionSpy(args),
}));

vi.mock('@/shared/hooks/projects/useProjectCRUD', () => ({
  useProjectCRUD: (args: unknown) => useProjectCrudSpy(args),
}));

vi.mock('@/shared/hooks/projects/useProjectDefaults', () => ({
  useProjectDefaults: (args: unknown) => useProjectDefaultsSpy(args),
}));

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

    useAuthSpy.mockReturnValue({ userId: 'user-1' });
    useUserSettingsSpy.mockReturnValue({
      userSettings: { preferredProjectId: 'project-1' },
      isLoadingSettings: false,
      updateUserSettings,
    });
    useProjectSelectionSpy.mockReturnValue(selection);
    useProjectCrudSpy.mockReturnValue(crud);

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
