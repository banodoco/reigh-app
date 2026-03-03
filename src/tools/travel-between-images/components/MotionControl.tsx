import React, { useCallback, useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Label } from '@/shared/components/ui/primitives/label';
import { Button } from '@/shared/components/ui/button';
import { Switch } from '@/shared/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Info, Library, Settings } from 'lucide-react';
import { PhaseConfig, DEFAULT_PHASE_CONFIG, DEFAULT_VACE_PHASE_CONFIG } from '../settings';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { ActiveLoRAsDisplay } from '@/features/lora/components/ActiveLoRAsDisplay';
import type { ActiveLora } from '@/shared/types/lora';
import { PhaseConfigVertical } from '@/shared/components/PhaseConfigSelectorModal/PhaseConfigVertical';
import { PhaseConfigSelectorModal } from '@/shared/components/PhaseConfigSelectorModal';
import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { presetQueryKeys } from '@/shared/lib/queryKeys/presets';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import type { PresetMetadata, PresetSampleGeneration } from '@/shared/types/presetMetadata';
import { usePresetAutoSelect } from '../hooks/settings/usePresetAutoSelect';
import { SelectedPresetCard } from './SelectedPresetCard';

// =============================================================================
// BUILT-IN DEFAULT PRESETS (always shown, no DB lookup)
// =============================================================================

// Special IDs for built-in presets (not database IDs)
export const BUILTIN_DEFAULT_I2V_ID = '__builtin_default_i2v__';
export const BUILTIN_DEFAULT_VACE_ID = '__builtin_default_vace__';

// Built-in default preset for I2V mode
const BUILTIN_I2V_PRESET = {
  id: BUILTIN_DEFAULT_I2V_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard I2V generation',
    phaseConfig: DEFAULT_PHASE_CONFIG,
  }
};

// Built-in default preset for VACE mode
const BUILTIN_VACE_PRESET = {
  id: BUILTIN_DEFAULT_VACE_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard VACE generation with structure video',
    phaseConfig: DEFAULT_VACE_PHASE_CONFIG,
  }
};

// =============================================================================
// ADDITIONAL FEATURED PRESETS (optional, from database)
// =============================================================================

// Featured preset IDs from database - shown after built-in default
export const FEATURED_PRESET_IDS: string[] = [
  'e1aad8bf-add9-4d7b-883b-d67d424028c4',
  '18b879a5-1251-41dc-b263-613358ced541',
];

type GenerationTypeMode = 'i2v' | 'vace';
interface MotionControlModeProps {
  motionMode: 'basic' | 'advanced';
  onMotionModeChange: (mode: 'basic' | 'advanced') => void;
  generationTypeMode?: GenerationTypeMode;
  onGenerationTypeModeChange?: (mode: GenerationTypeMode) => void;
  hasStructureVideo?: boolean;
}

interface MotionControlLoraProps {
  selectedLoras: ActiveLora[];
  availableLoras: LoraModel[];
  onAddLoraClick: () => void;
  onRemoveLora: (loraId: string) => void;
  onLoraStrengthChange: (loraId: string, strength: number) => void;
  onAddTriggerWord?: (trigger: string) => void;
  renderLoraHeaderActions?: () => React.ReactNode;
}

interface MotionControlPresetProps {
  selectedPhasePresetId?: string | null;
  onPhasePresetSelect: (presetId: string, config: PhaseConfig, presetMetadata?: PresetMetadata) => void;
  onPhasePresetRemove: () => void;
  currentSettings: {
    textBeforePrompts?: string;
    textAfterPrompts?: string;
    basePrompt?: string;
    negativePrompt?: string;
    enhancePrompt?: boolean;
    durationFrames?: number;
    lastGeneratedVideoUrl?: string;
    selectedLoras?: Array<{ id: string; name: string; strength: number }>;
  };
  featuredPresetIds?: string[];
}

interface MotionControlAdvancedProps {
  phaseConfig?: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onBlurSave?: () => void;
  randomSeed: boolean;
  onRandomSeedChange: (value: boolean) => void;
  onRestoreDefaults?: () => void;
}

interface MotionControlStateOverrides {
  turboMode?: boolean;
  settingsLoading?: boolean;
  smoothContinuations?: boolean;
  onSmoothContinuationsChange?: (value: boolean) => void;
}

interface MotionControlProps {
  mode: MotionControlModeProps;
  lora: MotionControlLoraProps;
  presets: MotionControlPresetProps;
  advanced: MotionControlAdvancedProps;
  stateOverrides?: MotionControlStateOverrides;
}

export const MotionControl: React.FC<MotionControlProps> = ({
  mode,
  lora,
  presets,
  advanced,
  stateOverrides,
}) => {
  const {
    motionMode,
    onMotionModeChange,
    generationTypeMode = 'i2v',
    hasStructureVideo = false,
  } = mode;
  const {
    selectedLoras,
    availableLoras,
    onAddLoraClick,
    onRemoveLora,
    onLoraStrengthChange,
    onAddTriggerWord,
    renderLoraHeaderActions,
  } = lora;
  const {
    selectedPhasePresetId,
    onPhasePresetSelect,
    onPhasePresetRemove,
    currentSettings,
    featuredPresetIds = FEATURED_PRESET_IDS,
  } = presets;
  const {
    phaseConfig,
    onPhaseConfigChange,
    onBlurSave,
    randomSeed,
    onRandomSeedChange,
    onRestoreDefaults,
  } = advanced;
  const {
    turboMode,
    settingsLoading,
    smoothContinuations,
    onSmoothContinuationsChange,
  } = stateOverrides ?? {};
  // State for preset modal
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);

  // Custom mode = no preset selected (selectedPhasePresetId is null/undefined)
  const isCustomConfig = !selectedPhasePresetId;

  // Get the built-in default preset for the current mode (I2V vs VACE)
  // Use generationTypeMode instead of hasStructureVideo because Uni3C has structure video but uses I2V
  const builtinDefaultPreset = useMemo(() => {
    return generationTypeMode === 'vace' ? BUILTIN_VACE_PRESET : BUILTIN_I2V_PRESET;
  }, [generationTypeMode]);

  const builtinDefaultId = useMemo(() => {
    return generationTypeMode === 'vace' ? BUILTIN_DEFAULT_VACE_ID : BUILTIN_DEFAULT_I2V_ID;
  }, [generationTypeMode]);

  // Fetch additional featured presets from database (optional)
  const { data: additionalPresets } = useQuery({
    queryKey: presetQueryKeys.featured(featuredPresetIds),
    queryFn: async () => {
      if (!featuredPresetIds || featuredPresetIds.length === 0) return [];
      
      const { data, error } = await supabase().from('resources')
        .select('*')
        .in('id', featuredPresetIds);
      
      if (error) {
        console.error('[MotionControl] Error fetching featured presets:', error);
        return [];
      }
      
      // Sort by the order in featuredPresetIds
      const sorted = featuredPresetIds
        .map(id => data?.find(p => p.id === id))
        .filter(Boolean);
      
      return sorted;
    },
    enabled: featuredPresetIds.length > 0,
    staleTime: 60000, // Cache for 1 minute
    placeholderData: (prev) => prev, // Keep previous data during refetches to prevent flicker
  });

  // Combine built-in default (first) + additional presets from database
  const allPresets = useMemo(() => {
    const presets: Array<{ id: string; metadata: { name: string; description: string; phaseConfig: PhaseConfig; sample_generations?: PresetSampleGeneration[] } }> = [builtinDefaultPreset];
    if (additionalPresets && additionalPresets.length > 0) {
      const normalizedAdditional: Array<{ id: string; metadata: { name: string; description: string; phaseConfig: PhaseConfig; sample_generations?: PresetSampleGeneration[] } }> = [];
      additionalPresets.forEach((preset) => {
        if (!preset) return;

        const metadata = preset.metadata;
        if (!metadata || typeof metadata !== 'object') return;

        const parsed = metadata as {
          name?: unknown;
          description?: unknown;
          phaseConfig?: unknown;
          sample_generations?: unknown;
        };
        if (!parsed.phaseConfig || typeof parsed.phaseConfig !== 'object') return;

        normalizedAdditional.push({
          id: preset.id,
          metadata: {
            name: typeof parsed.name === 'string' ? parsed.name : 'Preset',
            description: typeof parsed.description === 'string' ? parsed.description : '',
            phaseConfig: parsed.phaseConfig as PhaseConfig,
            sample_generations: Array.isArray(parsed.sample_generations)
              ? parsed.sample_generations as PresetSampleGeneration[]
              : undefined,
          },
        });
      });

      presets.push(...normalizedAdditional);
    }
    return presets;
  }, [builtinDefaultPreset, additionalPresets]);

  // All known preset IDs (for determining if we show chips or SelectedPresetCard)
  // Include BOTH builtin IDs to handle race conditions when hasStructureVideo changes
  const allKnownPresetIds = useMemo(() => {
    return [BUILTIN_DEFAULT_I2V_ID, BUILTIN_DEFAULT_VACE_ID, ...featuredPresetIds];
  }, [featuredPresetIds]);

  // Check if selected preset is one of the known ones (built-in or featured)
  const isSelectedPresetKnown = useMemo(() => {
    if (!selectedPhasePresetId) return true; // No selection = show chips
    return allKnownPresetIds.includes(selectedPhasePresetId);
  }, [selectedPhasePresetId, allKnownPresetIds]);

  // Auto-select the appropriate built-in default preset on mount and mode changes
  usePresetAutoSelect({
    generationTypeMode,
    hasStructureVideo,
    builtinDefaultPreset,
    selectedPhasePresetId,
    onPhasePresetSelect,
    settingsLoading,
    motionMode,
    phaseConfig,
  });

  // Handle mode change with validation
  // Parent keeps motionMode and advancedMode in sync, so we just call onMotionModeChange
  const handleModeChange = useCallback((newMode: string) => {
    // GUARD: Ignore if the mode hasn't actually changed
    // This prevents spurious calls from Tabs on mount/remount
    if (newMode === motionMode) {
      return;
    }
    
    // Prevent switching to advanced when turbo mode is active
    if (turboMode && newMode === 'advanced') {
      return;
    }
    
    onMotionModeChange(newMode as 'basic' | 'advanced');
  }, [turboMode, onMotionModeChange, motionMode]);

  // Handle switch to advanced for editing preset
  const handleSwitchToAdvanced = useCallback(() => {
    onMotionModeChange('advanced');
  }, [onMotionModeChange]);

  // Handle clicking Custom chip - clears preset and goes to advanced
  const handleCustomClick = useCallback(() => {
    onPhasePresetRemove(); // Clear preset → isCustomConfig becomes true
    onMotionModeChange('advanced');
  }, [onPhasePresetRemove, onMotionModeChange]);

  // Handle preset selection from chips or modal
  const handlePresetSelect = useCallback((preset: { id: string; metadata?: { phaseConfig?: PhaseConfig } }) => {
    if (preset.metadata?.phaseConfig) {
      onPhasePresetSelect(preset.id, preset.metadata.phaseConfig, preset.metadata);
    }
    setIsPresetModalOpen(false);
  }, [onPhasePresetSelect]);

  return (
    <div className="space-y-4">
      <Tabs value={motionMode} onValueChange={handleModeChange}>
        <div className="flex items-center gap-3 mb-3">
          <Label className="text-sm font-medium">Mode:</Label>
          <TabsList className="grid w-40 grid-cols-2">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="advanced" disabled={turboMode}>
              Advanced
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Basic Mode: Preset Chips + LoRAs */}
        <TabsContent value="basic" className="space-y-4 mt-0">
          {/* Preset Selection Section */}
          <div className="space-y-3">
            {/* Show preset chips OR selected non-known preset card */}
            {isSelectedPresetKnown ? (
              // Preset Chips: Built-in + Featured + Custom
              <div className="space-y-3">
                {/* Header with label, tooltip, and Browse button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">Motion Preset:</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
                          <Info className="h-4 w-4" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Select a motion preset to control how your video moves.<br />
                        Model type (I2V/VACE) is auto-determined by structure video.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsPresetModalOpen(true)}
                    className="gap-1 text-xs h-7"
                  >
                    <Library className="h-3.5 w-3.5" />
                    Browse Presets
                  </Button>
                </div>

                {/* Preset chips */}
                <div className="flex flex-wrap gap-2">
                  {/* Built-in + additional presets */}
                  {allPresets.map((preset) => {
                    // When custom mode, no preset is selected
                    const isSelected = !isCustomConfig && selectedPhasePresetId === preset.id;
                    const isBuiltinDefault = preset.id === builtinDefaultId;
                    const metadata = preset.metadata;
                    const sampleVideo = metadata?.sample_generations?.find((g: PresetSampleGeneration) => g.type === 'video');
                    
                    return (
                      <button
                        key={preset.id}
                        onClick={() => handlePresetSelect(preset)}
                        className={`
                          relative group flex items-center gap-2 px-3 py-2 rounded-lg border
                          ${isSelected 
                            ? 'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/30' 
                            : isBuiltinDefault
                              ? 'bg-muted border-primary/30 hover:border-primary/50 hover:bg-muted/80'
                              : 'bg-muted/50 border-border hover:border-primary/50 hover:bg-muted'
                          }
                        `}
                      >
                        {/* Thumbnail */}
                        {sampleVideo && (
                          <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
                            <HoverScrubVideo
                              src={sampleVideo.url}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex min-w-0 flex-col items-start">
                          {isBuiltinDefault ? (
                            <span className="text-sm font-medium whitespace-nowrap preserve-case">
                              {metadata?.name || 'Preset'}{' '}
                              <span className="font-normal text-muted-foreground">(default)</span>
                            </span>
                          ) : (
                            <span className="text-sm font-medium truncate preserve-case">
                              {metadata?.name || 'Preset'}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  
                  {/* Custom chip - explicitly goes to custom mode (clears preset) */}
                  <button
                    onClick={handleCustomClick}
                    className={`
                      relative group flex items-center gap-2 px-3 py-2 rounded-lg border
                      ${isCustomConfig
                        ? 'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/30' 
                        : 'bg-muted/50 border-border hover:border-primary/50 hover:bg-muted'
                      }
                    `}
                  >
                    <Settings className="h-4 w-4" />
                    <span className="text-sm font-medium">Custom</span>
                  </button>
                </div>
              </div>
            ) : (
              // Non-known preset selected (from Browse) - show selected preset card
              <SelectedPresetCard
                presetId={selectedPhasePresetId!}
                phaseConfig={phaseConfig}
                onSwitchToAdvanced={handleSwitchToAdvanced}
                onChangePreset={() => setIsPresetModalOpen(true)}
                onRemovePreset={onPhasePresetRemove}
              />
            )}
          </div>

          {/* Smooth Continuations Toggle - Only shown for VACE mode */}
          {generationTypeMode === 'vace' && (
            <div className="flex items-center gap-x-2 p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
              <Switch
                id="smooth-continuations"
                checked={smoothContinuations || false}
                onCheckedChange={(checked) => onSmoothContinuationsChange?.(checked)}
              />
              <div className="flex-1 flex items-center gap-2">
                <Label htmlFor="smooth-continuations" className="font-medium">
                  Smooth Continuations
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
                      <Info className="h-4 w-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Enable smoother transitions between video segments.<br />
                    Max duration is reduced to 77 frames when enabled.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}

          {/* LoRA Controls */}
          <div className="space-y-4 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              className="w-full" 
              onClick={onAddLoraClick}
            >
              Add or manage LoRAs
            </Button>
            
            <ActiveLoRAsDisplay
              selectedLoras={selectedLoras}
              onRemoveLora={onRemoveLora}
              onLoraStrengthChange={onLoraStrengthChange}
              availableLoras={availableLoras}
              className="mt-4"
              onAddTriggerWord={onAddTriggerWord}
              renderHeaderActions={renderLoraHeaderActions}
            />
          </div>
        </TabsContent>

        {/* Advanced Mode: Phase Configuration */}
        <TabsContent value="advanced" className="mt-4">
          {phaseConfig ? (
            <PhaseConfigVertical
              phaseConfig={phaseConfig}
              onPhaseConfigChange={onPhaseConfigChange}
              onBlurSave={onBlurSave}
              randomSeed={randomSeed}
              onRandomSeedChange={onRandomSeedChange}
              availableLoras={availableLoras}
              selectedPhasePresetId={selectedPhasePresetId}
              onPhasePresetSelect={onPhasePresetSelect}
              onPhasePresetRemove={onPhasePresetRemove}
              currentSettings={currentSettings}
              generationTypeMode={generationTypeMode}
              onRestoreDefaults={onRestoreDefaults}
            />
          ) : (
            <div className="text-sm text-muted-foreground p-4">
              No phase configuration available. Please enable advanced mode.
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Phase Config Selector Modal */}
      <PhaseConfigSelectorModal
        isOpen={isPresetModalOpen}
        onClose={() => setIsPresetModalOpen(false)}
        onSelectPreset={handlePresetSelect}
        onRemovePreset={onPhasePresetRemove}
        selectedPresetId={selectedPhasePresetId || null}
        currentPhaseConfig={phaseConfig}
        currentSettings={currentSettings}
      />
    </div>
  );
};
