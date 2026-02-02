/**
 * VideoLightboxContent
 *
 * Content component that handles layout selection and rendering for VideoLightbox.
 * Uses context hooks for layout decisions and receives pre-built layout props from orchestrator.
 *
 * This extraction reduces VideoLightbox orchestrator size by moving:
 * - Layout selection logic (if/else for Desktop/Mobile/Centered/FormOnly)
 * - Layout component imports and rendering
 * - SegmentSlotFormView rendering for form-only mode
 */

import React from 'react';
import type { SegmentSlotModeData } from '../../types';
import type { SidePanelLayoutProps, CenteredLayoutProps } from '../layouts/types';

import {
  useLightboxCoreSafe,
  useLightboxNavigationSafe,
} from '../../contexts/LightboxStateContext';
import { useVideoEditSafe } from '../../contexts/VideoEditContext';
import {
  DesktopSidePanelLayout,
  MobileStackedLayout,
  CenteredLayout,
} from '../layouts';
import { SegmentSlotFormView } from '../SegmentSlotFormView';

// ============================================================================
// Props Interface
// ============================================================================

export interface VideoLightboxContentProps {
  /** Pre-built props for side panel layout (Desktop and Mobile stacked) */
  sidePanelLayoutProps: SidePanelLayoutProps;

  /** Pre-built props for centered layout */
  centeredLayoutProps: CenteredLayoutProps;

  /** Whether to show task details panel */
  showTaskDetails: boolean;

  /** Layout state from orchestrator */
  shouldShowSidePanelWithTrim: boolean;

  /** Segment slot mode data (for form-only and segment navigation) */
  segmentSlotMode?: SegmentSlotModeData;

  /** Whether we're in form-only mode (no video, just form) */
  isFormOnlyMode: boolean;

  /** Whether we're in segment slot mode */
  isSegmentSlotMode: boolean;

  /** Whether segment has video */
  hasSegmentVideo: boolean;
}

// ============================================================================
// Component
// ============================================================================

export const VideoLightboxContent: React.FC<VideoLightboxContentProps> = ({
  sidePanelLayoutProps,
  centeredLayoutProps,
  showTaskDetails,
  shouldShowSidePanelWithTrim,
  segmentSlotMode,
  isFormOnlyMode,
  isSegmentSlotMode,
  hasSegmentVideo,
}) => {
  // ========================================
  // CONTEXT STATE - for layout decisions
  // ========================================
  const { isMobile, readOnly, onClose } = useLightboxCoreSafe();
  const { hasNext, hasPrevious, handleSlotNavNext, handleSlotNavPrev } = useLightboxNavigationSafe();
  const { videoEditSubMode } = useVideoEditSafe();

  const isVideoTrimModeActive = videoEditSubMode === 'trim';
  const isVideoEditModeActive = videoEditSubMode !== null;
  const isAnyVideoEditMode = isVideoTrimModeActive || isVideoEditModeActive;

  // ========================================
  // RENDER - Form-only mode
  // ========================================

  if (isFormOnlyMode && segmentSlotMode) {
    return (
      <SegmentSlotFormView
        segmentSlotMode={segmentSlotMode}
        onClose={onClose}
        onNavPrev={handleSlotNavPrev}
        onNavNext={handleSlotNavNext}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        readOnly={readOnly}
      />
    );
  }

  // ========================================
  // RENDER - Layout Selection
  // ========================================

  if (shouldShowSidePanelWithTrim) {
    return <DesktopSidePanelLayout {...sidePanelLayoutProps} />;
  }

  if ((showTaskDetails || isAnyVideoEditMode || (isSegmentSlotMode && hasSegmentVideo)) && isMobile) {
    return <MobileStackedLayout {...sidePanelLayoutProps} />;
  }

  return <CenteredLayout {...centeredLayoutProps} />;
};

export default VideoLightboxContent;
