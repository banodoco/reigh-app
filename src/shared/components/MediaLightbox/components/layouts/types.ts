/**
 * Shared types for MediaLightbox layout components
 *
 * Video edit props (trim, replace, refs) are now in VideoEditContext.
 * Edit mode props (brush, annotation, reposition) are in ImageEditContext.
 * Only panel, workflow, and navigation props flow through here.
 */

import React from 'react';
import type { AdjacentSegmentsData, SegmentSlotModeData } from '../../types';

/**
 * Button group props (from useButtonGroupProps)
 */
interface LayoutButtonGroupProps {
  topLeft: React.ReactNode;
  topRight: React.ReactNode;
  bottomLeft: React.ReactNode;
  bottomRight: React.ReactNode;
}

/**
 * Workflow controls bar props
 */
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
  contentRef: React.RefObject<HTMLDivElement>;
  handleApplySettings: () => void;
  handleNavigateToShotFromSelector?: (shot: { id: string; name: string }) => void;
  handleAddVariantAsNewGenerationToShot?: (shotId: string, variantId: string, currentTimelineFrame?: number) => Promise<boolean>;
}

/**
 * Panel-related props (task pane state)
 */
interface LayoutPanelProps {
  effectiveTasksPaneOpen: boolean;
  effectiveTasksPaneWidth: number;
}

/**
 * Workflow controls props for below-media controls (centered layout only)
 */
interface LayoutWorkflowControlsProps extends LayoutWorkflowBarProps {
  isDeleting?: string | null;
  handleDelete: () => void;
}

/**
 * Unified layout props for LightboxLayout
 *
 * Edit mode props (brush, annotation, reposition, canvas) are read from ImageEditContext.
 * Video edit props (trim, replace, refs) are read from VideoEditContext.
 * Only panel, workflow, and navigation props flow through here.
 */
export interface LightboxLayoutProps extends
  LayoutPanelProps {
  showPanel: boolean;
  /** True when panel should be side-by-side (tablet+ landscape); false = stacked (mobile/portrait) */
  shouldShowSidePanel: boolean;

  // Button groups
  buttonGroupProps: LayoutButtonGroupProps;

  // Workflow controls bar (always present)
  workflowBarProps: LayoutWorkflowBarProps;

  // Controls panel content (panel layouts only — rendered by parent lightbox)
  controlsPanelContent?: React.ReactNode;

  // Workflow controls below media (centered layout only)
  workflowControlsProps?: LayoutWorkflowControlsProps;

  // Adjacent segment navigation
  adjacentSegments?: AdjacentSegmentsData;

  // Segment slot mode
  segmentSlotMode?: SegmentSlotModeData;
}

