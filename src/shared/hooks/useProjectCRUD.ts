import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { toast } from '@/shared/components/ui/toast';
import { Project } from '@/types/project';
import { UserPreferences } from '@/shared/settings/userPreferences';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { fetchInheritableProjectSettings, buildShotSettingsForNewProject } from '@/shared/lib/projectSettingsInheritance';

// Type for updating projects
interface ProjectUpdate {
  name?: string;
  aspectRatio?: string;
}

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
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
};

function toJsonObject(value: unknown): Record<string, Json | undefined> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, Json | undefined>;
  }
  return {};
}

/**
 * Copy template content to a new user's Getting Started shot.
 * Calls a SECURITY DEFINER database function that copies starred images,
 * timeline content, and featured video from the template project.
 */
const copyTemplateToNewUser = async (newProjectId: string, newShotId: string): Promise<void> => {
  const { error } = await supabase.rpc('copy_onboarding_template', {
    target_project_id: newProjectId,
    target_shot_id: newShotId,
  });

  if (error) {
    throw error;
  }
};

const cleanupFailedProjectSetup = async (projectId: string, userId: string): Promise<void> => {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', userId);

  if (error) {
    handleError(error, { context: 'ProjectContext.cleanupFailedProjectSetup', showToast: false });
  }
};

// Helper function to create a default shot for a new project
const createDefaultShot = async (
  projectId: string,
  initialSettings?: Record<string, Json | undefined>,
  isFirstProject: boolean = false
): Promise<string> => {
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
    throw error;
  }

  if (!shot?.id) {
    throw new Error('Default shot creation returned no shot id');
  }

  if (isFirstProject) {
    await copyTemplateToNewUser(projectId, shot.id);
  }

  return shot.id;
};

/** Ensure the user record exists in the users table. */
const ensureUserRecord = async (userId: string): Promise<void> => {
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .single();

  if (!existingUser) {
    const { error: userError } = await supabase.rpc('create_user_record_if_not_exists');
    if (userError) {
      handleError(userError, { context: 'ProjectContext.createUser', showToast: false });
    }
  }
};

export const determineProjectIdToSelect = (
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

interface UseProjectCRUDOptions {
  userId: string | null;
  selectedProjectId: string | null;
  onProjectsLoaded: (projects: Project[], isNewDefault: boolean) => void;
  onProjectCreated: (project: Project) => void;
  onProjectDeleted: (remainingProjects: Project[]) => void;
  updateUserSettings: (scope: 'user', patch: Partial<UserPreferences>) => Promise<void>;
}

/**
 * Manages project CRUD operations: fetch, create, update, delete.
 * Owns the `projects` list state and all loading flags.
 */
export function useProjectCRUD({
  userId,
  selectedProjectId,
  onProjectsLoaded,
  onProjectCreated,
  onProjectDeleted,
  updateUserSettings,
}: UseProjectCRUDOptions) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      if (!userId) throw new Error('Not authenticated');
      const user = { id: userId };

      await ensureUserRecord(user.id);

      const { data: projectsData, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

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
        try {
          await createDefaultShot(newProject.id, undefined, true);
        } catch (setupError) {
          await cleanupFailedProjectSetup(newProject.id, user.id);
          throw setupError;
        }

        const mappedProject = mapDbProjectToProject(newProject);
        setProjects([mappedProject]);
        onProjectsLoaded([mappedProject], true);
      } else {
        const mappedProjects = projectsData.map(mapDbProjectToProject);
        setProjects(mappedProjects);
        onProjectsLoaded(mappedProjects, false);
      }
    } catch (error: unknown) {
      handleError(error, { context: 'ProjectContext', toastTitle: 'Failed to load projects' });
      setProjects([]);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [userId, onProjectsLoaded]);

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
      if (!userId) throw new Error('Not authenticated');
      const user = { id: userId };

      await ensureUserRecord(user.id);

      const settingsToInherit = selectedProjectId
        ? toJsonObject(await fetchInheritableProjectSettings(selectedProjectId))
        : {};

      const { data: newProject, error } = await supabase
        .from('projects')
        .insert({
          name: projectData.name,
          user_id: user.id,
          aspect_ratio: projectData.aspectRatio,
          settings: settingsToInherit,
        })
        .select()
        .single();

      if (error) throw error;

      const shotSettingsToInherit = selectedProjectId
        ? toJsonObject(await buildShotSettingsForNewProject(selectedProjectId, settingsToInherit))
        : {};

      try {
        await createDefaultShot(newProject.id, shotSettingsToInherit);
      } catch (setupError) {
        await cleanupFailedProjectSetup(newProject.id, user.id);
        throw setupError;
      }

      const mappedProject = mapDbProjectToProject(newProject);
      setProjects(prevProjects => sortProjectsByCreatedAt([...prevProjects, mappedProject]));
      onProjectCreated(mappedProject);

      updateUserSettings('user', { lastOpenedProjectId: mappedProject.id });

      return mappedProject;
    } catch (err: unknown) {
      handleError(err, { context: 'ProjectContext', toastTitle: 'Failed to create project' });
      return null;
    } finally {
      setIsCreatingProject(false);
    }
  }, [userId, selectedProjectId, onProjectCreated, updateUserSettings]);

  const updateProject = useCallback(async (projectId: string, updates: ProjectUpdate): Promise<boolean> => {
    if (!updates.name?.trim() && !updates.aspectRatio) {
      toast.error("No changes to save.");
      return false;
    }
    setIsUpdatingProject(true);
    try {
      if (!userId) throw new Error('Not authenticated');
      const user = { id: userId };

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
  }, [userId]);

  const deleteProject = useCallback(async (projectId: string): Promise<boolean> => {
    setIsDeletingProject(true);
    try {
      if (!userId) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('delete-project', {
        body: { projectId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Filter outside updater so we can call the side-effect callback separately
      // (React state updaters must be pure — no side effects)
      const updated = projects.filter(p => p.id !== projectId);
      setProjects(updated);
      onProjectDeleted(updated);

      return true;
    } catch (err: unknown) {
      handleError(err, { context: 'ProjectContext', toastTitle: 'Failed to delete project' });
      return false;
    } finally {
      setIsDeletingProject(false);
    }
  }, [onProjectDeleted, projects, userId]);

  return {
    projects,
    isLoadingProjects,
    fetchProjects,
    addNewProject,
    isCreatingProject,
    updateProject,
    isUpdatingProject,
    deleteProject,
    isDeletingProject,
  };
}
