import type { PresetMetadata } from '@/shared/components/MotionPresetSelector/types';
import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';
import type { LoraModel, UseLoraManagerReturn } from '@/domains/lora/hooks/useLoraManager';
import type { PhaseConfig } from '@/shared/types/phaseConfig';

interface VideoPortionEditorSettingsProps {
  gapFrames: number;
  setGapFrames: (val: number) => void;
  contextFrames: number;
  setContextFrames: (val: number) => void;
  maxContextFrames?: number;
  negativePrompt: string;
  setNegativePrompt: (val: string) => void;
  enhancePrompt?: boolean;
  setEnhancePrompt?: (val: boolean) => void;
}

interface VideoPortionEditorSelectionProps {
  selections?: PortionSelection[];
  onUpdateSelectionSettings?: (
    id: string,
    updates: Partial<Pick<PortionSelection, 'gapFrameCount' | 'prompt' | 'name'>>
  ) => void;
  onRemoveSelection?: (id: string) => void;
  onAddSelection?: () => void;
  videoUrl?: string;
  fps?: number | null;
}

export interface VideoPortionEditorLoraProps {
  availableLoras: LoraModel[];
  projectId: string | null;
  loraManager?: UseLoraManagerReturn;
}

export interface VideoPortionEditorMotionProps {
  motionMode: 'basic' | 'advanced';
  onMotionModeChange: (mode: 'basic' | 'advanced') => void;
  phaseConfig: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  randomSeed: boolean;
  onRandomSeedChange: (val: boolean) => void;
  selectedPhasePresetId: string | null;
  onPhasePresetSelect: (
    presetId: string,
    config: PhaseConfig,
    metadata?: PresetMetadata
  ) => void;
  onPhasePresetRemove: () => void;
}

interface VideoPortionEditorActionProps {
  onGenerate: () => void;
  isGenerating: boolean;
  generateSuccess: boolean;
  isGenerateDisabled?: boolean;
  validationErrors?: string[];
}

interface VideoPortionEditorStateOverrides {
  onClose?: () => void;
  hideHeader?: boolean;
}

export interface VideoPortionEditorProps {
  settings: VideoPortionEditorSettingsProps;
  selections?: VideoPortionEditorSelectionProps;
  lora: VideoPortionEditorLoraProps;
  motion: VideoPortionEditorMotionProps;
  actions: VideoPortionEditorActionProps;
  stateOverrides?: VideoPortionEditorStateOverrides;
}
