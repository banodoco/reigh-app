import type { ReactNode, RefObject } from 'react';
import type { AdjacentSegmentsData, SegmentSlotModeData } from '../../types';
import type { ButtonGroupProps } from '../../hooks/useButtonGroupProps';

type LayoutButtonGroupProps = ButtonGroupProps;

interface LayoutWorkflowBarProps {
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDelete?: (id: string) => void;
  onApplySettings?: (metadata: Record<string, unknown>) => void;
  allShots: Array<{ id: string; name: string }>;
  selectedShotId: string | undefined;
  onShotChange?: (shotId: string) => void;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{ shotId?: string; shotName?: string } | void>;
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  showTickForImageId?: string | null;
  showTickForSecondaryImageId?: string | null;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onShowTick?: (imageId: string) => void;
  onOptimisticPositioned?: (imageId: string, shotId: string) => void;
  onShowSecondaryTick?: (imageId: string) => void;
  onOptimisticUnpositioned?: (imageId: string, shotId: string) => void;
  contentRef: RefObject<HTMLDivElement>;
  handleApplySettings: () => void;
  handleNavigateToShotFromSelector?: (shot: { id: string; name: string }) => void;
  handleAddVariantAsNewGenerationToShot?: (shotId: string, variantId: string, currentTimelineFrame?: number) => Promise<boolean>;
}

interface LayoutPanelProps {
  effectiveTasksPaneOpen: boolean;
  effectiveTasksPaneWidth: number;
}

interface LayoutWorkflowControlsProps extends LayoutWorkflowBarProps {
  isDeleting?: string | null;
  handleDelete: () => void;
}

export interface LightboxLayoutProps extends LayoutPanelProps {
  showPanel: boolean;
  shouldShowSidePanel: boolean;
  buttonGroupProps: LayoutButtonGroupProps;
  workflowBarProps: LayoutWorkflowBarProps;
  controlsPanelContent?: ReactNode;
  workflowControlsProps?: LayoutWorkflowControlsProps;
  adjacentSegments?: AdjacentSegmentsData;
  segmentSlotMode?: SegmentSlotModeData;
}
