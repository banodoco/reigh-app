/**
 * useSegmentMutations - Mutations for segment settings
 *
 * Provides all save operations for segment settings:
 * - savePairMetadata: Save segment overrides to pair metadata
 * - saveAsShotDefaults: Promote current settings to shot-level defaults
 * - saveFieldAsDefault: Save a single field as shot default
 * - clearEnhancedPrompt: Clear AI-generated enhanced prompt
 * - saveEnhancePromptEnabled: Save user's enhance prompt preference
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { toJson } from '@/shared/lib/supabaseTypeHelpers';
import { queryKeys } from '@/shared/lib/queryKeys';
import { updateToolSettingsSupabase } from '@/shared/hooks/useToolSettings';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import type { SegmentSettings } from '@/shared/components/segmentSettingsUtils';
import { buildMetadataUpdate } from '@/shared/components/segmentSettingsMigration';
import type { ShotVideoSettings } from '@/shared/lib/settingsMigration';

interface UseSegmentMutationsOptions {
  pairShotGenerationId: string | null | undefined;
  shotId: string | null | undefined;
}

interface UseSegmentMutationsReturn {
  /** Save segment settings to pair metadata */
  savePairMetadata: (settings: SegmentSettings) => Promise<boolean>;
  /** Save current settings as shot-level defaults */
  saveAsShotDefaults: (
    settings: SegmentSettings,
    shotDefaults: Partial<ShotVideoSettings>
  ) => Promise<boolean>;
  /** Save a single field as shot default */
  saveFieldAsDefault: (field: keyof SegmentSettings, value: unknown) => Promise<boolean>;
  /** Clear the enhanced prompt from metadata */
  clearEnhancedPrompt: () => Promise<boolean>;
  /** Save the enhance prompt enabled preference */
  saveEnhancePromptEnabled: (enabled: boolean) => Promise<boolean>;
}

export function useSegmentMutations({
  pairShotGenerationId,
  shotId,
}: UseSegmentMutationsOptions): UseSegmentMutationsReturn {
  const queryClient = useQueryClient();

  // Save segment settings to pair metadata
  const savePairMetadata = useCallback(
    async (settings: SegmentSettings): Promise<boolean> => {
      if (!pairShotGenerationId) {
        return false;
      }

      try {
        // Fetch current metadata
        const { data: current, error: fetchError } = await supabase().from('shot_generations')
          .select('metadata')
          .eq('id', pairShotGenerationId)
          .single();

        if (fetchError) {
          console.error('[useSegmentMutations] Error fetching metadata:', fetchError);
          return false;
        }

        // Build update
        const newMetadata = buildMetadataUpdate(
          (current?.metadata as Record<string, unknown>) || {},
          {
            prompt: settings.prompt,
            negativePrompt: settings.negativePrompt,
            textBeforePrompts: settings.textBeforePrompts,
            textAfterPrompts: settings.textAfterPrompts,
            motionMode: settings.motionMode,
            amountOfMotion: settings.amountOfMotion,
            phaseConfig: (settings.motionMode === 'basic' && !settings.selectedPhasePresetId)
              ? null
              : settings.phaseConfig,
            loras: settings.loras,
            randomSeed: settings.randomSeed,
            seed: settings.seed,
            selectedPhasePresetId: settings.selectedPhasePresetId,
            structureMotionStrength: settings.structureMotionStrength,
            structureTreatment: settings.structureTreatment,
            structureUni3cEndPercent: settings.structureUni3cEndPercent,
          }
        );

        // Save
        const { error: updateError } = await supabase().from('shot_generations')
          .update({ metadata: toJson(newMetadata) })
          .eq('id', pairShotGenerationId);

        if (updateError) {
          console.error('[useSegmentMutations] Error saving metadata:', updateError);
          return false;
        }

        // Refetch caches
        await queryClient.refetchQueries({
          queryKey: queryKeys.segments.pairMetadata(pairShotGenerationId),
        });
        if (shotId) {
          queryClient.refetchQueries({ queryKey: queryKeys.generations.byShot(shotId) });
        }

        return true;
      } catch (error) {
        console.error('[useSegmentMutations] Exception in savePairMetadata:', error);
        return false;
      }
    },
    [pairShotGenerationId, shotId, queryClient]
  );

  // Save current settings as shot-level defaults
  const saveAsShotDefaults = useCallback(
    async (
      settings: SegmentSettings,
      shotDefaults: Partial<ShotVideoSettings>
    ): Promise<boolean> => {
      if (!shotId) {
        return false;
      }

      try {
        // Build patch with effective values (segment override or shot default)
        const shotPatch = {
          prompt: settings.prompt ?? shotDefaults.prompt ?? '',
          negativePrompt: settings.negativePrompt ?? shotDefaults.negativePrompt ?? '',
          motionMode: settings.motionMode ?? shotDefaults.motionMode ?? 'basic',
          amountOfMotion: settings.amountOfMotion ?? shotDefaults.amountOfMotion ?? 50,
          phaseConfig: settings.phaseConfig ?? shotDefaults.phaseConfig,
          selectedPhasePresetId:
            settings.selectedPhasePresetId ?? shotDefaults.selectedPhasePresetId ?? null,
          loras: settings.loras !== undefined ? settings.loras : (shotDefaults.loras ?? []),
          textBeforePrompts: settings.textBeforePrompts ?? shotDefaults.textBeforePrompts ?? '',
          textAfterPrompts: settings.textAfterPrompts ?? shotDefaults.textAfterPrompts ?? '',
          randomSeed: settings.randomSeed ?? true,
          seed: settings.seed,
        };

        await updateToolSettingsSupabase(
          {
            scope: 'shot',
            id: shotId,
            toolId: TOOL_IDS.TRAVEL_BETWEEN_IMAGES,
            patch: shotPatch,
          },
          undefined,
          'immediate'
        );

        // Refetch caches
        await queryClient.refetchQueries({ queryKey: queryKeys.shots.batchSettings(shotId) });
        await queryClient.refetchQueries({ queryKey: queryKeys.settings.byTool(TOOL_IDS.TRAVEL_BETWEEN_IMAGES) });

        return true;
      } catch (error) {
        console.error('[useSegmentMutations] Exception in saveAsShotDefaults:', error);
        return false;
      }
    },
    [shotId, queryClient]
  );

  // Save a single field as shot default
  const saveFieldAsDefault = useCallback(
    async (field: keyof SegmentSettings, value: unknown): Promise<boolean> => {
      if (!shotId) {
        return false;
      }

      try {
        await updateToolSettingsSupabase(
          {
            scope: 'shot',
            id: shotId,
            toolId: TOOL_IDS.TRAVEL_BETWEEN_IMAGES,
            patch: { [field]: value },
          },
          undefined,
          'immediate'
        );

        await queryClient.refetchQueries({ queryKey: queryKeys.shots.batchSettings(shotId) });
        await queryClient.refetchQueries({ queryKey: queryKeys.settings.byTool(TOOL_IDS.TRAVEL_BETWEEN_IMAGES) });

        return true;
      } catch (error) {
        console.error('[useSegmentMutations] Exception in saveFieldAsDefault:', error);
        return false;
      }
    },
    [shotId, queryClient]
  );

  // Clear enhanced prompt from metadata
  const clearEnhancedPrompt = useCallback(async (): Promise<boolean> => {
    if (!pairShotGenerationId) {
      return false;
    }

    try {
      const { data: current, error: fetchError } = await supabase().from('shot_generations')
        .select('metadata')
        .eq('id', pairShotGenerationId)
        .single();

      if (fetchError) {
        console.error('[useSegmentMutations] Error fetching for clear:', fetchError);
        return false;
      }

      const currentMetadata = (current?.metadata as Record<string, unknown>) || {};
      // Only clear the enhanced_prompt, preserve enhance_prompt_enabled preference
      const updatedMetadata = {
        ...currentMetadata,
        enhanced_prompt: '',
      };

      const { error: updateError } = await supabase().from('shot_generations')
        .update({ metadata: updatedMetadata })
        .eq('id', pairShotGenerationId);

      if (updateError) {
        console.error('[useSegmentMutations] Error clearing enhanced prompt:', updateError);
        return false;
      }

      await queryClient.invalidateQueries({
        queryKey: queryKeys.segments.pairMetadata(pairShotGenerationId),
      });

      return true;
    } catch (error) {
      console.error('[useSegmentMutations] Exception in clearEnhancedPrompt:', error);
      return false;
    }
  }, [pairShotGenerationId, queryClient]);

  // Save enhance prompt enabled preference
  const saveEnhancePromptEnabled = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      if (!pairShotGenerationId) {
        return false;
      }

      try {
        const { data: current, error: fetchError } = await supabase().from('shot_generations')
          .select('metadata')
          .eq('id', pairShotGenerationId)
          .single();

        if (fetchError) {
          console.error('[useSegmentMutations] Error fetching for preference:', fetchError);
          return false;
        }

        const updatedMetadata = {
          ...((current?.metadata as Record<string, unknown>) || {}),
          enhance_prompt_enabled: enabled,
        };

        const { error: updateError } = await supabase().from('shot_generations')
          .update({ metadata: updatedMetadata })
          .eq('id', pairShotGenerationId);

        if (updateError) {
          console.error('[useSegmentMutations] Error saving preference:', updateError);
          return false;
        }

        await queryClient.invalidateQueries({
          queryKey: queryKeys.segments.pairMetadata(pairShotGenerationId),
        });

        return true;
      } catch (error) {
        console.error('[useSegmentMutations] Exception in saveEnhancePromptEnabled:', error);
        return false;
      }
    },
    [pairShotGenerationId, queryClient]
  );

  return {
    savePairMetadata,
    saveAsShotDefaults,
    saveFieldAsDefault,
    clearEnhancedPrompt,
    saveEnhancePromptEnabled,
  };
}
