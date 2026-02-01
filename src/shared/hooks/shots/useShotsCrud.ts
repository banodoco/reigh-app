/**
 * Shot CRUD operations: create, duplicate, delete, reorder.
 * These operate on the shots table directly.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Shot } from '@/types/shots';
import { toast } from 'sonner';
import { invalidateGenerationsSync } from '@/shared/hooks/useGenerationInvalidation';
import {
  cancelShotsQueries,
  findShotsCache,
  updateAllShotsCaches,
  rollbackShotsCaches,
} from './cacheUtils';
import { shotDebug, shotError } from './debug';

// ============================================================================
// DELETE SHOT
// ============================================================================

export const useDeleteShot = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ shotId, projectId }: { shotId: string; projectId: string }) => {
      shotDebug('delete', 'mutationFn START', { shotId, projectId });

      const { error } = await supabase
        .from('shots')
        .delete()
        .eq('id', shotId);

      if (error) throw error;

      shotDebug('delete', 'mutationFn SUCCESS - DB delete complete');
      return { shotId, projectId };
    },

    onMutate: async (variables) => {
      const { shotId, projectId } = variables;
      shotDebug('delete', 'onMutate START - optimistic update', { shotId, projectId });

      // Cancel in-flight queries
      await cancelShotsQueries(queryClient, projectId);

      // Find existing cache data
      const previousShots = findShotsCache(queryClient, projectId);

      shotDebug('delete', 'cache state', {
        hasPreviousShots: !!previousShots,
        previousCount: previousShots?.length || 0,
        shotToDeleteExists: previousShots?.some(s => s.id === shotId),
      });

      // Optimistically remove the shot
      if (previousShots) {
        updateAllShotsCaches(queryClient, projectId, (old) =>
          (old || []).filter(s => s.id !== shotId)
        );
        shotDebug('delete', 'onMutate COMPLETE - cache updated optimistically');
      } else {
        shotDebug('delete', 'No previous shots cache found!');
      }

      return { previousShots, projectId, shotId };
    },

    onSuccess: ({ shotId, projectId }) => {
      shotDebug('delete', 'onSuccess - mutation completed');

      // Invalidate related queries
      invalidateGenerationsSync(queryClient, shotId, {
        reason: 'delete-shot',
        scope: 'all',
        includeProjectUnified: true,
        projectId,
      });
    },

    onError: (error: Error, variables, context) => {
      shotError('delete', 'onError - rolling back', error, {
        shotId: variables.shotId,
        projectId: variables.projectId,
      });

      // Rollback optimistic update
      if (context?.previousShots && context.projectId) {
        rollbackShotsCaches(queryClient, context.projectId, context.previousShots);
      }

      toast.error(`Failed to delete shot: ${error.message}`);
    },
  });
};

// ============================================================================
// CREATE SHOT
// ============================================================================

export const useCreateShot = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      projectId,
      aspectRatio,
      shouldSelectAfterCreation = true,
      position,
    }: {
      name: string;
      projectId: string;
      aspectRatio?: string | null;
      shouldSelectAfterCreation?: boolean;
      position?: number;
    }) => {
      let resolvedPosition = position;

      if (resolvedPosition === undefined) {
        const { data: lastShot, error: lastShotError } = await supabase
          .from('shots')
          .select('position')
          .eq('project_id', projectId)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle<{ position: number | null }>();

        if (lastShotError && lastShotError.code !== 'PGRST116') {
          throw lastShotError;
        }

        const lastPosition = lastShot?.position ?? 0;
        resolvedPosition = lastPosition + 1;
      }

      const { data, error } = await supabase
        .rpc('insert_shot_at_position', {
          p_project_id: projectId,
          p_shot_name: name,
          p_position: resolvedPosition,
        })
        .single();

      if (error) throw error;

      const result = data as { shot_id: string; success: boolean } | null;
      if (!result?.success || !result.shot_id) {
        throw new Error('Failed to create shot at position');
      }

      // Update shot with aspect ratio if provided
      if (aspectRatio) {
        const { error: updateError } = await supabase
          .from('shots')
          .update({ aspect_ratio: aspectRatio })
          .eq('id', result.shot_id);

        if (updateError) {
          console.error('Error updating shot aspect ratio:', updateError);
        }
      }

      const { data: shotData, error: fetchError } = await supabase
        .from('shots')
        .select()
        .eq('id', result.shot_id)
        .single();

      if (fetchError) throw fetchError;

      return { shot: { ...shotData, images: [] }, shouldSelectAfterCreation };
    },

    onSuccess: (result, variables) => {
      if (variables.projectId && result.shot) {
        const newShot = result.shot;

        updateAllShotsCaches(queryClient, variables.projectId, (oldShots = []) => {
          // Check if shot already exists
          if (oldShots.some(shot => shot.id === newShot.id)) {
            return oldShots;
          }

          // Insert at correct position
          const newShotPosition = (newShot as any).position || 0;
          const insertionIndex = oldShots.findIndex(
            shot => (shot.position || 0) > newShotPosition
          );

          if (insertionIndex === -1) {
            return [...oldShots, newShot];
          } else {
            const updatedShots = [...oldShots];
            updatedShots.splice(insertionIndex, 0, newShot);
            return updatedShots;
          }
        });

        // Cache the shot individually
        queryClient.setQueryData(['shot', newShot.id], newShot);

        shotDebug('create', 'Manually updated cache for immediate UI feedback');
      }
    },

    onError: (error: Error) => {
      console.error('Error creating shot:', error);
      toast.error(`Failed to create shot: ${error.message}`);
    },
  });
};

// ============================================================================
// DUPLICATE SHOT
// ============================================================================

export const useDuplicateShot = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ shotId, projectId }: { shotId: string; projectId: string }) => {
      const { data, error } = await supabase.rpc('duplicate_shot', {
        original_shot_id: shotId,
        project_id: projectId,
      });

      if (error) throw error;

      const newShotId = data;

      const { data: shotData, error: fetchError } = await supabase
        .from('shots')
        .select()
        .eq('id', newShotId)
        .single();

      if (fetchError) throw fetchError;

      return shotData;
    },

    onMutate: async (variables) => {
      const { shotId, projectId } = variables;

      await cancelShotsQueries(queryClient, projectId);

      const previousShots = findShotsCache(queryClient, projectId);
      const originalShot = previousShots?.find(s => s.id === shotId);

      let tempId: string | undefined;

      if (originalShot && previousShots) {
        tempId = `temp-duplicate-${Date.now()}`;
        const duplicateShot: Shot = {
          ...originalShot,
          id: tempId,
          name: `${originalShot.name || 'Shot'} (copy)`,
          position: (originalShot.position || 0) + 1,
          created_at: new Date().toISOString(),
        };

        const originalIndex = previousShots.findIndex(s => s.id === shotId);

        updateAllShotsCaches(queryClient, projectId, (old = []) => {
          const updated = [...old];
          const idx = updated.findIndex(s => s.id === shotId);
          if (idx !== -1) {
            updated.splice(idx + 1, 0, duplicateShot);
          }
          return updated;
        });
      }

      return { previousShots, projectId, tempId };
    },

    onSuccess: (data, variables, context) => {
      const { projectId } = variables;
      const tempId = context?.tempId;

      if (tempId && data) {
        // Replace temp shot with real one
        updateAllShotsCaches(queryClient, projectId, (old = []) =>
          old.map(shot =>
            shot.id === tempId ? { ...data, images: shot.images || [] } : shot
          )
        );
      }

      // Invalidate to ensure full sync
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
    },

    onError: (error: Error, variables, context) => {
      if (context?.previousShots && context.projectId) {
        rollbackShotsCaches(queryClient, context.projectId, context.previousShots);
      }
      console.error('Error duplicating shot:', error);
      toast.error(`Failed to duplicate shot: ${error.message}`);
    },
  });
};

// ============================================================================
// REORDER SHOTS
// ============================================================================

export const useReorderShots = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      shotOrders,
    }: {
      projectId: string;
      shotOrders: Array<{ shotId: string; position: number }>;
    }) => {
      const promises = shotOrders.map(({ shotId, position }) =>
        supabase
          .from('shots')
          .update({ position })
          .eq('id', shotId)
          .eq('project_id', projectId)
      );

      const results = await Promise.all(promises);

      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        const errorMessages = errors.map(e => e.error?.message).join(', ');
        throw new Error(`Failed to update some shot positions: ${errorMessages}`);
      }

      return { projectId, shotOrders };
    },

    onMutate: async (variables) => {
      const { projectId, shotOrders } = variables;

      await cancelShotsQueries(queryClient, projectId);

      const previousShots = findShotsCache(queryClient, projectId);

      if (previousShots) {
        updateAllShotsCaches(queryClient, projectId, (old = []) => {
          const updated = old.map(shot => {
            const order = shotOrders.find(o => o.shotId === shot.id);
            if (order) {
              return { ...shot, position: order.position };
            }
            return shot;
          });
          // Sort by new positions
          updated.sort((a, b) => (a.position || 0) - (b.position || 0));
          return updated;
        });
      }

      return { previousShots, projectId };
    },

    onError: (error: Error, variables, context) => {
      if (context?.previousShots && context.projectId) {
        rollbackShotsCaches(queryClient, context.projectId, context.previousShots);
      }
      console.error('Error reordering shots:', error);
      toast.error(`Failed to reorder shots: ${error.message}`);
    },

    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
    },
  });
};
