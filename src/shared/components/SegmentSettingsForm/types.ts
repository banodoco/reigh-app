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

export interface SegmentSettingsFormProps {
  settings: SegmentSettings;
  onChange: (updates: Partial<SegmentSettings>) => void;
  onSubmit: () => Promise<void>;
  segmentIndex?: number;
  startImageUrl?: string;
  endImageUrl?: string;
  modelName?: string;
  resolution?: string;
  isRegeneration?: boolean;
  isSubmitting?: boolean;
  buttonLabel?: string;
  showHeader?: boolean;
  headerTitle?: string;
  maxFrames?: number;
  queryKeyPrefix?: string;
  onFrameCountChange?: (frames: number) => void;
  onRestoreDefaults?: () => void;
  onSaveAsShotDefaults?: () => Promise<boolean>;
  onSaveFieldAsDefault?: (
    field: keyof SegmentSettings,
    value: SegmentSettings[keyof SegmentSettings]
  ) => Promise<boolean>;
  hasOverride?: SegmentOverrideFlags;
  shotDefaults?: SegmentShotDefaults;
  isDirty?: boolean;
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth' | null;
  structureVideoDefaults?: StructureVideoDefaults;
  structureVideoUrl?: string;
  structureVideoFrameRange?: StructureVideoFrameRange;
  enhancedPrompt?: string;
  basePromptForEnhancement?: string;
  onClearEnhancedPrompt?: () => Promise<boolean>;
  enhancePromptEnabled?: boolean;
  onEnhancePromptChange?: (enabled: boolean) => void;
  edgeExtendAmount?: 4 | 6;
  isTimelineMode?: boolean;
  onAddSegmentStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  onUpdateSegmentStructureVideo?: (updates: Partial<StructureVideoConfigWithMetadata>) => void;
  onRemoveSegmentStructureVideo?: () => void;
  startImageShotGenerationId?: string;
  endImageShotGenerationId?: string;
  onNavigateToImage?: (shotGenerationId: string) => void;
}

export type { SegmentSettings } from './segmentSettingsUtils';
