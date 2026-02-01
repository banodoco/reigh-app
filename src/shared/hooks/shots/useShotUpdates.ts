/**
 * Shot field update hooks.
 * Provides a generic field updater with backwards-compatible wrappers.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type ShotField = 'name' | 'aspect_ratio';

// ============================================================================
// GENERIC FIELD UPDATER
// ============================================================================

/**
 * Generic hook for updating a single shot field.
 * Use the specific wrappers (useUpdateShotName, useUpdateShotAspectRatio) for type safety.
 */
export const useUpdateShotField = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      shotId,
      projectId,
      field,
      value,
    }: {
      shotId: string;
      projectId: string;
      field: ShotField;
      value: string;
    }) => {
      const { error } = await supabase
        .from('shots')
        .update({ [field]: value })
        .eq('id', shotId);

      if (error) throw error;
      return { shotId, projectId, field, value };
    },

    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
    },

    onError: (error: Error, { field }) => {
      console.error(`Error updating shot ${field}:`, error);
      toast.error(`Failed to update shot ${field}: ${error.message}`);
    },
  });
};

// ============================================================================
// BACKWARDS-COMPATIBLE WRAPPERS
// ============================================================================

/**
 * Update shot name.
 * Supports both 'name' and 'newName' parameters for backwards compatibility.
 */
export const useUpdateShotName = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      shotId,
      name,
      newName,
      projectId,
    }: {
      shotId: string;
      name?: string;
      newName?: string;
      projectId: string;
    }) => {
      const shotName = newName || name;
      if (!shotName) {
        throw new Error('Shot name is required');
      }

      const { error } = await supabase
        .from('shots')
        .update({ name: shotName })
        .eq('id', shotId);

      if (error) throw error;
      return { shotId, name: shotName, projectId };
    },

    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
    },

    onError: (error: Error) => {
      console.error('Error updating shot name:', error);
      toast.error(`Failed to update shot name: ${error.message}`);
    },
  });
};

/**
 * Update shot aspect ratio.
 */
export const useUpdateShotAspectRatio = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      shotId,
      aspectRatio,
      projectId,
    }: {
      shotId: string;
      aspectRatio: string;
      projectId: string;
    }) => {
      const { error } = await supabase
        .from('shots')
        .update({ aspect_ratio: aspectRatio })
        .eq('id', shotId);

      if (error) throw error;
      return { shotId, aspectRatio, projectId };
    },

    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
    },
  });
};
