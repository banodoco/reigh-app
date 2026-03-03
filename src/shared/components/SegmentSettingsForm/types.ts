import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { LoraConfig } from '@/shared/types/segmentSettings';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
import type { SegmentSettings } from './segmentSettingsUtils';

interface SegmentOverrideFlags {
  prompt: boolean;
  negativePrompt: boolean;
  textBeforePrompts: boolean;
  textAfterPrompts: boolean;
  motionMode: boolean;
  amountOfMotion: boolean;
  phaseConfig: boolean;
  loras: boolean;
  selectedPhasePresetId: boolean;
  structureMotionStrength: boolean;
  structureTreatment: boolean;
  structureUni3cEndPercent: boolean;
}

interface SegmentShotDefaults {
  prompt: string;
  negativePrompt: string;
  textBeforePrompts: string;
  textAfterPrompts: string;
  motionMode: 'basic' | 'advanced';
  amountOfMotion: number;
  phaseConfig?: PhaseConfig;
  loras: LoraConfig[];
  selectedPhasePresetId: string | null;
}

interface StructureVideoDefaults {
  motionStrength: number;
  treatment: 'adjust' | 'clip';
  uni3cEndPercent: number;
}

interface StructureVideoFrameRange {
  segmentStart: number;
  segmentEnd: number;
  videoTotalFrames: number;
  videoFps: number;
  videoOutputStart?: number;
  videoOutputEnd?: number;
}

export interface SegmentSettingsFormCoreProps {
  settings: SegmentSettings;
  onChange: (updates: Partial<SegmentSettings>) => void;
  onSubmit: () => Promise<void>;
  isSubmitting?: boolean;
}

export interface SegmentSettingsFormPresentationProps {
  segmentIndex?: number;
  modelName?: string;
  resolution?: string;
  isRegeneration?: boolean;
  buttonLabel?: string;
  showHeader?: boolean;
  headerTitle?: string;
  maxFrames?: number;
  queryKeyPrefix?: string;
  edgeExtendAmount?: 4 | 6;
}

export interface SegmentSettingsFormMediaProps {
  startImageUrl?: string;
  endImageUrl?: string;
  onFrameCountChange?: (frames: number) => void;
  startImageShotGenerationId?: string;
  endImageShotGenerationId?: string;
  onNavigateToImage?: (shotGenerationId: string) => void;
}

export interface SegmentSettingsFormDefaultsProps {
  onRestoreDefaults?: () => void;
  onSaveAsShotDefaults?: () => Promise<boolean>;
  onSaveFieldAsDefault?: (
    field: keyof SegmentSettings,
    value: SegmentSettings[keyof SegmentSettings]
  ) => Promise<boolean>;
  hasOverride?: SegmentOverrideFlags;
  shotDefaults?: SegmentShotDefaults;
  isDirty?: boolean;
}

export interface SegmentSettingsFormStructureVideoProps {
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth' | null;
  structureVideoDefaults?: StructureVideoDefaults;
  structureVideoUrl?: string;
  structureVideoFrameRange?: StructureVideoFrameRange;
  isTimelineMode?: boolean;
  onAddSegmentStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  onUpdateSegmentStructureVideo?: (
    updates: Partial<StructureVideoConfigWithMetadata>
  ) => void;
  onRemoveSegmentStructureVideo?: () => void;
}

export interface SegmentSettingsFormEnhancementProps {
  enhancedPrompt?: string;
  basePromptForEnhancement?: string;
  onClearEnhancedPrompt?: () => Promise<boolean>;
  enhancePromptEnabled?: boolean;
  onEnhancePromptChange?: (enabled: boolean) => void;
}

export interface SegmentSettingsFormProps
  extends SegmentSettingsFormCoreProps,
    SegmentSettingsFormPresentationProps,
    SegmentSettingsFormMediaProps,
    SegmentSettingsFormDefaultsProps,
    SegmentSettingsFormStructureVideoProps,
    SegmentSettingsFormEnhancementProps {}

export type { SegmentSettings } from './segmentSettingsUtils';
