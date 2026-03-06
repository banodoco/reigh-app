/**
 * Data Fetching Hook for VideoTravelToolPage
 * 
 * Parallelizes data fetching for better performance by combining:
 * - Shots data from context
 * - Public LoRAs
 * - Tool settings (shot-level and project-level)
 * - UI settings (sort mode, etc.)
 * - Upload settings
 * 
 * @see VideoTravelToolPage.tsx - Main page component that uses this hook
 */

import { useShots } from '@/shared/contexts/ShotsContext';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { useToolSettings } from '@/shared/hooks/settings/useToolSettings';
import { VideoTravelSettings } from '../../settings';
import { Shot } from '@/domains/generation/types';
import type { LoraModel } from '@/domains/lora/components/LoraSelectorModal';

interface ProjectUISettings {
  acceleratedMode?: boolean;
  randomSeed?: boolean;
  shotSortMode?: 'ordered' | 'newest' | 'oldest';
}

export interface UploadSettings {
  cropToProjectSize?: boolean;
}

interface UseVideoTravelDataReturn {
  // Shots data
  shots: Shot[] | undefined;
  shotsLoading: boolean;
  shotsError: Error | null;
  refetchShots: () => void;
  
  // LoRAs data
  availableLoras: LoraModel[];
  lorasLoading: boolean;
  
  // Settings data
  settings: VideoTravelSettings | undefined;
  updateSettings: ((scope: 'shot', patch: Partial<VideoTravelSettings>) => void) | undefined;
  settingsLoading: boolean;
  settingsUpdating: boolean;
  settingsError: Error | null | undefined;

  // Project settings data
  projectSettings: VideoTravelSettings | undefined;
  updateProjectSettings: ((scope: 'project', patch: Partial<VideoTravelSettings>) => void) | undefined;
  projectSettingsLoading: boolean;
  projectSettingsUpdating: boolean;

  // Project UI settings data
  projectUISettings: ProjectUISettings | undefined;
  updateProjectUISettings: ((scope: 'project', patch: Partial<ProjectUISettings>) => void) | undefined;
  
  // Upload settings (cropToProjectSize)
  uploadSettings: UploadSettings | undefined;
}

/**
 * Custom hook to parallelize data fetching for better performance.
 * Combines shots, LoRAs, and various settings queries.
 */
export const useVideoTravelData = (
  selectedShotId?: string | null,
  projectId?: string | null
): UseVideoTravelDataReturn => {
  // Get shots data from context (single source of truth) - full data for ShotEditor
  const { shots, isLoading: shotsLoading, error: shotsError, refetchShots } = useShots();
  
  // Note: Removed limitedShots - ShotListDisplay now uses ShotsContext directly for consistency
  
  // Fetch public LoRAs data - always call this hook
  const publicLorasQuery = usePublicLoras();
  
  // Always call these hooks but disable them when parameters are missing
  // This ensures consistent hook order between renders
  const toolSettingsQuery = useToolSettings<VideoTravelSettings>(
    SETTINGS_IDS.TRAVEL_BETWEEN_IMAGES,
    { 
      shotId: selectedShotId ?? undefined,
      enabled: !!selectedShotId 
    }
  );
  
  // Destructure error separately to ensure it's available
  const { error: toolSettingsError } = toolSettingsQuery;

  const projectSettingsQuery = useToolSettings<VideoTravelSettings>(
    SETTINGS_IDS.TRAVEL_BETWEEN_IMAGES,
    { 
      projectId: projectId ?? undefined,
      enabled: !!projectId 
    }
  );

  const projectUISettingsQuery = useToolSettings<ProjectUISettings>(
    SETTINGS_IDS.TRAVEL_UI_STATE, 
    { 
      projectId: projectId ?? undefined,
      enabled: !!projectId 
    }
  );

  // Upload settings (for cropToProjectSize)
  const uploadSettingsQuery = useToolSettings<UploadSettings>(
    SETTINGS_IDS.UPLOAD, 
    { 
      projectId: projectId ?? undefined,
      enabled: !!projectId 
    }
  );

  // NOTE: shotLoraSettings query removed - LoRAs are now part of main settings (selectedLoras field)
  // and are inherited via useShotSettings along with all other settings

  return {
    // Shots data
    shots, // Full shots data for both ShotEditor and ShotListDisplay (from context)
    // Expose raw loading flags; page can decide how to combine based on context
    shotsLoading,
    shotsError,
    refetchShots,
    
    // LoRAs data
    availableLoras: publicLorasQuery.data ?? [],
    lorasLoading: publicLorasQuery.isLoading,
    
    // Settings data
    settings: toolSettingsQuery.settings,
    updateSettings: toolSettingsQuery.update,
    settingsLoading: toolSettingsQuery.isLoading,
    settingsUpdating: toolSettingsQuery.isUpdating,
    settingsError: toolSettingsError,

    // Project settings data
    projectSettings: projectSettingsQuery.settings,
    updateProjectSettings: projectSettingsQuery.update,
    projectSettingsLoading: projectSettingsQuery.isLoading,
    projectSettingsUpdating: projectSettingsQuery.isUpdating,

    // Project UI settings data
    projectUISettings: projectUISettingsQuery.settings,
    updateProjectUISettings: projectUISettingsQuery.update,
    
    // Upload settings (cropToProjectSize)
    uploadSettings: uploadSettingsQuery.settings,
  };
};
