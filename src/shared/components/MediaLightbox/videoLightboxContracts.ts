import type { GenerationRow } from '@/domains/generation/types';
import type {
  SegmentSlotModeData,
  AdjacentSegmentsData,
  TaskDetailsData,
  LightboxNavigationProps,
  LightboxShotWorkflowProps,
  LightboxFeatureFlags,
  LightboxActionHandlers,
} from './types';

/** Video-specific props that don't fit into shared groups */
export interface VideoLightboxVideoProps {
  initialVideoTrimMode?: boolean;
  fetchVariantsForSelf?: boolean;
  currentSegmentImages?: {
    startUrl?: string;
    endUrl?: string;
    startGenerationId?: string;
    endGenerationId?: string;
    startShotGenerationId?: string;
    endShotGenerationId?: string;
    activeChildGenerationId?: string;
    startVariantId?: string;
    endVariantId?: string;
  };
  onSegmentFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  currentFrameCount?: number;
  onTrimModeChange?: (isTrimMode: boolean) => void;
  onShowTaskDetails?: () => void;
}

export interface VideoLightboxProps {
  media?: GenerationRow;
  parentGenerationIdOverride?: string;
  onClose: () => void;
  segmentSlotMode?: SegmentSlotModeData;
  readOnly?: boolean;
  shotId?: string;
  initialVariantId?: string;
  taskDetailsData?: TaskDetailsData;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  showTickForImageId?: string | null;
  showTickForSecondaryImageId?: string | null;
  tasksPaneOpen?: boolean;
  tasksPaneWidth?: number;
  adjacentSegments?: AdjacentSegmentsData;
  navigation?: LightboxNavigationProps;
  shotWorkflow?: LightboxShotWorkflowProps;
  features?: LightboxFeatureFlags;
  actions?: LightboxActionHandlers;
  videoProps?: VideoLightboxVideoProps;
}

export type VideoLightboxPropsWithMedia = VideoLightboxProps & {
  media: GenerationRow;
};
