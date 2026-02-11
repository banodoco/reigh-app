import React, { createContext, useState, useContext, ReactNode, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/components/ui/toast';
import { Project } from '@/types/project'; // Added import
import { usePrefetchToolSettings } from '@/shared/hooks/usePrefetchToolSettings';
import { handleError } from '@/shared/lib/errorHandler';
import { useAuth } from './AuthContext';
import { useUserSettings } from './UserSettingsContext';
import { preloadingService } from '@/shared/lib/preloading';
import { fetchInheritableProjectSettings, buildShotSettingsForNewProject } from '@/shared/lib/projectSettingsInheritance';

// Type for updating projects
interface ProjectUpdate {
  name?: string;
  aspectRatio?: string;
}

interface ProjectContextType {
  projects: Project[];
  selectedProjectId: string | null;
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

// Dummy User ID is managed server-side and no longer needed here.

/**
 * Copy template content to a new user's Getting Started shot.
 * Calls a SECURITY DEFINER database function that copies starred images,
 * timeline content, and featured video from the template project.
 */
const copyTemplateToNewUser = async (newProjectId: string, newShotId: string): Promise<void> => {
  try {

    const { error } = await supabase.rpc('copy_onboarding_template', {
      target_project_id: newProjectId,
      target_shot_id: newShotId,
    });

    if (error) {
      // Not a fatal error - new users just won't have sample content
      return;
    }

  } catch (err) {
    handleError(err, { context: 'ProjectContext', showToast: false });
  }
};

// Helper function to create a default shot for a new project
const createDefaultShot = async (
  projectId: string,
  initialSettings?: Record<string, unknown>,
  isFirstProject: boolean = false
): Promise<string | null> => {
  try {
    const shotName = isFirstProject ? 'Getting Started' : 'Default Shot';

    const { data: shot, error } = await supabase
      .from('shots')
      .insert({
        name: shotName,
        project_id: projectId,
        settings: initialSettings || {},
      })
      .select('id')
      .single();

    if (error) {
      handleError(error, { context: 'ProjectContext', showToast: false });
      return null;
    }

    // For first-time users, copy template content
    if (isFirstProject && shot) {
      await copyTemplateToNewUser(projectId, shot.id);
    }

    return shot?.id || null;
  } catch (err) {
    handleError(err, { context: 'ProjectContext', showToast: false });
    return null;
  }
};

const determineProjectIdToSelect = (
  projects: Project[],
  preferredId: string | null | undefined,
  lastOpenedId: string | null | undefined
): string | null => {
  if (!projects.length) return null;

  const projectIds = new Set(projects.map(p => p.id));

  if (preferredId && projectIds.has(preferredId)) {
    return preferredId;
  }
  if (lastOpenedId && projectIds.has(lastOpenedId)) {
    return lastOpenedId;
  }
  return projects[0].id;
};

// Helper to convert DB row (snake_case) to our Project interface (camelCase)
const mapDbProjectToProject = (row: Record<string, unknown>): Project => ({
  id: row.id as string,
  name: row.name as string,
  user_id: row.user_id as string,
  aspectRatio: (row.aspect_ratio as string) ?? undefined,
  createdAt: (row.created_at as string) ?? undefined,
});

// Helper to sort projects by creation date (newest first)
const sortProjectsByCreatedAt = (projects: Project[]): Project[] => {
  return [...projects].sort((a, b) => {
    // Handle missing createdAt by treating them as oldest
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    // Sort descending (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
};

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  // Get auth state from AuthContext
  const { userId } = useAuth();

  // Get user settings from UserSettingsContext
  const { userSettings: userPreferences, isLoadingSettings: isLoadingPreferences, updateUserSettings } = useUserSettings();

  // Keep a ref for synchronous access to latest preferences
  const userPreferencesRef = useRef(userPreferences);
  useEffect(() => {
    userPreferencesRef.current = userPreferences;
  }, [userPreferences]);

  // CRITICAL: Log component mount/unmount to detect tab suspension issues
  React.useEffect(() => {

    return () => {
    };
  }, []);

  const [projects, setProjects] = useState<Project[]>([]);
  // CROSS-DEVICE SYNC: Track if we had a localStorage value at startup
  // If not, we'll update selection from server preferences when they load
  const hadLocalStorageValueRef = useRef<boolean>(false);
  const hasAppliedServerPreferencesRef = useRef<boolean>(false);

  // FAST RESUME: Try to restore selectedProjectId from localStorage immediately
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem('lastSelectedProjectId');
      if (stored) {
        hadLocalStorageValueRef.current = true;
        return stored;
      } else {
        hadLocalStorageValueRef.current = false;
      }
    } catch (e) {
      console.error('[ProjectContext:FastResume] localStorage access failed:', e);
      hadLocalStorageValueRef.current = false;
    }
    return null;
  });
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  // [MobileStallFix] Add mobile detection and recovery state
  const isMobileRef = useRef(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  const projectsTimeoutRef = useRef<NodeJS.Timeout>();

  // Prefetch all tool settings for the currently selected project so that
  // tool pages hydrate instantly without an extra round-trip.
  usePrefetchToolSettings(selectedProjectId);

  // [MobileStallFix] Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (projectsTimeoutRef.current) {
        clearTimeout(projectsTimeoutRef.current);
      }
    };
  }, []);

  // CROSS-DEVICE SYNC: Reset sync flag when user logs out
  useEffect(() => {
    if (!userId) {
      hasAppliedServerPreferencesRef.current = false;
    }
  }, [userId]);

  // CROSS-DEVICE SYNC: When preferences load on a new device (no localStorage),
  // update the selected project to match the server's lastOpenedProjectId
  useEffect(() => {
    // Skip if we had a localStorage value - it takes priority for fast resume
    if (hadLocalStorageValueRef.current) {
      return;
    }
    
    // Skip if we already applied server preferences this session
    if (hasAppliedServerPreferencesRef.current) {
      return;
    }
    
    // Wait for preferences to finish loading
    if (isLoadingPreferences || !userPreferences) {
      return;
    }
    
    // Wait for projects to be loaded
    if (!projects.length) {
      return;
    }
    
    const serverLastOpenedId = userPreferences.lastOpenedProjectId;
    
    // If server has a different project selected, switch to it
    if (serverLastOpenedId && serverLastOpenedId !== selectedProjectId) {
      const projectExists = projects.some(p => p.id === serverLastOpenedId);
      if (projectExists) {
        setSelectedProjectIdState(serverLastOpenedId);
        // Also save to localStorage so future loads on this device are fast
        try {
          localStorage.setItem('lastSelectedProjectId', serverLastOpenedId);
        } catch (e) {
          handleError(e, { context: 'ProjectContext.crossDeviceSync', showToast: false });
        }
      }
    }
    
    // Mark that we've applied server preferences (don't do it again this session)
    hasAppliedServerPreferencesRef.current = true;
  }, [isLoadingPreferences, userPreferences, projects, selectedProjectId]);

  const handleSetSelectedProjectId = useCallback((projectId: string | null) => {

    // Notify preloading service of project change (clears caches)
    preloadingService.onProjectChange(projectId);

    setSelectedProjectIdState(projectId);

    // FAST RESUME: Save to localStorage immediately for fast tab resume
    if (projectId) {
      try {
        localStorage.setItem('lastSelectedProjectId', projectId);
      } catch (e) {
        handleError(e, { context: 'ProjectContext.fastResume', showToast: false });
      }
      // Also save to user preferences (slower but persistent across devices)
      updateUserSettings('user', { lastOpenedProjectId: projectId });
    } else {
      try {
        localStorage.removeItem('lastSelectedProjectId');
      } catch (e) {
        handleError(e, { context: 'ProjectContext.fastResume', showToast: false });
      }
      updateUserSettings('user', { lastOpenedProjectId: undefined });
    }
  }, [updateUserSettings, selectedProjectId]);

  const fetchProjects = useCallback(async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Ensure user exists in our users table first
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!existingUser) {
        // Create user record using the secure function
        const { error: userError } = await supabase
          .rpc('create_user_record_if_not_exists');
        
        if (userError) {
          handleError(userError, { context: 'ProjectContext.createUser', showToast: false });
          // Continue anyway, the user might exist due to race condition
        }
      }

      // Fetch projects for the user
      const { data: projectsData, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Create default project if none exist
      if (!projectsData || projectsData.length === 0) {
        const { data: newProject, error: createError } = await supabase
          .from('projects')
          .insert({
            name: 'Sample Project',
            user_id: user.id,
            aspect_ratio: '16:9',
          })
          .select()
          .single();

        if (createError) throw createError;

        // Create default shot for the new project - mark as first project for sample content
        await createDefaultShot(newProject.id, undefined, true /* isFirstProject */);

        const mappedProject = mapDbProjectToProject(newProject);
        setProjects([mappedProject]);
        // FIXED: Use handleSetSelectedProjectId to ensure localStorage is saved
        handleSetSelectedProjectId(mappedProject.id);
      } else {
        const mappedProjects = projectsData.map(mapDbProjectToProject);
        setProjects(mappedProjects);
        
        // Prefer the currently selected project if it's still present; otherwise fall back to user prefs, else newest
        const lastOpenedProjectId = userPreferencesRef.current?.lastOpenedProjectId;
        const projectIdToSelect = determineProjectIdToSelect(mappedProjects, selectedProjectId, lastOpenedProjectId);
        
        // Only update if it actually changes to avoid clobbering a valid selection and redundant writes
        if (projectIdToSelect !== selectedProjectId) {
          handleSetSelectedProjectId(projectIdToSelect);
        }
      }
    } catch (error: unknown) {
      handleError(error, { context: 'ProjectContext', toastTitle: 'Failed to load projects' });
      setProjects([]);
      // CRITICAL FIX: DO NOT clear selectedProjectId on fetch error!
      // This was causing localStorage to be wiped and all queries to be disabled
      // The selectedProjectId should persist even if project fetching fails
      // setSelectedProjectIdState(null); // ← REMOVED: This was the root cause!
    } finally {
      // Clear timeout when fetch completes (success or error)
      if (projectsTimeoutRef.current) {
        clearTimeout(projectsTimeoutRef.current);
        projectsTimeoutRef.current = undefined;
      }
      setIsLoadingProjects(false);
    }
  }, [updateUserSettings, selectedProjectId, handleSetSelectedProjectId]);

  const addNewProject = useCallback(async (projectData: { name: string; aspectRatio: string }) => {
    if (!projectData.name.trim()) {
      toast.error("Project name cannot be empty.");
      return null;
    }
    if (!projectData.aspectRatio) {
      toast.error("Aspect ratio cannot be empty.");
      return null;
    }
    setIsCreatingProject(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Ensure user exists in our users table first
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!existingUser) {
        // Create user record using the secure function
        const { error: userError } = await supabase
          .rpc('create_user_record_if_not_exists');
        
        if (userError) {
          handleError(userError, { context: 'ProjectContext.createUser', showToast: false });
          // Continue anyway, the user might exist due to race condition
        }
      }

      // Get settings from the current project to copy to the new project
      // See src/shared/constants/settingsInheritance.ts for full documentation of what inherits
      const settingsToInherit = selectedProjectId
        ? await fetchInheritableProjectSettings(selectedProjectId)
        : {};

      const { data: newProject, error } = await supabase
        .from('projects')
        .insert({
          name: projectData.name,
          user_id: user.id,
          aspect_ratio: projectData.aspectRatio,
          settings: settingsToInherit, // Copy settings from current project
        })
        .select()
        .single();

      if (error) throw error;

      // Build shot settings to inherit (priority: localStorage -> DB -> project settings)
      const shotSettingsToInherit = selectedProjectId
        ? await buildShotSettingsForNewProject(selectedProjectId, settingsToInherit)
        : {};

      // Create default shot for the new project with inherited settings
      await createDefaultShot(newProject.id, shotSettingsToInherit);

      const mappedProject = mapDbProjectToProject(newProject);
      setProjects(prevProjects => sortProjectsByCreatedAt([...prevProjects, mappedProject]));
      // Use centralized setter to persist to localStorage and preferences
      handleSetSelectedProjectId(mappedProject.id);
      
      // Save the new project as last opened in user settings (kept for redundancy)
      updateUserSettings('user', { lastOpenedProjectId: mappedProject.id });

      return mappedProject;
    } catch (err: unknown) {
      handleError(err, { context: 'ProjectContext', toastTitle: 'Failed to create project' });
      return null;
    } finally {
      setIsCreatingProject(false);
    }
  }, [updateUserSettings, selectedProjectId, handleSetSelectedProjectId]);

  const updateProject = useCallback(async (projectId: string, updates: ProjectUpdate): Promise<boolean> => {
    if (!updates.name?.trim() && !updates.aspectRatio) {
      toast.error("No changes to save.");
      return false;
    }
    setIsUpdatingProject(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Convert camelCase updates to snake_case for DB
      const dbUpdates: Record<string, string | undefined> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.aspectRatio !== undefined) dbUpdates.aspect_ratio = updates.aspectRatio;

      const { data: updatedProject, error } = await supabase
        .from('projects')
        .update(dbUpdates)
        .eq('id', projectId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;

      const mappedProject = mapDbProjectToProject(updatedProject);

      setProjects(prevProjects => 
        sortProjectsByCreatedAt(
          prevProjects.map(p => p.id === projectId ? mappedProject : p)
        )
      );      
      return true;
    } catch (err: unknown) {
      handleError(err, { context: 'ProjectContext', toastTitle: 'Failed to update project' });
      return false;
    } finally {
      setIsUpdatingProject(false);
    }
  }, []);

  const deleteProject = useCallback(async (projectId: string): Promise<boolean> => {
    setIsDeletingProject(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Use edge function for deletion - has longer timeout for large projects
      const { data, error } = await supabase.functions.invoke('delete-project', {
        body: { projectId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setProjects(prevProjects => {
        const updated = prevProjects.filter(p => p.id !== projectId);
        // Choose next project to select (first alphabetically)
        const nextProjectId = determineProjectIdToSelect(updated, null, null);
        setSelectedProjectIdState(nextProjectId);

        // Update user preferences with the new selected project
        if (nextProjectId) {
          updateUserSettings('user', { lastOpenedProjectId: nextProjectId });
        } else {
          updateUserSettings('user', { lastOpenedProjectId: undefined });
        }

        return updated;
      });

      return true;
    } catch (err: unknown) {
      handleError(err, { context: 'ProjectContext', toastTitle: 'Failed to delete project' });
      return false;
    } finally {
      setIsDeletingProject(false);
    }
  }, [updateUserSettings]);

  // [MobileStallFix] Enhanced project loading with fallback recovery
  // [PROFILING] Track fetch invocations to detect triple-fetch issue
  const fetchInvocationCountRef = useRef(0);
  const lastFetchReasonRef = useRef<string>('');
  
  useEffect(() => {
    
    // FAST RESUME: Start loading projects as soon as we have userId (don't wait for preferences)
    if (userId) {
      fetchInvocationCountRef.current += 1;
      const reason = `userId=${!!userId}, isLoadingPreferences=${isLoadingPreferences}`;
      
      lastFetchReasonRef.current = reason;
      
      // REMOVED: 100ms delay that was causing slow tab resume
      fetchProjects();

      // [MobileStallFix] Set a fallback timeout for projects loading
      if (projectsTimeoutRef.current) {
        clearTimeout(projectsTimeoutRef.current);
      }

      projectsTimeoutRef.current = setTimeout(() => {
        if (isLoadingProjects) {
          // Force retry the fetch without waiting for preferences
          fetchProjects();
        }
      }, isMobileRef.current ? 15000 : 10000); // Longer timeout for mobile
     
      return () => {
        if (projectsTimeoutRef.current) {
          clearTimeout(projectsTimeoutRef.current);
          projectsTimeoutRef.current = undefined;
        }
      };
    }
  }, [userId, isLoadingPreferences, fetchProjects, isLoadingProjects]); // Refetch when user changes or preferences finish loading

  const contextValue = useMemo(
    () => {
      // Ensure all required values are defined
      const value = {
        projects: projects || [],
        selectedProjectId,
        setSelectedProjectId: handleSetSelectedProjectId,
        isLoadingProjects,
        fetchProjects,
        addNewProject,
        isCreatingProject,
        updateProject,
        isUpdatingProject,
        deleteProject,
        isDeletingProject,
        userId: userId ?? null,
      };
      
      // Defensive check - ensure context value is always valid
      if (!value.setSelectedProjectId || !value.fetchProjects) {
        console.error('[ProjectContext] Context value is missing required functions', {
          hasSetSelectedProjectId: !!value.setSelectedProjectId,
          hasFetchProjects: !!value.fetchProjects,
          stack: new Error().stack
        });
      }
      
      return value;
    },
    [
      projects,
      selectedProjectId,
      handleSetSelectedProjectId,
      isLoadingProjects,
      fetchProjects,
      addNewProject,
      isCreatingProject,
      updateProject,
      isUpdatingProject,
      deleteProject,
      isDeletingProject,
      userId,
    ]
  );

  // Expose context globally for debugging
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__PROJECT_CONTEXT__ = { selectedProjectId, projects };
    }
  }, [selectedProjectId, projects]);

  // Ensure contextValue is always defined before rendering Provider
  if (!contextValue || !contextValue.setSelectedProjectId || !contextValue.fetchProjects) {
    console.error('[ProjectContext] Provider cannot render - contextValue is invalid', {
      contextValue,
      hasSetSelectedProjectId: !!contextValue?.setSelectedProjectId,
      hasFetchProjects: !!contextValue?.fetchProjects
    });
    // Return a minimal provider to prevent the error, but this should never happen
    return (
      <ProjectContext.Provider value={contextValue || {
        projects: [],
        selectedProjectId: null,
        setSelectedProjectId: () => {},
        isLoadingProjects: true,
        fetchProjects: async () => {},
        addNewProject: async () => null,
        isCreatingProject: false,
        updateProject: async () => false,
        isUpdatingProject: false,
        deleteProject: async () => false,
        isDeletingProject: false,
        userId: null,
      }}>
        {children}
      </ProjectContext.Provider>
    );
  }

  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    // Provide more context in the error message for debugging
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