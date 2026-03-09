import { useState, useCallback } from 'react';
import { getSupabaseClient as supabase } from '../../../integrations/supabase/client';
import { toast } from '../../components/ui/runtime/sonner';
import { Project } from '../../../types/project';
import { UserPreferences } from '../../settings/userPreferences';
import { normalizeAndPresentError } from '../../lib/errorHandling/runtimeError';
import { fetchInheritableProjectSettings, buildShotSettingsForNewProject } from '../../lib/projectSettingsInheritance';
import { toJsonObject } from '../../lib/json/toJsonObject';
import {
  createDefaultShotWithRollback,
  ensureUserRecordExists,
} from '../../services/projects/projectSetupService';

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

export const determineProjectIdToSelect = (
  projects: Project[],
  preferredId: string | null | undefined,
  lastOpenedId: string | null | undefined
): string | null => {
  if (!projects.length) return null;

  const availableProjectIds = new Set(projects.map(p => p.id));

  if (preferredId && availableProjectIds.has(preferredId)) {
    return preferredId;
  }
  if (lastOpenedId && availableProjectIds.has(lastOpenedId)) {
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

      await ensureUserRecordExists(user.id);

      const { data: projectsData, error } = await supabase().from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!projectsData || projectsData.length === 0) {
        const { data: newProject, error: createError } = await supabase().from('projects')
          .insert({
            name: 'Sample Project',
            user_id: user.id,
            aspect_ratio: '16:9',
          })
          .select()
          .single();

        if (createError) throw createError;
        await createDefaultShotWithRollback(newProject.id, user.id, { isFirstProject: true });

        const mappedProject = mapDbProjectToProject(newProject);
        setProjects([mappedProject]);
        onProjectsLoaded([mappedProject], true);
      } else {
        const mappedProjects = projectsData.map(mapDbProjectToProject);
        setProjects(mappedProjects);
        onProjectsLoaded(mappedProjects, false);
      }
    } catch (error: unknown) {
      normalizeAndPresentError(error, { context: 'ProjectContext', toastTitle: 'Failed to load projects' });
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

      await ensureUserRecordExists(user.id);

      const settingsToInherit = selectedProjectId
        ? toJsonObject(await fetchInheritableProjectSettings(selectedProjectId))
        : {};

      const { data: newProject, error } = await supabase().from('projects')
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

      await createDefaultShotWithRollback(newProject.id, user.id, {
        initialSettings: shotSettingsToInherit,
      });

      const mappedProject = mapDbProjectToProject(newProject);
      setProjects(prevProjects => sortProjectsByCreatedAt([...prevProjects, mappedProject]));
      onProjectCreated(mappedProject);

      updateUserSettings('user', { lastOpenedProjectId: mappedProject.id });

      return mappedProject;
    } catch (err: unknown) {
      normalizeAndPresentError(err, { context: 'ProjectContext', toastTitle: 'Failed to create project' });
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

      const { data: updatedProject, error } = await supabase().from('projects')
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
      normalizeAndPresentError(err, { context: 'ProjectContext', toastTitle: 'Failed to update project' });
      return false;
    } finally {
      setIsUpdatingProject(false);
    }
  }, [userId]);

  const deleteProject = useCallback(async (projectId: string): Promise<boolean> => {
    setIsDeletingProject(true);
    try {
      if (!userId) throw new Error('Not authenticated');

      const { data, error } = await supabase().functions.invoke('delete-project', {
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
      normalizeAndPresentError(err, { context: 'ProjectContext', toastTitle: 'Failed to delete project' });
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
