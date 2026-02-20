import { supabase } from '@/integrations/supabase/client';
import { STORAGE_KEYS } from '@/shared/lib/storageKeys';
import { TOOL_IDS } from '@/shared/lib/toolConstants';
import { handleError } from '@/shared/lib/errorHandling/handleError';

/**
 * Filters project-level settings for inheritance into a new project.
 * Content fields (prompts, references) are excluded; configuration settings are kept.
 *
 * INHERITANCE POLICY: Content data doesn't inherit, but configuration settings do.
 */
function filterSettingsForInheritance(
  settings: Record<string, unknown>
): Record<string, unknown> {
  const settingsToInherit: Record<string, unknown> = {};

  Object.entries(settings).forEach(([toolId, toolSettings]) => {
    if (typeof toolSettings === 'object' && toolSettings !== null) {
      const filteredToolSettings = { ...toolSettings } as Record<string, unknown>;

      // Remove prompt-related keys
      delete filteredToolSettings.prompt;
      delete filteredToolSettings.prompts;
      delete filteredToolSettings.beforeEachPromptText;
      delete filteredToolSettings.afterEachPromptText;
      delete filteredToolSettings.pairConfigs;

      // Remove reference-related keys
      delete filteredToolSettings.references;
      delete filteredToolSettings.selectedReferenceId;
      delete filteredToolSettings.selectedReferenceIdByShot;
      delete filteredToolSettings.styleReferenceImage;
      delete filteredToolSettings.styleReferenceImageOriginal;
      delete filteredToolSettings.styleReferenceStrength;
      delete filteredToolSettings.subjectStrength;
      delete filteredToolSettings.subjectDescription;
      delete filteredToolSettings.inThisScene;

      // Remove prompt-editor specific AI settings
      delete filteredToolSettings.generationSettings;
      delete filteredToolSettings.bulkEditSettings;
      delete filteredToolSettings.activeTab;

      // Filter out any keys containing "prompt" or "reference" (case-insensitive)
      Object.keys(filteredToolSettings).forEach(key => {
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('prompt') || lowerKey.includes('reference')) {
          delete filteredToolSettings[key];
        }
      });

      if (Object.keys(filteredToolSettings).length > 0) {
        settingsToInherit[toolId] = filteredToolSettings;
      }
    }
  });

  return settingsToInherit;
}

/**
 * Fetches project settings from the database and filters them for inheritance.
 * Returns empty object if the fetch fails or no settings exist.
 */
export async function fetchInheritableProjectSettings(
  projectId: string
): Promise<Record<string, unknown>> {
  try {
    const { data } = await supabase
      .from('projects')
      .select('settings')
      .eq('id', projectId)
      .single();

    if (data?.settings) {
      return filterSettingsForInheritance(data.settings as Record<string, unknown>);
    }
  } catch {
    // Continue with project creation even if settings copy fails
  }
  return {};
}

/**
 * Builds shot settings to inherit for a new project's default shot.
 * Priority: localStorage (most current) -> DB (last saved) -> project-level settings fallback.
 */
export async function buildShotSettingsForNewProject(
  sourceProjectId: string,
  projectLevelSettings: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // 1. Try localStorage first (most up-to-date on current device)
  try {
    const storageKey = STORAGE_KEYS.LAST_ACTIVE_SHOT_SETTINGS(sourceProjectId);
    const storedMain = localStorage.getItem(storageKey);

    if (storedMain) {
      const mainSettings = JSON.parse(storedMain);
      return {
        [TOOL_IDS.TRAVEL_BETWEEN_IMAGES]: {
          ...mainSettings,
          prompt: '',
          shotImageIds: [],
          pairConfigs: [],
          textBeforePrompts: '',
          textAfterPrompts: '',
        },
      };
    }
  } catch (e) {
    handleError(e, { context: 'projectSettingsInheritance.localStorage', showToast: false });
  }

  // 2. Fallback: fetch the latest shot from the DB
  try {
    const { data: latestShot } = await supabase
      .from('shots')
      .select('settings')
      .eq('project_id', sourceProjectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (latestShot?.settings) {
      const shotSettings = latestShot.settings as Record<string, unknown>;
      if (shotSettings[TOOL_IDS.TRAVEL_BETWEEN_IMAGES]) {
        const mainSettings = (shotSettings[TOOL_IDS.TRAVEL_BETWEEN_IMAGES] as Record<string, unknown>) || {};
        return {
          [TOOL_IDS.TRAVEL_BETWEEN_IMAGES]: {
            ...mainSettings,
            prompt: '',
            shotImageIds: [],
            pairConfigs: [],
            textBeforePrompts: '',
            textAfterPrompts: '',
          },
        };
      }
    }
  } catch {
    // Fall through to project-level fallback
  }

  // 3. Fallback: use project-level travel settings
  if (projectLevelSettings[TOOL_IDS.TRAVEL_BETWEEN_IMAGES]) {
    return {
      [TOOL_IDS.TRAVEL_BETWEEN_IMAGES]: projectLevelSettings[TOOL_IDS.TRAVEL_BETWEEN_IMAGES],
    };
  }

  return {};
}
