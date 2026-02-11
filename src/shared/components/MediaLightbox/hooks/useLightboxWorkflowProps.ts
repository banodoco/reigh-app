/**
 * useLightboxWorkflowProps - Builds workflow, panel, and navigation props
 *
 * Edit mode state -> ImageEditContext, video edit state -> VideoEditContext,
 * controlsPanelProps -> built in each caller (ImageLightbox/VideoLightbox).
 * This hook only composes workflowBarProps + workflowControlsProps + layout chrome.
 */

import { useMemo, RefObject, ReactNode } from 'react';
import type { AdjacentSegmentsData, SegmentSlotModeData } from '../types';
import type { LightboxLayoutProps } from '../components/layouts/types';

// ============================================================================
// Input sub-interfaces (grouped by concern)
// ============================================================================

/** Panel visibility and tasks pane state */
interface WorkflowPanelProps {
  showPanel: boolean;
  shouldShowSidePanel: boolean;
  effectiveTasksPaneOpen: boolean;
  effectiveTasksPaneWidth: number;
}

/** Shot workflow: selection, adding, ticks, optimistic updates */
interface ShotWorkflowProps {
  allShots: Array<{ id: string; name: string }>;
  selectedShotId?: string;
  onShotChange?: (shotId: string) => void;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{ shotId?: string; shotName?: string } | void>;
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  showTickForImageId?: string | null;
  showTickForSecondaryImageId?: string | null;
  onShowTick?: (imageId: string) => void;
  onShowSecondaryTick?: (imageId: string) => void;
  onOptimisticPositioned?: (mediaId: string, shotId: string) => void;
  onOptimisticUnpositioned?: (mediaId: string, shotId: string) => void;
}

/** Action callbacks and handlers for delete, apply, navigate, variants */
interface WorkflowActionProps {
  onDelete?: (id: string) => void;
  onApplySettings?: (metadata: Record<string, unknown>) => void;
  handleApplySettings: () => void;
  handleDelete: () => void;
  isDeleting?: string | null;
  handleNavigateToShotFromSelector: (shot: { id: string; name: string }) => void;
  handleAddVariantAsNewGenerationToShot: (shotId: string, variantId: string, currentTimelineFrame?: number) => Promise<boolean>;
}

// ============================================================================
// Composed input interface
// ============================================================================

interface UseLightboxWorkflowPropsInput {
  panel: WorkflowPanelProps;
  shotWorkflow: ShotWorkflowProps;
  actions: WorkflowActionProps;

  // Button group props (pre-built)
  buttonGroupProps: {
    topLeft: ReactNode;
    topRight: ReactNode;
    bottomLeft: ReactNode;
    bottomRight: ReactNode;
  };

  contentRef: RefObject<HTMLDivElement>;

  // Adjacent segment navigation
  adjacentSegments?: AdjacentSegmentsData;

  // Segment slot mode (for constituent image navigation)
  segmentSlotMode?: SegmentSlotModeData;
}

interface UseLightboxWorkflowPropsReturn {
  layoutProps: LightboxLayoutProps;
}

export function useLightboxWorkflowProps(
  input: UseLightboxWorkflowPropsInput
): UseLightboxWorkflowPropsReturn {
  // Destructure sub-objects for internal use (keeps variable names identical)
  const { panel, shotWorkflow, actions } = input;

  // Build workflow bar props (shared across all layouts)
  const workflowBarProps = useMemo(() => ({
    onAddToShot: shotWorkflow.onAddToShot,
    onDelete: actions.onDelete,
    onApplySettings: actions.onApplySettings,
    allShots: shotWorkflow.allShots,
    selectedShotId: shotWorkflow.selectedShotId,
    onShotChange: shotWorkflow.onShotChange,
    onCreateShot: shotWorkflow.onCreateShot,
    isAlreadyPositionedInSelectedShot: shotWorkflow.isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition: shotWorkflow.isAlreadyAssociatedWithoutPosition,
    showTickForImageId: shotWorkflow.showTickForImageId,
    showTickForSecondaryImageId: shotWorkflow.showTickForSecondaryImageId,
    onAddToShotWithoutPosition: shotWorkflow.onAddToShotWithoutPosition,
    onShowTick: shotWorkflow.onShowTick,
    onShowSecondaryTick: shotWorkflow.onShowSecondaryTick,
    onOptimisticPositioned: shotWorkflow.onOptimisticPositioned,
    onOptimisticUnpositioned: shotWorkflow.onOptimisticUnpositioned,
    contentRef: input.contentRef,
    handleApplySettings: actions.handleApplySettings,
    handleNavigateToShotFromSelector: actions.handleNavigateToShotFromSelector,
    handleAddVariantAsNewGenerationToShot: actions.handleAddVariantAsNewGenerationToShot,
  }), [
    shotWorkflow.onAddToShot, actions.onDelete, actions.onApplySettings, shotWorkflow.allShots,
    shotWorkflow.selectedShotId, shotWorkflow.onShotChange, shotWorkflow.onCreateShot,
    shotWorkflow.isAlreadyPositionedInSelectedShot, shotWorkflow.isAlreadyAssociatedWithoutPosition,
    shotWorkflow.showTickForImageId, shotWorkflow.showTickForSecondaryImageId,
    shotWorkflow.onAddToShotWithoutPosition, shotWorkflow.onShowTick, shotWorkflow.onShowSecondaryTick,
    shotWorkflow.onOptimisticPositioned, shotWorkflow.onOptimisticUnpositioned, input.contentRef,
    actions.handleApplySettings, actions.handleNavigateToShotFromSelector,
    actions.handleAddVariantAsNewGenerationToShot,
  ]);

  // Build workflow controls props (below-media, centered layout only)
  const workflowControlsProps = useMemo(() => ({
    ...workflowBarProps,
    isDeleting: actions.isDeleting,
    handleDelete: actions.handleDelete,
  }), [workflowBarProps, actions.isDeleting, actions.handleDelete]);

  // Build unified layout props
  // Note: controlsPanelProps is built in the caller (ImageLightbox/VideoLightbox)
  // and passed directly to LightboxLayout.
  const layoutProps: LightboxLayoutProps = useMemo(() => ({
    showPanel: panel.showPanel,
    shouldShowSidePanel: panel.shouldShowSidePanel,
    // Panel
    effectiveTasksPaneOpen: panel.effectiveTasksPaneOpen,
    effectiveTasksPaneWidth: panel.effectiveTasksPaneWidth,
    // Composed props
    buttonGroupProps: input.buttonGroupProps,
    workflowBarProps,
    workflowControlsProps: panel.showPanel ? undefined : workflowControlsProps,
    // Navigation
    adjacentSegments: input.adjacentSegments,
    segmentSlotMode: input.segmentSlotMode,
  }), [
    panel.showPanel, panel.shouldShowSidePanel,
    panel.effectiveTasksPaneOpen, panel.effectiveTasksPaneWidth,
    input.buttonGroupProps, workflowBarProps,
    workflowControlsProps, input.adjacentSegments, input.segmentSlotMode,
  ]);

  return { layoutProps };
}
