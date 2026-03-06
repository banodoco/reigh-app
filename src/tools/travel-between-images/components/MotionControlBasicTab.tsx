import React from 'react';
import { Info, Library, Settings } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Switch } from '@/shared/components/ui/switch';
import { Label } from '@/shared/components/ui/primitives/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import { ActiveLoRAsDisplay } from '@/shared/components/lora/ActiveLoRAsDisplay';
import { SelectedPresetCard } from './SelectedPresetCard';
import type { LoraModel } from '@/domains/lora/components/LoraSelectorModal';
import type { PresetSampleGeneration } from '@/shared/types/presetMetadata';
import type { ActiveLora } from '@/domains/lora/types/lora';
import type { PhaseConfig } from '../settings';
import type {
  GenerationTypeMode,
  MotionPresetOption,
} from './MotionControl.types';

interface MotionControlBasicTabProps {
  generationTypeMode: GenerationTypeMode;
  smoothContinuations?: boolean;
  onSmoothContinuationsChange?: (value: boolean) => void;
  isSelectedPresetKnown: boolean;
  allPresets: MotionPresetOption[];
  isCustomConfig: boolean;
  selectedPhasePresetId?: string | null;
  builtinDefaultId: string;
  onPresetSelect: (preset: MotionPresetOption) => void;
  onCustomClick: () => void;
  onOpenPresetModal: () => void;
  phaseConfig?: PhaseConfig;
  onSwitchToAdvanced: () => void;
  onPhasePresetRemove: () => void;
  onAddLoraClick: () => void;
  selectedLoras: ActiveLora[];
  onRemoveLora: (loraId: string) => void;
  onLoraStrengthChange: (loraId: string, strength: number) => void;
  availableLoras: LoraModel[];
  onAddTriggerWord?: (trigger: string) => void;
  renderLoraHeaderActions?: () => React.ReactNode;
}

export const MotionControlBasicTab: React.FC<MotionControlBasicTabProps> = ({
  generationTypeMode,
  smoothContinuations,
  onSmoothContinuationsChange,
  isSelectedPresetKnown,
  allPresets,
  isCustomConfig,
  selectedPhasePresetId,
  builtinDefaultId,
  onPresetSelect,
  onCustomClick,
  onOpenPresetModal,
  phaseConfig,
  onSwitchToAdvanced,
  onPhasePresetRemove,
  onAddLoraClick,
  selectedLoras,
  onRemoveLora,
  onLoraStrengthChange,
  availableLoras,
  onAddTriggerWord,
  renderLoraHeaderActions,
}) => {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {isSelectedPresetKnown ? (
          <div className="space-y-3">
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
                    <p>
                      Select a motion preset to control how your video moves.
                      <br />
                      Model type (I2V/VACE) is auto-determined by structure video.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenPresetModal}
                className="gap-1 text-xs h-7"
              >
                <Library className="h-3.5 w-3.5" />
                Browse Presets
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {allPresets.map((preset) => {
                const isSelected = !isCustomConfig && selectedPhasePresetId === preset.id;
                const isBuiltinDefault = preset.id === builtinDefaultId;
                const sampleVideo = preset.metadata.sample_generations?.find(
                  (generation: PresetSampleGeneration) => generation.type === 'video',
                );

                return (
                  <button
                    key={preset.id}
                    onClick={() => onPresetSelect(preset)}
                    className={
                      `relative group flex items-center gap-2 px-3 py-2 rounded-lg border ` +
                      (isSelected
                        ? 'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/30'
                        : isBuiltinDefault
                          ? 'bg-muted border-primary/30 hover:border-primary/50 hover:bg-muted/80'
                          : 'bg-muted/50 border-border hover:border-primary/50 hover:bg-muted')
                    }
                  >
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
                          {preset.metadata.name || 'Preset'}{' '}
                          <span className="font-normal text-muted-foreground">(default)</span>
                        </span>
                      ) : (
                        <span className="text-sm font-medium truncate preserve-case">
                          {preset.metadata.name || 'Preset'}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              <button
                onClick={onCustomClick}
                className={
                  `relative group flex items-center gap-2 px-3 py-2 rounded-lg border ` +
                  (isCustomConfig
                    ? 'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/30'
                    : 'bg-muted/50 border-border hover:border-primary/50 hover:bg-muted')
                }
              >
                <Settings className="h-4 w-4" />
                <span className="text-sm font-medium">Custom</span>
              </button>
            </div>
          </div>
        ) : (
          <SelectedPresetCard
            presetId={selectedPhasePresetId!}
            phaseConfig={phaseConfig}
            onSwitchToAdvanced={onSwitchToAdvanced}
            onChangePreset={onOpenPresetModal}
            onRemovePreset={onPhasePresetRemove}
          />
        )}
      </div>

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
                <p>
                  Enable smoother transitions between video segments.
                  <br />
                  Max duration is reduced to 77 frames when enabled.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

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
    </div>
  );
};
