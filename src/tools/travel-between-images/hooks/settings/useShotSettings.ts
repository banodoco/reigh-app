import { useCallback, useRef, useMemo, useEffect } from 'react';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { useAutoSaveSettings } from '@/shared/settings/hooks/useAutoSaveSettings';
import { VideoTravelSettings, DEFAULT_PHASE_CONFIG, videoTravelSettings } from '../../settings';
import { STORAGE_KEYS } from '@/shared/lib/storageKeys';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { DEFAULT_STEERABLE_MOTION_SETTINGS } from '../../components/ShotEditor/state/types';
import { useSessionInheritedDefaults } from './inheritedDefaults';

export interface UseShotSettingsReturn {
  // State
  settings: VideoTravelSettings;
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'error';
  /** The shot ID these settings are confirmed for (null if not yet loaded) */
  shotId: string | null;
  isDirty: boolean;
  error: Error | null;
  
  // Field Updates
  updateField: <K extends keyof VideoTravelSettings>(
    key: K, 
    value: VideoTravelSettings[K]
  ) => void;
  
  updateFields: (updates: Partial<VideoTravelSettings>) => void;
  
  // Operations
  applyShotSettings: (sourceShotId: string) => Promise<void>;
  applyProjectDefaults: () => Promise<void>;
  resetToDefaults: () => void;
  
  // Saving
  save: () => Promise<void>;
  saveImmediate: () => Promise<void>;
  revert: () => void;
}

/**
 * Shot-specific settings hook built on useAutoSaveSettings.
 * 
 * Adds shot-specific functionality:
 * - Session storage inheritance for new shots
 * - localStorage persistence for cross-shot inheritance
 * - Apply settings from another shot
 * - Apply project defaults
 * - Special handling for advancedMode/phaseConfig initialization
 */
export const useShotSettings = (
  shotId: string | null | undefined,
  projectId: string | null | undefined
): UseShotSettingsReturn => {
  const inheritedSettings = useSessionInheritedDefaults<VideoTravelSettings>({
    shotId,
    storageKeyForShot: STORAGE_KEYS.APPLY_PROJECT_DEFAULTS,
    mergeDefaults: (defaults) => {
      const { _uiSettings, ...validSettings } = defaults;
      return {
        ...videoTravelSettings.defaults,
        ...validSettings,
        steerableMotionSettings: {
          ...DEFAULT_STEERABLE_MOTION_SETTINGS,
          ...(validSettings.steerableMotionSettings || {}),
        },
      } as VideoTravelSettings;
    },
    context: 'useShotSettings',
  });
  
  // Use the shared auto-save hook with inherited settings as initial defaults
  const autoSave = useAutoSaveSettings<VideoTravelSettings>({
    toolId: TOOL_IDS.TRAVEL_BETWEEN_IMAGES,
    shotId,
    projectId,
    scope: 'shot',
    defaults: inheritedSettings || videoTravelSettings.defaults,
    enabled: !!shotId,
    debounceMs: 300,
  });
  const {
    settings,
    status,
    entityId,
    isDirty,
    error,
    hasShotSettings,
    updateField: autoSaveUpdateField,
    updateFields: autoSaveUpdateFields,
    saveImmediate,
    revert,
  } = autoSave;
  
  // Save inherited settings to DB immediately if we have them
  // CRITICAL: Only save if the shot doesn't already have settings in DB
  // to prevent overwriting existing settings with inherited defaults
  // We use `hasShotSettings` from useToolSettings which checks at the DB level
  useEffect(() => {
    // Only save inherited settings if:
    // 1. We have inherited settings
    // 2. Status is ready
    // 3. DB did NOT have existing settings (hasShotSettings is false)
    if (inheritedSettings && shotId && status === 'ready') {
      if (!hasShotSettings) {
        // Persist inherited settings immediately via the canonical auto-save boundary.
        saveImmediate(inheritedSettings).catch(err => {
          normalizeAndPresentError(err, { context: 'useShotSettings', showToast: false });
        });
      }
    }
  }, [inheritedSettings, shotId, status, hasShotSettings, saveImmediate]);
  
  // Persist settings to localStorage for future inheritance
  useEffect(() => {
    if (shotId && projectId && status === 'ready' && settings) {
      try {
        // Project-specific key
        const projectStorageKey = STORAGE_KEYS.LAST_ACTIVE_SHOT_SETTINGS(projectId);
        localStorage.setItem(projectStorageKey, JSON.stringify(settings));
        
        // Global key (without pairConfigs which are shot-specific)
        const globalSettings = { ...settings, pairConfigs: [] };
        localStorage.setItem(STORAGE_KEYS.GLOBAL_LAST_ACTIVE_SHOT_SETTINGS, JSON.stringify(globalSettings));
      } catch (e) {
        normalizeAndPresentError(e, { context: 'useShotSettings', showToast: false });
      }
    }
  }, [settings, shotId, projectId, status]);
  
  // Refs for callbacks that need latest values without recreation
  const autoSaveSettingsRef = useRef(autoSave.settings);
  autoSaveSettingsRef.current = autoSave.settings;
  const shotIdRef = useRef(shotId);
  shotIdRef.current = shotId;
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  // Wrapped updateField with special handling for advancedMode/phaseConfig
  const updateField = useCallback(<K extends keyof VideoTravelSettings>(
    key: K,
    value: VideoTravelSettings[K]
  ) => {
    // Handle special case: when switching to advanced mode, initialize phaseConfig
    if (key === 'advancedMode' && value === true) {
      const currentSettings = autoSaveSettingsRef.current;
      if (!currentSettings.phaseConfig) {
        autoSaveUpdateFields({
          [key]: value,
          phaseConfig: DEFAULT_PHASE_CONFIG,
        } as Partial<VideoTravelSettings>);
        return;
      }
    }
    if (key === 'motionMode' && value === 'advanced') {
      const currentSettings = autoSaveSettingsRef.current;
      if (!currentSettings.phaseConfig) {
        autoSaveUpdateFields({
          [key]: value,
          phaseConfig: DEFAULT_PHASE_CONFIG,
        } as Partial<VideoTravelSettings>);
        return;
      }
    }

    autoSaveUpdateField(key, value);
  }, [autoSaveUpdateField, autoSaveUpdateFields]);
  
  // Apply settings from another shot
  const applyShotSettings = useCallback(async (sourceShotId: string) => {
    if (!shotIdRef.current || !sourceShotId) {
      toast.error('Cannot apply settings: missing shot ID');
      return;
    }

    try {
      const { data, error: fetchError } = await supabase().from('shots')
        .select('settings')
        .eq('id', sourceShotId)
        .single();

      if (fetchError) throw fetchError;

      const sourceSettings = (data?.settings as Record<string, unknown>)?.[TOOL_IDS.TRAVEL_BETWEEN_IMAGES] as VideoTravelSettings;

      if (sourceSettings) {
        autoSaveUpdateFields(sourceSettings);
      } else {
        toast.error('Source shot has no settings');
      }
    } catch (err) {
      normalizeAndPresentError(err, { context: 'useShotSettings', toastTitle: 'Failed to apply settings' });
    }
  }, [autoSaveUpdateFields]);

  // Apply project defaults
  const applyProjectDefaults = useCallback(async () => {
    if (!projectIdRef.current) {
      toast.error('Cannot apply defaults: no project selected');
      return;
    }

    try {
      const { data, error: fetchError } = await supabase().from('projects')
        .select('settings')
        .eq('id', projectIdRef.current)
        .single();

      if (fetchError) throw fetchError;

      const projectDefaults = (data?.settings as Record<string, unknown>)?.[TOOL_IDS.TRAVEL_BETWEEN_IMAGES] as VideoTravelSettings;

      if (projectDefaults) {
        autoSaveUpdateFields(projectDefaults);
      } else {
        toast.error('Project has no default settings');
      }
    } catch (err) {
      normalizeAndPresentError(err, { context: 'useShotSettings', toastTitle: 'Failed to apply defaults' });
    }
  }, [autoSaveUpdateFields]);

  // Reset to hardcoded defaults
  const resetToDefaults = useCallback(() => {
    autoSaveUpdateFields(videoTravelSettings.defaults);
  }, [autoSaveUpdateFields]);
  
  // Memoize return value
  return useMemo(() => ({
    settings,
    status: status as 'idle' | 'loading' | 'ready' | 'saving' | 'error',
    shotId: entityId,
    isDirty,
    error,
    updateField,
    updateFields: autoSaveUpdateFields,
    applyShotSettings,
    applyProjectDefaults,
    resetToDefaults,
    save: saveImmediate,
    saveImmediate,
    revert,
  }), [
    settings,
    status,
    entityId,
    isDirty,
    error,
    updateField,
    autoSaveUpdateFields,
    saveImmediate,
    revert,
    applyShotSettings,
    applyProjectDefaults,
    resetToDefaults,
  ]);
};
