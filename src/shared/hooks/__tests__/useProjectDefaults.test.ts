import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock all dependencies
vi.mock('@/shared/hooks/usePrefetchToolSettings', () => ({
  usePrefetchToolSettings: vi.fn(),
}));

vi.mock('@/shared/hooks/useMobileTimeoutFallback', () => ({
  useMobileTimeoutFallback: vi.fn(),
}));

import { useProjectDefaults } from '../useProjectDefaults';
import { usePrefetchToolSettings } from '@/shared/hooks/usePrefetchToolSettings';
import { useMobileTimeoutFallback } from '@/shared/hooks/useMobileTimeoutFallback';

describe('useProjectDefaults', () => {
  const mockFetchProjects = vi.fn().mockResolvedValue(undefined);
  const mockApplyCrossDeviceSync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefetches tool settings for selected project', () => {
    renderHook(() =>
      useProjectDefaults({
        userId: 'user-1',
        selectedProjectId: 'project-1',
        isLoadingProjects: false,
        isLoadingPreferences: false,
        projects: [],
        fetchProjects: mockFetchProjects,
        applyCrossDeviceSync: mockApplyCrossDeviceSync,
      })
    );

    expect(usePrefetchToolSettings).toHaveBeenCalledWith('project-1');
  });

  it('fetches projects when userId is available', () => {
    renderHook(() =>
      useProjectDefaults({
        userId: 'user-1',
        selectedProjectId: null,
        isLoadingProjects: true,
        isLoadingPreferences: false,
        projects: [],
        fetchProjects: mockFetchProjects,
        applyCrossDeviceSync: mockApplyCrossDeviceSync,
      })
    );

    expect(mockFetchProjects).toHaveBeenCalled();
  });

  it('does not fetch projects when userId is null', () => {
    renderHook(() =>
      useProjectDefaults({
        userId: null,
        selectedProjectId: null,
        isLoadingProjects: true,
        isLoadingPreferences: false,
        projects: [],
        fetchProjects: mockFetchProjects,
        applyCrossDeviceSync: mockApplyCrossDeviceSync,
      })
    );

    expect(mockFetchProjects).not.toHaveBeenCalled();
  });

  it('applies cross-device sync when projects are loaded', () => {
    const projects = [{ id: 'p1', name: 'Project 1', user_id: 'u1' }];

    renderHook(() =>
      useProjectDefaults({
        userId: 'user-1',
        selectedProjectId: 'p1',
        isLoadingProjects: false,
        isLoadingPreferences: false,
        projects,
        fetchProjects: mockFetchProjects,
        applyCrossDeviceSync: mockApplyCrossDeviceSync,
      })
    );

    expect(mockApplyCrossDeviceSync).toHaveBeenCalledWith(projects);
  });

  it('does not apply cross-device sync when projects list is empty', () => {
    renderHook(() =>
      useProjectDefaults({
        userId: 'user-1',
        selectedProjectId: null,
        isLoadingProjects: true,
        isLoadingPreferences: false,
        projects: [],
        fetchProjects: mockFetchProjects,
        applyCrossDeviceSync: mockApplyCrossDeviceSync,
      })
    );

    expect(mockApplyCrossDeviceSync).not.toHaveBeenCalled();
  });

  it('sets up mobile timeout fallback', () => {
    renderHook(() =>
      useProjectDefaults({
        userId: 'user-1',
        selectedProjectId: null,
        isLoadingProjects: true,
        isLoadingPreferences: false,
        projects: [],
        fetchProjects: mockFetchProjects,
        applyCrossDeviceSync: mockApplyCrossDeviceSync,
      })
    );

    expect(useMobileTimeoutFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        isLoading: true,
        onTimeout: mockFetchProjects,
        enabled: true,
      })
    );
  });
});
