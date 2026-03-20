import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { LoraModel } from '@/domains/lora/types/lora';
import type { LoraManagerState } from '@/domains/lora/types/loraManager';
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
  loraManager?: LoraManagerState;

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

/** Per-boundary crossfade status for the join form to display */
export interface BoundaryCrossfadeStatus {
  canCrossfade: boolean;
  overlapFrames: number;
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

  /**
   * Per-boundary crossfade status. When provided, the form shows a summary banner.
   * If all boundaries canCrossfade, the full settings form is hidden (only banner + generate shown).
   * Length should be clipCount - 1.
   */
  boundarySummary?: BoundaryCrossfadeStatus[];
}

export interface JoinClipsSettingsFormProps {
  clipSettings: JoinClipsClipSettings;
  motionConfig: JoinClipsMotionConfig;
  uiState: JoinClipsUIState;
}
