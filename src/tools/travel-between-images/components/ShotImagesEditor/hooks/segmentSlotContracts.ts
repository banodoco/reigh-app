import type { RefObject } from 'react';
import type { PairData } from '../../Timeline/TimelineContainer/types';
import type { GenerationRow } from '@/domains/generation/types';
import type { SegmentSlot } from '@/shared/hooks/segments';
import type { SegmentSlotModeData } from '@/domains/media-lightbox/types';
import type { StructureGuidanceConfig } from '@/shared/lib/tasks/travelBetweenImages';
import type { StructureVideoCollectionHandlers } from '@/tools/travel-between-images/types/mediaHandlers';

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
  structureGuidance?: StructureGuidanceConfig;
  structureVideos?: StructureVideoCollectionHandlers['structureVideos'];
  onAddStructureVideo?: StructureVideoCollectionHandlers['onAddStructureVideo'];
  onUpdateStructureVideo?: StructureVideoCollectionHandlers['onUpdateStructureVideo'];
  onRemoveStructureVideo?: StructureVideoCollectionHandlers['onRemoveStructureVideo'];
  onSetStructureVideos?: StructureVideoCollectionHandlers['onSetStructureVideos'];
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
  setSegmentSlotLightboxIndex: (value: number | null) => void;
  activePairData: PairData | null;
  setActivePairData: (value: PairData | null) => void;
  pendingImageToOpen: string | null;
  setPendingImageToOpen: (value: string | null) => void;
  pendingImageVariantId: string | null;
  setPendingImageVariantId: (value: string | null) => void;
}

interface SegmentSlotLocationState {
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
