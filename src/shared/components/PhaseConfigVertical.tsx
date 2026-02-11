/**
 * PhaseConfigVertical
 *
 * A vertical layout component for configuring phase-based video generation settings.
 * Used by MotionPresetSelector and other components.
 *
 * Moved from tools/travel-between-images/components/PhaseConfigVertical.tsx
 * to shared/ because it's used by shared/components/MotionPresetSelector.
 *
 * Structure:
 * - PhaseConfigVertical (orchestrator): state, modals, header
 * - PhaseGlobalSettings: flow shift, random seed, solver, num phases
 * - PerPhaseCard: steps, guidance scale, LoRA list per phase
 */

import React, { useState, useCallback } from 'react';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Label } from '@/shared/components/ui/label';
import { Input } from '@/shared/components/ui/input';
import { NumberInput } from '@/shared/components/ui/number-input';
import { Button } from '@/shared/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { TextAction } from '@/shared/components/ui/text-action';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu';
import { Info, RotateCcw, Trash2, Download, Search, Save, Library, FilePlus, AlertTriangle } from 'lucide-react';
import { PhaseConfig, PhaseSettings, DEFAULT_PHASE_CONFIG } from '@/shared/types/phaseConfig';
import type { PresetMetadata } from '@/shared/types/presetMetadata';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { PhaseConfigSelectorModal } from '@/shared/components/PhaseConfigSelectorModal';
import { PREDEFINED_LORAS, getDisplayNameFromUrl } from '@/shared/lib/loraUtils';
import { validateHuggingFaceUrl } from '@/shared/components/LoraSelectorModal/utils/validation-utils';

// =============================================================================
// TYPES
// =============================================================================

interface PhaseConfigVerticalProps {
  phaseConfig: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onBlurSave?: () => void;
  randomSeed: boolean;
  onRandomSeedChange: (value: boolean) => void;
  availableLoras?: LoraModel[];
  selectedPhasePresetId?: string | null;
  onPhasePresetSelect?: (presetId: string, config: PhaseConfig, presetMetadata?: PresetMetadata) => void;
  onPhasePresetRemove?: () => void;
  currentSettings?: {
    textBeforePrompts?: string;
    textAfterPrompts?: string;
    basePrompt?: string;
    negativePrompt?: string;
    enhancePrompt?: boolean;
    durationFrames?: number;
    lastGeneratedVideoUrl?: string;
    selectedLoras?: Array<{ id: string; name: string; strength: number }>;
  };
  generationTypeMode?: 'i2v' | 'vace';
  onRestoreDefaults?: () => void;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Compute new phases/steps when switching between 2 and 3 phases */
function computePhaseTransition(
  phaseConfig: PhaseConfig,
  newNumPhases: number
): { phases: PhaseSettings[]; steps: number[] } {
  const currentPhases = phaseConfig.phases || [];
  const currentSteps = phaseConfig.steps_per_phase || [];
  const oldNumPhases = currentPhases.length;

  if (oldNumPhases === 2 && newNumPhases === 3) {
    // 2->3: phase 1 duplicates into phases 1+2, phase 2 moves to phase 3
    const phase1 = currentPhases[0] || { phase: 1, guidance_scale: 1.0, loras: [] };
    const phase2 = currentPhases[1] || { phase: 2, guidance_scale: 1.0, loras: [] };
    return {
      phases: [
        { ...phase1, phase: 1, loras: phase1.loras.map(l => ({ ...l })) },
        { ...phase1, phase: 2, loras: phase1.loras.map(l => ({ ...l })) },
        { ...phase2, phase: 3, loras: phase2.loras.map(l => ({ ...l })) },
      ],
      steps: [currentSteps[0] || 2, currentSteps[0] || 2, currentSteps[1] || 2],
    };
  }

  if (oldNumPhases === 3 && newNumPhases === 2) {
    // 3->2: phase 1 stays, phase 3 becomes phase 2, phase 2 is dropped
    const phase1 = currentPhases[0] || { phase: 1, guidance_scale: 1.0, loras: [] };
    const phase3 = currentPhases[2] || { phase: 3, guidance_scale: 1.0, loras: [] };
    return {
      phases: [
        { ...phase1, phase: 1, loras: phase1.loras.map(l => ({ ...l })) },
        { ...phase3, phase: 2, loras: phase3.loras.map(l => ({ ...l })) },
      ],
      steps: [currentSteps[0] || 2, currentSteps[2] || 2],
    };
  }

  // Fallback: slice/pad
  const newPhases = currentPhases.slice(0, newNumPhases);
  const newSteps = currentSteps.slice(0, newNumPhases);
  while (newPhases.length < newNumPhases) {
    newPhases.push({ phase: newPhases.length + 1, guidance_scale: 1.0, loras: [] });
  }
  while (newSteps.length < newNumPhases) {
    newSteps.push(2);
  }
  return { phases: newPhases, steps: newSteps };
}

const PHASE_LABELS_2 = ["High Noise Sampler", "Low Noise Sampler"];
const PHASE_LABELS_3 = ["High Noise Sampler 1", "High Noise Sampler 2", "Low Noise Sampler"];

// =============================================================================
// PhaseGlobalSettings
// =============================================================================

interface PhaseGlobalSettingsProps {
  phaseConfig: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  randomSeed: boolean;
  onRandomSeedChange: (value: boolean) => void;
}

const PhaseGlobalSettings: React.FC<PhaseGlobalSettingsProps> = ({
  phaseConfig,
  onPhaseConfigChange,
  randomSeed,
  onRandomSeedChange,
}) => (
  <Card className="bg-muted/20 relative">
    <div className="absolute top-3 left-3 z-10">
      <span className="text-sm font-medium border border-border rounded-md px-2 py-1 bg-background/50">
        Global Settings
      </span>
    </div>
    <CardContent className="pt-12 px-4 pb-4">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left Column */}
        <div className="space-y-3">
          {/* Number of Phases */}
          <div>
            <Label htmlFor="num_phases" className="text-sm font-light block mb-1.5">
              Number of Phases:
            </Label>
            <RadioGroup
              value={String(phaseConfig.num_phases)}
              onValueChange={(value) => {
                const newNumPhases = parseInt(value);
                const { phases, steps } = computePhaseTransition(phaseConfig, newNumPhases);
                onPhaseConfigChange({
                  ...phaseConfig,
                  num_phases: newNumPhases,
                  phases,
                  steps_per_phase: steps,
                  // Auto-set model_switch_phase to 1 when num_phases is 2
                  model_switch_phase: newNumPhases === 2 ? 1 : phaseConfig.model_switch_phase
                });
              }}
              className="flex flex-row gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="2" id="phases-2" />
                <Label htmlFor="phases-2" className="text-sm">2</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="3" id="phases-3" />
                <Label htmlFor="phases-3" className="text-sm">3</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Sample Solver */}
          <div>
            <Label htmlFor="sample_solver" className="text-sm font-light block mb-1.5">Sample Solver:</Label>
            <RadioGroup
              value={phaseConfig.sample_solver}
              onValueChange={(value) => onPhaseConfigChange({
                ...phaseConfig,
                sample_solver: value
              })}
              className="flex flex-row gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="euler" id="euler" />
                <Label htmlFor="euler" className="text-sm">Euler</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="unipc" id="unipc" />
                <Label htmlFor="unipc" className="text-sm">UniPC</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="dpm++" id="dpm++" />
                <Label htmlFor="dpm++" className="text-sm">DPM++</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Total Steps */}
          <div className="text-sm text-muted-foreground pt-1.5 border-t mt-1">
            Total Steps: {phaseConfig.steps_per_phase.reduce((a, b) => a + b, 0)}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-3">
          {/* Flow Shift */}
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
              onValueChange={(value) => onPhaseConfigChange({
                ...phaseConfig,
                flow_shift: value
              })}
            />
          </div>

          {/* Random Seed */}
          <div className="flex items-center space-x-2">
            <Switch
              id="random-seed"
              checked={randomSeed}
              onCheckedChange={onRandomSeedChange}
            />
            <Label htmlFor="random-seed" className="text-sm">Random Seed:</Label>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
);

// =============================================================================
// PerPhaseCard
// =============================================================================

/** Immutably update a single field on a lora within a phase's lora list. */
function updateLoraField(
  phaseConfig: PhaseConfig,
  phaseIdx: number,
  loraIdx: number,
  field: string,
  value: string,
): PhaseSettings[] {
  return phaseConfig.phases.map((p, pIdx) =>
    pIdx === phaseIdx
      ? { ...p, loras: p.loras.map((l, lIdx) => lIdx === loraIdx ? { ...l, [field]: value } : l) }
      : p
  );
}

interface PerPhaseCardProps {
  phaseConfig: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  phaseIdx: number;
  phase: PhaseSettings;
  label: string;
  availableLoras: LoraModel[];
  focusedLoraInput: string | null;
  onFocusLoraInput: (id: string | null) => void;
  onOpenLoraModal: (phaseIdx: number) => void;
  onBlurSave?: () => void;
}

const PerPhaseCard: React.FC<PerPhaseCardProps> = ({
  phaseConfig,
  onPhaseConfigChange,
  phaseIdx,
  phase,
  label,
  availableLoras,
  focusedLoraInput,
  onFocusLoraInput,
  onOpenLoraModal,
  onBlurSave,
}) => (
  <Card className="bg-muted/30 relative">
    <div className="absolute top-3 left-3 z-10">
      <span className="text-sm font-medium border border-border rounded-md px-2 py-1 bg-background/50">
        {label}
      </span>
    </div>
    <CardContent className="pt-12 px-4 pb-4">
      <div className="grid grid-cols-3 gap-6">
        {/* Left Column - Steps and Guidance Scale (1/3) */}
        <div className="space-y-3">
          {/* Steps */}
          <div>
            <Label htmlFor={`steps_${phaseIdx}`} className="text-sm font-light block mb-1.5">
              Steps: {phaseConfig.steps_per_phase[phaseIdx]}
            </Label>
            <Slider
              id={`steps_${phaseIdx}`}
              min={1}
              max={15}
              step={1}
              value={phaseConfig.steps_per_phase[phaseIdx]}
              onValueChange={(value) => {
                const newSteps = [...phaseConfig.steps_per_phase];
                newSteps[phaseIdx] = value;
                onPhaseConfigChange({
                  ...phaseConfig,
                  steps_per_phase: newSteps
                });
              }}
            />
          </div>

          {/* Guidance Scale */}
          <div>
            <Label htmlFor={`guidance_scale_${phaseIdx}`} className="text-sm font-light block mb-1.5">
              Guidance Scale:
            </Label>
            <NumberInput
              id={`guidance_scale_${phaseIdx}`}
              min={0}
              max={10}
              step={0.1}
              value={phase.guidance_scale}
              onChange={(val) => {
                const newPhases = phaseConfig.phases.map((p, idx) =>
                  idx === phaseIdx
                    ? { ...p, guidance_scale: val }
                    : p
                );
                onPhaseConfigChange({
                  ...phaseConfig,
                  phases: newPhases
                });
              }}
            />
          </div>
        </div>

        {/* Right Column - LoRAs (2/3) */}
        <div className="col-span-2">
          <Label className="text-sm font-medium mb-1.5 block">LoRAs:</Label>
          <div className="grid grid-cols-2 gap-2 mb-1.5 w-full">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenLoraModal(phaseIdx)}
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
                {/* Group by category */}
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
                        onClick={() => {
                          const newPhases = phaseConfig.phases.map((p, pIdx) =>
                            pIdx === phaseIdx
                              ? {
                                  ...p,
                                  loras: [
                                    ...p.loras.filter(l => l.url && l.url.trim() !== ""),
                                    { url: predefinedLora.url, multiplier: "1.0" }
                                  ]
                                }
                              : p
                          );
                          onPhaseConfigChange({
                            ...phaseConfig,
                            phases: newPhases
                          });
                        }}
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
            const inputId = `lora-${phaseIdx}-${loraIdx}`;
            const isFocused = focusedLoraInput === inputId;
            const loraValidation = lora.url ? validateHuggingFaceUrl(lora.url) : null;
            return (
              <div key={loraIdx} className="space-y-0.5 mb-1.5">
                <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Input
                    placeholder="LoRA URL"
                    value={isFocused ? lora.url : getDisplayNameFromUrl(lora.url, availableLoras)}
                    className={`pr-8 ${loraValidation && !loraValidation.isValid ? 'border-yellow-500 focus-visible:ring-yellow-500' : ''}`}
                    onChange={(e) => {
                      onPhaseConfigChange({
                        ...phaseConfig,
                        phases: updateLoraField(phaseConfig, phaseIdx, loraIdx, 'url', e.target.value),
                      });
                    }}
                    onFocus={() => onFocusLoraInput(inputId)}
                    onBlur={() => {
                      onFocusLoraInput(null);
                      onBlurSave?.();
                    }}
                    title={lora.url}
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        const newPhases = phaseConfig.phases.map((p, pIdx) =>
                          pIdx === phaseIdx
                            ? { ...p, loras: p.loras.filter((_, lIdx) => lIdx !== loraIdx) }
                            : p
                        );
                        onPhaseConfigChange({
                          ...phaseConfig,
                          phases: newPhases
                        });
                      }}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <NumberInput
                  placeholder="Multiplier"
                  value={parseFloat(lora.multiplier) || 0}
                  min={0}
                  max={2}
                  step={0.1}
                  onChange={(val) => {
                    onPhaseConfigChange({
                      ...phaseConfig,
                      phases: updateLoraField(phaseConfig, phaseIdx, loraIdx, 'multiplier', String(val)),
                    });
                  }}
                  className="w-20 flex-shrink-0"
                />
                </div>
                {loraValidation && !loraValidation.isValid && (
                  <div className="flex items-center gap-1 text-yellow-500 text-xs px-1">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                    <span>{loraValidation.message}</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add LoRA button */}
          <TextAction
            onClick={() => {
              const newPhases = phaseConfig.phases.map((p, pIdx) =>
                pIdx === phaseIdx
                  ? {
                      ...p,
                      loras: [
                        ...p.loras.filter(l => l.url && l.url.trim() !== ""),
                        { url: "", multiplier: "1.0" }
                      ]
                    }
                  : p
              );
              onPhaseConfigChange({
                ...phaseConfig,
                phases: newPhases
              });
            }}
            className="cursor-pointer"
          >
            + Add LoRA
          </TextAction>
        </div>
      </div>
    </CardContent>
  </Card>
);

// =============================================================================
// usePhaseConfigModals - Modal state management for PhaseConfigVertical
// =============================================================================

interface PhaseConfigModals {
  // LoRA modal
  activePhaseForLoraSelection: number | null;
  isLoraModalOpen: boolean;
  openLoraModal: (phaseIdx: number) => void;
  closeLoraModal: () => void;
  // Preset modal
  isPresetModalOpen: boolean;
  presetModalTab: 'browse' | 'add-new';
  modalIntent: 'load' | 'overwrite';
  openPresetModal: (intent: 'load' | 'overwrite', tab: 'browse' | 'add-new') => void;
  closePresetModal: () => void;
  // LoRA input focus
  focusedLoraInput: string | null;
  setFocusedLoraInput: (id: string | null) => void;
}

function usePhaseConfigModals(): PhaseConfigModals {
  const [activePhaseForLoraSelection, setActivePhaseForLoraSelection] = useState<number | null>(null);
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  const [focusedLoraInput, setFocusedLoraInput] = useState<string | null>(null);
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [presetModalTab, setPresetModalTab] = useState<'browse' | 'add-new'>('browse');
  const [modalIntent, setModalIntent] = useState<'load' | 'overwrite'>('load');

  const openLoraModal = useCallback((phaseIdx: number) => {
    setActivePhaseForLoraSelection(phaseIdx);
    setIsLoraModalOpen(true);
  }, []);

  const closeLoraModal = useCallback(() => {
    setIsLoraModalOpen(false);
    setActivePhaseForLoraSelection(null);
  }, []);

  const openPresetModal = useCallback((intent: 'load' | 'overwrite', tab: 'browse' | 'add-new') => {
    setModalIntent(intent);
    setPresetModalTab(tab);
    setIsPresetModalOpen(true);
  }, []);

  const closePresetModal = useCallback(() => {
    setIsPresetModalOpen(false);
  }, []);

  return {
    activePhaseForLoraSelection,
    isLoraModalOpen,
    openLoraModal,
    closeLoraModal,
    isPresetModalOpen,
    presetModalTab,
    modalIntent,
    openPresetModal,
    closePresetModal,
    focusedLoraInput,
    setFocusedLoraInput,
  };
}

// =============================================================================
// PhaseConfigHeader - Header buttons for preset/restore actions
// =============================================================================

interface PhaseConfigHeaderProps {
  onLoadPreset: () => void;
  onSaveAsPreset: () => void;
  onOverwritePreset: () => void;
  onRestoreDefaults: () => void;
}

const PhaseConfigHeader: React.FC<PhaseConfigHeaderProps> = ({
  onLoadPreset,
  onSaveAsPreset,
  onOverwritePreset,
  onRestoreDefaults,
}) => (
  <div className="flex items-center justify-between gap-2">
    <h3 className="text-lg font-medium truncate">Phase Configuration</h3>
    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" className="w-8 h-8 p-0" onClick={onLoadPreset} type="button">
            <Library className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent><p>Load Preset</p></TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" className="w-8 h-8 p-0" onClick={onSaveAsPreset} type="button">
            <FilePlus className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent><p>Save As Preset</p></TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" className="w-8 h-8 p-0" onClick={onOverwritePreset} type="button">
            <Save className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent><p>Overwrite Preset</p></TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" className="w-8 h-8 p-0" onClick={onRestoreDefaults} type="button">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent><p>Restore Defaults</p></TooltipContent>
      </Tooltip>
    </div>
  </div>
);

// =============================================================================
// PhaseConfigVertical (orchestrator)
// =============================================================================

export const PhaseConfigVertical: React.FC<PhaseConfigVerticalProps> = ({
  phaseConfig,
  onPhaseConfigChange,
  onBlurSave,
  randomSeed,
  onRandomSeedChange,
  availableLoras = [],
  selectedPhasePresetId,
  onPhasePresetSelect,
  onPhasePresetRemove,
  currentSettings,
  generationTypeMode = 'i2v',
  onRestoreDefaults,
}) => {
  const modals = usePhaseConfigModals();
  const phaseLabels = phaseConfig.num_phases === 2 ? PHASE_LABELS_2 : PHASE_LABELS_3;

  if (!phaseConfig) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        No phase configuration available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PhaseConfigHeader
        onLoadPreset={() => modals.openPresetModal('load', 'browse')}
        onSaveAsPreset={() => modals.openPresetModal('load', 'add-new')}
        onOverwritePreset={() => modals.openPresetModal('overwrite', 'browse')}
        onRestoreDefaults={() => {
          if (onRestoreDefaults) {
            onRestoreDefaults();
          } else {
            onPhaseConfigChange(DEFAULT_PHASE_CONFIG);
          }
        }}
      />

      {/* Global Settings Card */}
      <PhaseGlobalSettings
        phaseConfig={phaseConfig}
        onPhaseConfigChange={onPhaseConfigChange}
        randomSeed={randomSeed}
        onRandomSeedChange={onRandomSeedChange}
      />

      {/* Per-Phase Settings */}
      {phaseConfig.phases.map((phase, phaseIdx) => (
        <PerPhaseCard
          key={phaseIdx}
          phaseConfig={phaseConfig}
          onPhaseConfigChange={onPhaseConfigChange}
          phaseIdx={phaseIdx}
          phase={phase}
          label={phaseLabels[phaseIdx] || `Phase ${phase.phase}`}
          availableLoras={availableLoras}
          focusedLoraInput={modals.focusedLoraInput}
          onFocusLoraInput={modals.setFocusedLoraInput}
          onOpenLoraModal={modals.openLoraModal}
          onBlurSave={onBlurSave}
        />
      ))}

      {/* LoRA Selector Modal for Phase Config */}
      <LoraSelectorModal
        isOpen={modals.isLoraModalOpen}
        onClose={modals.closeLoraModal}
        selectedLoras={[]}
        loras={availableLoras || []}
        onAddLora={(lora) => {
          if (modals.activePhaseForLoraSelection !== null) {
            const loraUrl = lora.huggingface_url || '';
            const newPhases = phaseConfig.phases.map((p, pIdx) =>
              pIdx === modals.activePhaseForLoraSelection
                ? {
                    ...p,
                    loras: [
                      ...p.loras.filter(l => l.url && l.url.trim() !== ""),
                      { url: loraUrl, multiplier: "1.0" }
                    ]
                  }
                : p
            );
            onPhaseConfigChange({
              ...phaseConfig,
              phases: newPhases
            });
            modals.closeLoraModal();
          }
        }}
        onRemoveLora={() => {}}
        onUpdateLoraStrength={() => {}}
        lora_type="Wan 2.1 14b"
      />

      {/* Phase Config Preset Selector Modal */}
      <PhaseConfigSelectorModal
        isOpen={modals.isPresetModalOpen}
        onClose={modals.closePresetModal}
        onSelectPreset={(preset) => {
          if (preset.metadata.phaseConfig && onPhasePresetSelect) {
            onPhasePresetSelect(preset.id, preset.metadata.phaseConfig, preset.metadata);
          }
          modals.closePresetModal();
        }}
        onRemovePreset={() => {
          if (onPhasePresetRemove) {
            onPhasePresetRemove();
          }
        }}
        selectedPresetId={selectedPhasePresetId || null}
        currentPhaseConfig={phaseConfig}
        initialTab={modals.presetModalTab}
        currentSettings={currentSettings}
        intent={modals.modalIntent}
        availableLoras={availableLoras}
        generationTypeMode={generationTypeMode}
      />
    </div>
  );
};
