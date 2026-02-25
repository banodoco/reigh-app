import { useEffect, useRef } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { LoraCategory } from '../../types';
import { getLoraCategoryForModel } from '../../types';
import type { ActiveLora } from '@/shared/types/lora';
import type { LegacyMigrationsInput } from './types';

type LoraCategoryMigrationInput = Pick<
  LegacyMigrationsInput,
  'projectImageSettings' | 'selectedProjectId' | 'updateProjectImageSettings'
>;

/**
 * Migrates `selectedLorasByTextModel` (per-model LoRA selections) to
 * `selectedLorasByCategory` (per-category: 'qwen' | 'z-image').
 *
 * All qwen-family models share the 'qwen' category, so the migration
 * merges their LoRAs (deduped by id) into a single list.
 */
export function useLoraCategoryMigration(input: LoraCategoryMigrationInput): void {
  const {
    projectImageSettings,
    selectedProjectId,
    updateProjectImageSettings,
  } = input;

  const migrationAttemptedRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const migrate = async () => {
      if (!projectImageSettings || !selectedProjectId) {
        return;
      }

      if (migrationAttemptedRef.current[selectedProjectId]) {
        return;
      }

      // Only migrate if old format exists and new format doesn't
      if (!projectImageSettings.selectedLorasByTextModel || projectImageSettings.selectedLorasByCategory) {
        migrationAttemptedRef.current[selectedProjectId] = true;
        return;
      }

      migrationAttemptedRef.current[selectedProjectId] = true;

      // Convert per-text-model selections to per-category
      const byCategory: Record<LoraCategory, ActiveLora[]> = {
        'qwen': [],
        'z-image': [],
      };

      const seenIds: Record<LoraCategory, Set<string>> = {
        'qwen': new Set(),
        'z-image': new Set(),
      };

      for (const [model, loras] of Object.entries(projectImageSettings.selectedLorasByTextModel)) {
        const category = getLoraCategoryForModel(model as Parameters<typeof getLoraCategoryForModel>[0]);
        for (const lora of loras) {
          if (!seenIds[category].has(lora.id)) {
            seenIds[category].add(lora.id);
            byCategory[category].push(lora);
          }
        }
      }

      try {
        await updateProjectImageSettings('project', {
          selectedLorasByCategory: byCategory,
          selectedLorasByTextModel: undefined,
        });
      } catch (error) {
        normalizeAndPresentError(error, {
          context: 'ImageGenerationForm.migrateLoraCategoryFormat',
          showToast: false,
        });
        migrationAttemptedRef.current[selectedProjectId] = false;
      }
    };

    void migrate();
  }, [projectImageSettings, selectedProjectId, updateProjectImageSettings]);
}
