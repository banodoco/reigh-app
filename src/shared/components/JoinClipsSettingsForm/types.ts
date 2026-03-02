import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { LoraModel, UseLoraManagerReturn } from '@/shared/hooks/useLoraManager';
import type { PresetMetadata } from '@/shared/components/MotionPresetSelector/types';

/** Info about a clip pair for visualization */
export interface ClipPairInfo {
  pairIndex: number;
  clipA: {
    name: string;
    frameCount: number;
    finalFrameUrl?: string; // last frame of clip A
  };
  clipB: {
    name: string;
    frameCount: number;
    posterUrl?: string; // first frame of clip B
  };
}

export interface JoinClipsClipSettings {
  gapFrames: number;
  setGapFrames: (val: number) => void;
  contextFrames: number;
  setContextFrames: (val: number) => void;
  replaceMode: boolean;
  setReplaceMode: (val: boolean) => void;
  keepBridgingImages?: boolean;
  setKeepBridgingImages?: (val: boolean) => void;

  prompt: string;
  setPrompt: (val: string) => void;
  negativePrompt: string;
  setNegativePrompt: (val: string) => void;

  useIndividualPrompts?: boolean;
  setUseIndividualPrompts?: (val: boolean) => void;
  clipCount?: number;

  enhancePrompt?: boolean;
  setEnhancePrompt?: (val: boolean) => void;

  useInputVideoResolution?: boolean;
  setUseInputVideoResolution?: (val: boolean) => void;
  showResolutionToggle?: boolean;

  useInputVideoFps?: boolean;
  setUseInputVideoFps?: (val: boolean) => void;
  showFpsToggle?: boolean;

  noisedInputVideo?: number;
  setNoisedInputVideo?: (val: number) => void;

  shortestClipFrames?: number;
  clipPairs?: ClipPairInfo[];
}

export interface JoinClipsMotionConfig {
  availableLoras: LoraModel[];
  projectId: string | null;
  loraPersistenceKey: string;
  /** Optional external loraManager. If provided, uses this instead of creating a new one. */
  loraManager?: UseLoraManagerReturn;

  motionMode?: 'basic' | 'advanced';
  onMotionModeChange?: (mode: 'basic' | 'advanced') => void;

  phaseConfig?: PhaseConfig;
  onPhaseConfigChange?: (config: PhaseConfig) => void;

  randomSeed?: boolean;
  onRandomSeedChange?: (val: boolean) => void;

  selectedPhasePresetId?: string | null;
  onPhasePresetSelect?: (presetId: string, config: PhaseConfig, presetMetadata?: PresetMetadata) => void;
  onPhasePresetRemove?: () => void;

  featuredPresetIds?: string[];
}

export interface JoinClipsUIState {
  onGenerate: () => void;
  isGenerating: boolean;
  generateSuccess: boolean;
  generateButtonText: string;
  isGenerateDisabled?: boolean;

  onRestoreDefaults?: () => void;
  className?: string;
  headerContent?: React.ReactNode;

  /** Whether to show the generate button (default: true). Set to false when embedding in another form. */
  showGenerateButton?: boolean;
}

export interface JoinClipsSettingsFormProps {
  clipSettings: JoinClipsClipSettings;
  motionConfig: JoinClipsMotionConfig;
  uiState: JoinClipsUIState;
}

type JoinClipsSettingsFormResolvedProps =
  & JoinClipsClipSettings
  & JoinClipsMotionConfig
  & JoinClipsUIState;

export function resolveJoinClipsSettingsFormProps(props: JoinClipsSettingsFormProps): JoinClipsSettingsFormResolvedProps {
  return {
    ...props.clipSettings,
    ...props.motionConfig,
    ...props.uiState,
  };
}
