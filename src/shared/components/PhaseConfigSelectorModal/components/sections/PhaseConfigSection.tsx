import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { Slider } from '@/shared/components/ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu';
import { Info, Trash2, RotateCcw, Search, Download } from 'lucide-react';
import { PhaseConfig } from '@/shared/types/phaseConfig';
import { LoraModel, LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { PREDEFINED_LORAS, getDisplayNameFromUrl } from '@/shared/lib/loraUtils';

interface PhaseConfigSectionProps {
  editablePhaseConfig: PhaseConfig;
  generationTypeMode: 'i2v' | 'vace';
  availableLoras: LoraModel[];
  onGenerationTypeModeChange: (value: 'i2v' | 'vace') => void;
  onResetToDefault: () => void;
  updatePhaseConfig: <K extends keyof PhaseConfig>(field: K, value: PhaseConfig[K]) => void;
  updatePhase: (phaseIdx: number, updates: Partial<PhaseConfig['phases'][0]>) => void;
  addLoraToPhase: (phaseIdx: number, url?: string, multiplier?: string) => void;
  removeLoraFromPhase: (phaseIdx: number, loraIdx: number) => void;
  updatePhaseLora: (phaseIdx: number, loraIdx: number, updates: Partial<{ url: string; multiplier: string }>) => void;
  setEditablePhaseConfig: React.Dispatch<React.SetStateAction<PhaseConfig>>;
}

export const PhaseConfigSection: React.FC<PhaseConfigSectionProps> = ({
  editablePhaseConfig,
  generationTypeMode,
  availableLoras,
  onGenerationTypeModeChange,
  onResetToDefault,
  updatePhaseConfig,
  updatePhase,
  addLoraToPhase,
  removeLoraFromPhase,
  updatePhaseLora,
  setEditablePhaseConfig,
}) => {
  // LoRA selector modal state
  const [activePhaseForLoraSelection, setActivePhaseForLoraSelection] = React.useState<number | null>(null);
  const [isLoraModalOpen, setIsLoraModalOpen] = React.useState(false);
  const [focusedLoraInput, setFocusedLoraInput] = React.useState<string | null>(null);

  // Phase labels based on number of phases
  const phaseLabels2 = ["High Noise Sampler", "Low Noise Sampler"];
  const phaseLabels3 = ["High Noise Sampler 1", "High Noise Sampler 2", "Low Noise Sampler"];
  const phaseLabels = editablePhaseConfig.num_phases === 2 ? phaseLabels2 : phaseLabels3;

  return (
    <div className="space-y-3 pt-2 border-t">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Phase Configuration</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={onResetToDefault}
          className="h-7 text-xs"
          type="button"
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset to Default
        </Button>
      </div>

      {/* Model Type Toggle (I2V vs VACE) */}
      <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-light">Model Type:</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
                  <Info className="h-4 w-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p><strong>I2V (Image-to-Video):</strong> Generate video from images only.<br />
                <strong>VACE:</strong> Use a structure/guidance video for motion control.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <RadioGroup
          value={generationTypeMode}
          onValueChange={(value) => onGenerationTypeModeChange(value as 'i2v' | 'vace')}
          className="flex flex-row gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="i2v" id="preset-gen-type-i2v" />
            <Label htmlFor="preset-gen-type-i2v" className="text-sm">I2V (Image-to-Video)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="vace" id="preset-gen-type-vace" />
            <Label htmlFor="preset-gen-type-vace" className="text-sm">VACE (Structure Video)</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Global Settings */}
      <Card className="bg-muted/20">
        <CardContent className="pt-4 px-4 pb-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">Global Settings</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Number of Phases */}
            <div className="space-y-1.5">
              <Label className="text-sm font-light">Number of Phases:</Label>
              <RadioGroup
                value={String(editablePhaseConfig.num_phases)}
                onValueChange={(value) => {
                  const newNumPhases = parseInt(value);
                  const currentPhases = editablePhaseConfig.phases || [];
                  const currentSteps = editablePhaseConfig.steps_per_phase || [];

                  let newPhases = currentPhases.slice(0, newNumPhases);
                  let newSteps = currentSteps.slice(0, newNumPhases);

                  while (newPhases.length < newNumPhases) {
                    newPhases.push({
                      phase: newPhases.length + 1,
                      guidance_scale: 1.0,
                      loras: []
                    });
                  }

                  while (newSteps.length < newNumPhases) {
                    newSteps.push(2);
                  }

                  setEditablePhaseConfig({
                    ...editablePhaseConfig,
                    num_phases: newNumPhases,
                    phases: newPhases,
                    steps_per_phase: newSteps,
                    model_switch_phase: newNumPhases === 2 ? 1 : editablePhaseConfig.model_switch_phase
                  });
                }}
                className="flex flex-row gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="2" id="preset-phases-2" />
                  <Label htmlFor="preset-phases-2" className="text-sm">2</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="3" id="preset-phases-3" />
                  <Label htmlFor="preset-phases-3" className="text-sm">3</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Sample Solver */}
            <div className="space-y-1.5">
              <Label className="text-sm font-light">Sample Solver:</Label>
              <RadioGroup
                value={editablePhaseConfig.sample_solver}
                onValueChange={(value) => updatePhaseConfig('sample_solver', value)}
                className="flex flex-row gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="euler" id="preset-euler" />
                  <Label htmlFor="preset-euler" className="text-sm">Euler</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="unipc" id="preset-unipc" />
                  <Label htmlFor="preset-unipc" className="text-sm">UniPC</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="dpm++" id="preset-dpm" />
                  <Label htmlFor="preset-dpm" className="text-sm">DPM++</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          {/* Flow Shift */}
          <div className="space-y-1.5 mt-4">
            <Label className="text-sm font-light">
              Flow Shift: {editablePhaseConfig.flow_shift}
            </Label>
            <Slider
              min={1}
              max={10}
              step={0.1}
              value={editablePhaseConfig.flow_shift}
              onValueChange={(value) => updatePhaseConfig('flow_shift', value)}
            />
          </div>

          {/* Total Steps Display */}
          <div className="text-sm text-muted-foreground pt-3 mt-3 border-t">
            Total Steps: {(editablePhaseConfig.steps_per_phase || []).reduce((a, b) => a + b, 0)}
          </div>
        </CardContent>
      </Card>

      {/* Per-Phase Settings */}
      {(editablePhaseConfig.phases || []).map((phase, phaseIdx) => (
        <Card key={phaseIdx} className="bg-muted/30">
          <CardContent className="pt-4 px-4 pb-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">
              {phaseLabels[phaseIdx] || `Phase ${phase.phase}`}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Left: Steps and Guidance */}
              <div className="space-y-3">
                {/* Steps */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-light">
                    Steps: {(editablePhaseConfig.steps_per_phase || [])[phaseIdx] ?? 2}
                  </Label>
                  <Slider
                    min={1}
                    max={15}
                    step={1}
                    value={(editablePhaseConfig.steps_per_phase || [])[phaseIdx] ?? 2}
                    onValueChange={(value) => {
                      const newSteps = [...(editablePhaseConfig.steps_per_phase || [])];
                      newSteps[phaseIdx] = value;
                      updatePhaseConfig('steps_per_phase', newSteps);
                    }}
                  />
                </div>

                {/* Guidance Scale */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-light">Guidance Scale:</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={phase.guidance_scale}
                    onChange={(e) => updatePhase(phaseIdx, { guidance_scale: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              {/* Right: LoRAs (spans 2 columns) */}
              <div className="sm:col-span-2">
                <Label className="text-sm font-medium mb-1.5 block">LoRAs:</Label>
                <div className="grid grid-cols-2 gap-2 mb-1.5 w-full">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setActivePhaseForLoraSelection(phaseIdx);
                      setIsLoraModalOpen(true);
                    }}
                    type="button"
                  >
                    <Search className="h-3 w-3 mr-1" /> Search
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                      >
                        <Download className="h-3 w-3 mr-1" /> Utility
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      {Object.entries(
                        PREDEFINED_LORAS.reduce((acc, lora) => {
                          if (!acc[lora.category]) acc[lora.category] = [];
                          acc[lora.category].push(lora);
                          return acc;
                        }, {} as Record<string, typeof PREDEFINED_LORAS>)
                      ).map(([category, loras], idx) => (
                        <React.Fragment key={category}>
                          {idx > 0 && <DropdownMenuSeparator />}
                          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                            {category}
                          </DropdownMenuLabel>
                          {loras.map((predefinedLora) => (
                            <DropdownMenuItem
                              key={predefinedLora.url}
                              onClick={() => addLoraToPhase(phaseIdx, predefinedLora.url, '1.0')}
                              className="text-xs preserve-case"
                            >
                              {predefinedLora.name}
                            </DropdownMenuItem>
                          ))}
                        </React.Fragment>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {phase.loras.map((lora, loraIdx) => {
                  const inputId = `preset-lora-${phaseIdx}-${loraIdx}`;
                  const isFocused = focusedLoraInput === inputId;
                  return (
                    <div key={loraIdx} className="flex items-center gap-2 mb-1.5">
                      <div className="relative flex-1 min-w-0">
                        <Input
                          placeholder="LoRA URL"
                          value={isFocused ? lora.url : getDisplayNameFromUrl(lora.url, availableLoras)}
                          onChange={(e) => updatePhaseLora(phaseIdx, loraIdx, { url: e.target.value })}
                          onFocus={() => setFocusedLoraInput(inputId)}
                          onBlur={() => setFocusedLoraInput(null)}
                          className="pr-8"
                          title={lora.url}
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => removeLoraFromPhase(phaseIdx, loraIdx)}
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <Input
                        type="number"
                        placeholder="Multiplier"
                        value={lora.multiplier}
                        min={0}
                        max={2}
                        step={0.1}
                        onChange={(e) => updatePhaseLora(phaseIdx, loraIdx, { multiplier: e.target.value })}
                        className="w-16 sm:w-20 flex-shrink-0 text-center"
                      />
                    </div>
                  );
                })}

                {/* Add LoRA button */}
                <button
                  onClick={() => addLoraToPhase(phaseIdx)}
                  className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer focus:outline-none"
                  type="button"
                >
                  + Add LoRA
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* LoRA Selector Modal */}
      <LoraSelectorModal
        isOpen={isLoraModalOpen}
        onClose={() => {
          setIsLoraModalOpen(false);
          setActivePhaseForLoraSelection(null);
        }}
        selectedLoras={[]}
        loras={availableLoras || []}
        onAddLora={(lora) => {
          if (activePhaseForLoraSelection !== null) {
            const loraUrl = (lora as LoraModel).huggingface_url || '';
            addLoraToPhase(activePhaseForLoraSelection, loraUrl, '1.0');
            setIsLoraModalOpen(false);
            setActivePhaseForLoraSelection(null);
          }
        }}
        onRemoveLora={() => {}}
        onUpdateLoraStrength={() => {}}
        lora_type="Wan 2.1 14b"
      />
    </div>
  );
};
