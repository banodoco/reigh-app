import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { RefObject } from 'react';
import type { PairData } from '../../Timeline/TimelineContainer';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
import type { GenerationRow } from '@/domains/generation/types';
import type { SegmentSlot } from '@/shared/hooks/segments';
import type { SegmentSlotModeData } from '@/shared/components/MediaLightbox/types';

export type SegmentSlotGenerationMode = 'batch' | 'timeline' | 'by-pair';

export interface UseSegmentSlotModeResolvedProps {
  selectedShotId: string;
  projectId?: string;
  effectiveGenerationMode: SegmentSlotGenerationMode;
  batchVideoFrames: number;
  shotGenerations: GenerationRow[];
  segmentSlots: SegmentSlot[];
  selectedParentId: string | null;
  defaultPrompt: string;
  defaultNegativePrompt: string;
  resolvedProjectResolution?: string;
  structureVideos?: StructureVideoConfigWithMetadata[];
  onAddStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  onUpdateStructureVideo?: (index: number, updates: Partial<StructureVideoConfigWithMetadata>) => void;
  onRemoveStructureVideo?: (index: number) => void;
  onSetStructureVideos?: (videos: StructureVideoConfigWithMetadata[]) => void;
  maxFrameLimit: number;
  loadPositions: (options?: { silent?: boolean; reason?: string }) => Promise<void>;
  navigateWithTransition: (doNavigation: () => void) => void;
  addOptimisticPending: (pairShotGenerationId: string) => void;
  trailingFrameUpdateRef?: RefObject<((endFrame: number) => void) | null>;
  onOpenPreviewDialog?: (startAtPairIndex: number) => void;
}

export interface UseSegmentSlotModeReturn {
  segmentSlotLightboxIndex: number | null;
  setSegmentSlotLightboxIndex: (index: number | null) => void;
  activePairData: PairData | null;
  setActivePairData: (data: PairData | null) => void;
  pendingImageToOpen: string | null;
  setPendingImageToOpen: (id: string | null) => void;
  pendingImageVariantId: string | null;
  pairDataByIndex: Map<number, PairData>;
  segmentSlotModeData: SegmentSlotModeData | null;
  handlePairClick: (pairIndex: number, passedPairData?: PairData) => void;
  updatePairFrameCount: (
    pairShotGenerationId: string,
    newFrameCount: number,
  ) => Promise<{ finalFrameCount: number } | void>;
}

export interface SegmentSlotState {
  segmentSlotLightboxIndex: number | null;
  setSegmentSlotLightboxIndex: Dispatch<SetStateAction<number | null>>;
  activePairData: PairData | null;
  setActivePairData: Dispatch<SetStateAction<PairData | null>>;
  pendingImageToOpen: string | null;
  setPendingImageToOpen: Dispatch<SetStateAction<string | null>>;
  pendingImageVariantId: string | null;
  setPendingImageVariantId: Dispatch<SetStateAction<string | null>>;
}

export interface SegmentSlotLocationState {
  openImageGenerationId?: string;
  openImageVariantId?: string;
  openSegmentSlot?: string;
  fromShotClick?: boolean;
}

interface SegmentSlotParser {
  asRecord(value: unknown): Record<string, unknown> | undefined;
  asString(value: unknown): string | undefined;
}

const defaultParser: SegmentSlotParser = {
  asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  },
  asString(value) {
    return typeof value === 'string' ? value : undefined;
  },
};

export function parseSegmentSlotLocationState(
  state: unknown,
  parser: SegmentSlotParser = defaultParser,
): SegmentSlotLocationState {
  const record = parser.asRecord(state);
  if (!record) return {};
  return {
    openImageGenerationId: parser.asString(record.openImageGenerationId),
    openImageVariantId: parser.asString(record.openImageVariantId),
    openSegmentSlot: parser.asString(record.openSegmentSlot),
    fromShotClick: record.fromShotClick === true,
  };
}

export type SegmentSlotModeDataBuilder = (
  frameCountDebounceRef: MutableRefObject<NodeJS.Timeout | null>,
) => SegmentSlotModeData | null;
