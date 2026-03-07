import React from 'react';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Label } from '@/shared/components/ui/primitives/label';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Info } from 'lucide-react';
import { computePhaseTransition } from '../PhaseConfigVertical.helpers';
import type { PhaseGlobalSettingsProps } from '../types';

export const PhaseGlobalSettingsCard: React.FC<PhaseGlobalSettingsProps> = ({
  phaseConfig,
  onPhaseConfigChange,
  randomSeed,
  onRandomSeedChange,
}) => {
  return (
    <Card className="bg-muted/20 relative">
      <div className="absolute top-3 left-3 z-10">
        <span className="text-sm font-medium border border-border rounded-md px-2 py-1 bg-background/50">
          Global Settings
        </span>
      </div>

      <CardContent className="pt-12 px-4 pb-4">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <Label htmlFor="num_phases" className="text-sm font-light block mb-1.5">
                Number of Phases:
              </Label>
              <RadioGroup
                value={String(phaseConfig.num_phases)}
                onValueChange={(value) => {
                  const newNumPhases = parseInt(value, 10);
                  const { phases, steps } = computePhaseTransition(phaseConfig, newNumPhases);
                  onPhaseConfigChange({
                    ...phaseConfig,
                    num_phases: newNumPhases,
                    phases,
                    steps_per_phase: steps,
                    model_switch_phase: newNumPhases === 2 ? 1 : phaseConfig.model_switch_phase,
                  });
                }}
                className="flex flex-row gap-4"
              >
                <div className="flex items-center gap-x-2">
                  <RadioGroupItem value="2" id="phases-2" />
                  <Label htmlFor="phases-2" className="text-sm">2</Label>
                </div>
                <div className="flex items-center gap-x-2">
                  <RadioGroupItem value="3" id="phases-3" />
                  <Label htmlFor="phases-3" className="text-sm">3</Label>
                </div>
              </RadioGroup>
            </div>

            <div>
              <Label htmlFor="sample_solver" className="text-sm font-light block mb-1.5">
                Sample Solver:
              </Label>
              <RadioGroup
                value={phaseConfig.sample_solver}
                onValueChange={(value) => onPhaseConfigChange({ ...phaseConfig, sample_solver: value })}
                className="flex flex-row gap-4"
              >
                <div className="flex items-center gap-x-2">
                  <RadioGroupItem value="euler" id="euler" />
                  <Label htmlFor="euler" className="text-sm">Euler</Label>
                </div>
                <div className="flex items-center gap-x-2">
                  <RadioGroupItem value="unipc" id="unipc" />
                  <Label htmlFor="unipc" className="text-sm">UniPC</Label>
                </div>
                <div className="flex items-center gap-x-2">
                  <RadioGroupItem value="dpm++" id="dpm++" />
                  <Label htmlFor="dpm++" className="text-sm">DPM++</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="text-sm text-muted-foreground pt-1.5 border-t mt-1">
              Total Steps: {phaseConfig.steps_per_phase.reduce((accumulator, step) => accumulator + step, 0)}
            </div>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Label htmlFor="flow_shift" className="text-sm font-light block mb-1.5">
                Flow Shift: {phaseConfig.flow_shift}
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="absolute top-0 right-0 text-muted-foreground cursor-help hover:text-foreground transition-colors">
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Higher values emphasize motion (range: 1.0-10.0)</p>
                </TooltipContent>
              </Tooltip>
              <Slider
                id="flow_shift"
                min={1}
                max={10}
                step={0.1}
                value={phaseConfig.flow_shift}
                onValueChange={(value) =>
                  onPhaseConfigChange({
                    ...phaseConfig,
                    flow_shift: Array.isArray(value) ? (value[0] ?? phaseConfig.flow_shift) : value,
                  })
                }
              />
            </div>

            <div className="flex items-center gap-x-2">
              <Switch id="random-seed" checked={randomSeed} onCheckedChange={onRandomSeedChange} />
              <Label htmlFor="random-seed" className="text-sm">Random Seed:</Label>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
