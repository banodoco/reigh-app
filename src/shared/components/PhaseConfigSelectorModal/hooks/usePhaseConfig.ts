import React, { useState, useCallback, useEffect } from 'react';
import { PhaseConfig, DEFAULT_PHASE_CONFIG } from '@/tools/travel-between-images/settings';
import { Resource, PhaseConfigMetadata } from '@/shared/hooks/useResources';

interface UsePhaseConfigOptions {
  editingPreset: (Resource & { metadata: PhaseConfigMetadata }) | null;
  isOverwriting: boolean;
  currentPhaseConfig?: PhaseConfig;
  initialGenerationTypeMode: 'i2v' | 'vace';
}

export function usePhaseConfig({
  editingPreset,
  isOverwriting,
  currentPhaseConfig,
  initialGenerationTypeMode,
}: UsePhaseConfigOptions) {
  const [editablePhaseConfig, setEditablePhaseConfig] = useState<PhaseConfig>(() => {
    if (editingPreset?.metadata?.phaseConfig && !isOverwriting) {
      return editingPreset.metadata.phaseConfig;
    }
    return currentPhaseConfig || DEFAULT_PHASE_CONFIG;
  });

  const [generationTypeMode, setGenerationTypeMode] = useState<'i2v' | 'vace'>(() => {
    if (editingPreset?.metadata?.generationTypeMode && !isOverwriting) {
      return editingPreset.metadata.generationTypeMode;
    }
    return initialGenerationTypeMode;
  });

  // Phase labels based on number of phases
  const phaseLabels2 = ["High Noise Sampler", "Low Noise Sampler"];
  const phaseLabels3 = ["High Noise Sampler 1", "High Noise Sampler 2", "Low Noise Sampler"];
  const phaseLabels = editablePhaseConfig.num_phases === 2 ? phaseLabels2 : phaseLabels3;

  // Phase config update helpers
  const updatePhaseConfig = useCallback(<K extends keyof PhaseConfig>(field: K, value: PhaseConfig[K]) => {
    setEditablePhaseConfig(prev => ({ ...prev, [field]: value }));
  }, []);

  const updatePhase = useCallback((phaseIdx: number, updates: Partial<PhaseConfig['phases'][0]>) => {
    setEditablePhaseConfig(prev => ({
      ...prev,
      phases: prev.phases.map((p, i) => i === phaseIdx ? { ...p, ...updates } : p)
    }));
  }, []);

  const updatePhaseLora = useCallback((phaseIdx: number, loraIdx: number, updates: Partial<{ url: string; multiplier: string }>) => {
    setEditablePhaseConfig(prev => ({
      ...prev,
      phases: prev.phases.map((p, i) => {
        if (i !== phaseIdx) return p;
        return {
          ...p,
          loras: p.loras.map((l, j) => j === loraIdx ? { ...l, ...updates } : l)
        };
      })
    }));
  }, []);

  const addLoraToPhase = useCallback((phaseIdx: number, url: string = '', multiplier: string = '1.0') => {
    setEditablePhaseConfig(prev => ({
      ...prev,
      phases: prev.phases.map((p, i) => {
        if (i !== phaseIdx) return p;
        return { ...p, loras: [...p.loras.filter(l => l.url?.trim()), { url, multiplier }] };
      })
    }));
  }, []);

  const removeLoraFromPhase = useCallback((phaseIdx: number, loraIdx: number) => {
    setEditablePhaseConfig(prev => ({
      ...prev,
      phases: prev.phases.map((p, i) => {
        if (i !== phaseIdx) return p;
        return { ...p, loras: p.loras.filter((_, j) => j !== loraIdx) };
      })
    }));
  }, []);

  const resetPhaseConfig = useCallback(() => {
    setEditablePhaseConfig(currentPhaseConfig || DEFAULT_PHASE_CONFIG);
    setGenerationTypeMode(initialGenerationTypeMode);
  }, [currentPhaseConfig, initialGenerationTypeMode]);

  // Update editable phase config when editing preset changes or mode changes
  useEffect(() => {
    if (editingPreset?.metadata?.phaseConfig) {
      if (!isOverwriting) {
        setEditablePhaseConfig(editingPreset.metadata.phaseConfig);
        if (editingPreset.metadata.generationTypeMode) {
          setGenerationTypeMode(editingPreset.metadata.generationTypeMode);
        }
      } else {
        setEditablePhaseConfig(currentPhaseConfig || DEFAULT_PHASE_CONFIG);
        setGenerationTypeMode(initialGenerationTypeMode);
      }
    } else if (currentPhaseConfig) {
      setEditablePhaseConfig(currentPhaseConfig);
    } else {
      setEditablePhaseConfig(DEFAULT_PHASE_CONFIG);
    }
  }, [editingPreset, isOverwriting, currentPhaseConfig, initialGenerationTypeMode]);

  return {
    editablePhaseConfig,
    setEditablePhaseConfig,
    generationTypeMode,
    setGenerationTypeMode,
    phaseLabels,
    updatePhaseConfig,
    updatePhase,
    updatePhaseLora,
    addLoraToPhase,
    removeLoraFromPhase,
    resetPhaseConfig,
  };
}

export default usePhaseConfig;
