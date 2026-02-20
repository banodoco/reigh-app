/**
 * Handles database persistence for edit mode.
 * Saves/loads editMode to/from generations.params.ui.editMode
 */

import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { EditMode } from './types';

const VALID_EDIT_MODES: EditMode[] = ['text', 'inpaint', 'annotate'];

export function useEditModePersistence() {
  /**
   * Load edit mode from database for a generation
   */
  const loadEditModeFromDB = useCallback(async (generationId: string): Promise<EditMode | null> => {
    try {
      const { data, error } = await supabase
        .from('generations')
        .select('params')
        .eq('id', generationId)
        .maybeSingle();

      if (error) {
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
    } catch {
      return null;
    }
  }, []);

  /**
   * Save edit mode to database for a generation
   */
  const saveEditModeToDB = useCallback(async (generationId: string, mode: EditMode) => {
    try {
      // First, fetch current params to merge
      const { data: current, error: fetchError } = await supabase
        .from('generations')
        .select('params')
        .eq('id', generationId)
        .maybeSingle();

      if (fetchError) {
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

      await supabase
        .from('generations')
        .update({ params: updatedParams })
        .eq('id', generationId);

    } catch { /* intentionally ignored */ }
  }, []);

  return {
    loadEditModeFromDB,
    saveEditModeToDB,
  };
}
