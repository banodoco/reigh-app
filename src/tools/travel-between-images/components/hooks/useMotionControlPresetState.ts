import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { presetQueryKeys } from '@/shared/lib/queryKeys/presets';
import type { PresetMetadata, PresetSampleGeneration } from '@/shared/types/presetMetadata';
import type { PhaseConfig } from '../../settings';
import { usePresetAutoSelect } from '../../hooks/settings/usePresetAutoSelect';
import {
  BUILTIN_DEFAULT_I2V_ID,
  BUILTIN_DEFAULT_VACE_ID,
  BUILTIN_I2V_PRESET,
  BUILTIN_VACE_PRESET,
} from '../MotionControl.constants';
import type {
  GenerationTypeMode,
  MotionPresetMetadata,
  MotionPresetOption,
  PhasePresetSelection,
} from '../MotionControl.types';

interface UseMotionControlPresetStateParams {
  generationTypeMode: GenerationTypeMode;
  featuredPresetIds: string[];
  selectedPhasePresetId?: string | null;
  onPhasePresetSelect: (presetId: string, config: PhaseConfig, presetMetadata?: PresetMetadata) => void;
  onPhasePresetRemove: () => void;
  motionMode: 'basic' | 'advanced';
  settingsLoading?: boolean;
  autoSelectDefaultPreset?: boolean;
  onMotionModeChange: (mode: 'basic' | 'advanced') => void;
}

function parsePresetMetadata(rawMetadata: unknown): MotionPresetMetadata | null {
  if (!rawMetadata || typeof rawMetadata !== 'object' || Array.isArray(rawMetadata)) {
    return null;
  }

  const metadata = rawMetadata as {
    name?: unknown;
    description?: unknown;
    phaseConfig?: unknown;
    phase_config?: unknown;
    sample_generations?: unknown;
  };

  const phaseConfig = metadata.phaseConfig ?? metadata.phase_config;
  if (!phaseConfig || typeof phaseConfig !== 'object' || Array.isArray(phaseConfig)) {
    return null;
  }

  return {
    name: typeof metadata.name === 'string' ? metadata.name : 'Preset',
    description: typeof metadata.description === 'string' ? metadata.description : '',
    phaseConfig: phaseConfig as PhaseConfig,
    sample_generations: Array.isArray(metadata.sample_generations)
      ? (metadata.sample_generations as PresetSampleGeneration[])
      : undefined,
  };
}

function resolvePresetConfig(preset: PhasePresetSelection): PhaseConfig | null {
  const metadata = preset.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const phaseConfig = metadata.phaseConfig ?? metadata.phase_config;
  if (!phaseConfig || typeof phaseConfig !== 'object' || Array.isArray(phaseConfig)) {
    return null;
  }

  return phaseConfig;
}

export function useMotionControlPresetState({
  generationTypeMode,
  featuredPresetIds,
  selectedPhasePresetId,
  onPhasePresetSelect,
  onPhasePresetRemove,
  motionMode,
  settingsLoading,
  autoSelectDefaultPreset = true,
  onMotionModeChange,
}: UseMotionControlPresetStateParams) {
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);

  const builtinDefaultPreset = useMemo(
    () => (generationTypeMode === 'vace' ? BUILTIN_VACE_PRESET : BUILTIN_I2V_PRESET),
    [generationTypeMode],
  );

  const builtinDefaultId = useMemo(
    () => (generationTypeMode === 'vace' ? BUILTIN_DEFAULT_VACE_ID : BUILTIN_DEFAULT_I2V_ID),
    [generationTypeMode],
  );

  const displaySelectedPhasePresetId = selectedPhasePresetId
    ?? (autoSelectDefaultPreset === false && motionMode === 'basic' ? builtinDefaultPreset.id : null);
  const isCustomConfig = !displaySelectedPhasePresetId;

  const { data: additionalPresets } = useQuery({
    queryKey: presetQueryKeys.featured(featuredPresetIds),
    queryFn: async () => {
      if (featuredPresetIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase()
        .from('resources')
        .select('*')
        .in('id', featuredPresetIds);

      if (error) {
        console.error('[MotionControl] Error fetching featured presets:', error);
        return [];
      }

      return featuredPresetIds
        .map((id) => data?.find((preset) => preset.id === id))
        .filter(Boolean);
    },
    enabled: featuredPresetIds.length > 0,
    staleTime: 60000,
    placeholderData: (previous) => previous,
  });

  const allPresets = useMemo(() => {
    const combinedPresets: MotionPresetOption[] = [builtinDefaultPreset];

    if (additionalPresets && additionalPresets.length > 0) {
      additionalPresets.forEach((preset) => {
        if (!preset) {
          return;
        }

        const parsedMetadata = parsePresetMetadata(preset.metadata);
        if (!parsedMetadata) {
          return;
        }

        combinedPresets.push({
          id: preset.id,
          metadata: parsedMetadata,
        });
      });
    }

    return combinedPresets;
  }, [additionalPresets, builtinDefaultPreset]);

  const allKnownPresetIds = useMemo(
    () => [BUILTIN_DEFAULT_I2V_ID, BUILTIN_DEFAULT_VACE_ID, ...featuredPresetIds],
    [featuredPresetIds],
  );

  const isSelectedPresetKnown = useMemo(() => {
    if (!selectedPhasePresetId) {
      return true;
    }
    return allKnownPresetIds.includes(selectedPhasePresetId);
  }, [allKnownPresetIds, selectedPhasePresetId]);

  usePresetAutoSelect({
    builtinDefaultPreset,
    selectedPhasePresetId,
    onPhasePresetSelect,
    settingsLoading,
    motionMode,
    enabled: autoSelectDefaultPreset,
  });

  const openPresetModal = useCallback(() => {
    setIsPresetModalOpen(true);
  }, []);

  const closePresetModal = useCallback(() => {
    setIsPresetModalOpen(false);
  }, []);

  const handleSwitchToAdvanced = useCallback(() => {
    onMotionModeChange('advanced');
  }, [onMotionModeChange]);

  const handleCustomClick = useCallback(() => {
    onPhasePresetRemove();
    onMotionModeChange('advanced');
  }, [onPhasePresetRemove, onMotionModeChange]);

  const handlePresetSelect = useCallback(
    (preset: PhasePresetSelection) => {
      const selectedConfig = resolvePresetConfig(preset);
      if (selectedConfig) {
        onPhasePresetSelect(preset.id, selectedConfig, (preset.metadata ?? undefined) as PresetMetadata);
      }
      setIsPresetModalOpen(false);
    },
    [onPhasePresetSelect],
  );

  return {
    isPresetModalOpen,
    openPresetModal,
    closePresetModal,
    allPresets,
    builtinDefaultId,
    isCustomConfig,
    displaySelectedPhasePresetId,
    isSelectedPresetKnown,
    handleSwitchToAdvanced,
    handleCustomClick,
    handlePresetSelect,
  };
}
