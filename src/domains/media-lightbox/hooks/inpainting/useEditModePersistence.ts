/**
 * Handles database persistence for edit mode.
 * Saves/loads editMode to/from generations.params.ui.editMode
 */

import { useCallback } from 'react';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import type { EditMode } from './types';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

const VALID_EDIT_MODES: EditMode[] = ['text', 'inpaint', 'annotate'];

export function useEditModePersistence() {
  /**
   * Load edit mode from database for a generation
   */
  const loadEditModeFromDB = useCallback(async (generationId: string): Promise<EditMode | null> => {
    try {
      const { data, error } = await supabase().from('generations')
        .select('params')
        .eq('id', generationId)
        .maybeSingle();

      if (error) {
        normalizeAndPresentError(error, {
          context: 'useEditModePersistence.load.fetch',
          showToast: false,
          logData: { generationId },
        });
        return null;
      }

      if (!data) {
        return null;
      }

      const savedMode = ((data?.params as Record<string, unknown>)?.ui as Record<string, unknown> | undefined)?.editMode;
      if (typeof savedMode === 'string' && VALID_EDIT_MODES.includes(savedMode as EditMode)) {
        return savedMode as EditMode;
      }

      return null;
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useEditModePersistence.load.exception',
        showToast: false,
        logData: { generationId },
      });
      return null;
    }
  }, []);

  /**
   * Save edit mode to database for a generation
   */
  const saveEditModeToDB = useCallback(async (generationId: string, mode: EditMode) => {
    try {
      // First, fetch current params to merge
      const { data: current, error: fetchError } = await supabase().from('generations')
        .select('params')
        .eq('id', generationId)
        .maybeSingle();

      if (fetchError) {
        normalizeAndPresentError(fetchError, {
          context: 'useEditModePersistence.save.fetch',
          showToast: false,
          logData: { generationId, mode },
        });
        return;
      }

      if (!current) {
        return;
      }

      // Merge with existing params
      const currentParams = (current?.params || {}) as Record<string, unknown>;
      const currentUi = (currentParams.ui || {}) as Record<string, unknown>;
      const updatedParams = {
        ...currentParams,
        ui: {
          ...currentUi,
          editMode: mode
        }
      };

      const { error: updateError } = await supabase().from('generations')
        .update({ params: updatedParams })
        .eq('id', generationId);
      if (updateError) {
        normalizeAndPresentError(updateError, {
          context: 'useEditModePersistence.save.update',
          showToast: false,
          logData: { generationId, mode },
        });
      }

    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useEditModePersistence.save.exception',
        showToast: false,
        logData: { generationId, mode },
      });
    }
  }, []);

  return {
    loadEditModeFromDB,
    saveEditModeToDB,
  };
}
