/**
 * ImageLightboxContent
 *
 * Content component that handles layout selection and rendering for ImageLightbox.
 * Uses context hooks for layout decisions and receives pre-built layout props from orchestrator.
 *
 * This extraction reduces ImageLightbox orchestrator size by moving:
 * - Layout selection logic (if/else for Desktop/Mobile/Centered)
 * - Layout component imports and rendering
 */

import React from 'react';
import type { SidePanelLayoutProps, CenteredLayoutProps } from '../layouts/types';

import {
  useLightboxCoreSafe,
} from '../../contexts/LightboxStateContext';
import { useImageEditSafe } from '../../contexts/ImageEditContext';
import {
  DesktopSidePanelLayout,
  MobileStackedLayout,
  CenteredLayout,
} from '../layouts';

// ============================================================================
// Props Interface
// ============================================================================

export interface ImageLightboxContentProps {
  /** Pre-built props for side panel layout (Desktop and Mobile stacked) */
  sidePanelLayoutProps: SidePanelLayoutProps;

  /** Pre-built props for centered layout */
  centeredLayoutProps: CenteredLayoutProps;

  /** Whether to show task details panel */
  showTaskDetails: boolean;

  /** Layout state from orchestrator */
  shouldShowSidePanel: boolean;
}

// ============================================================================
// Component
// ============================================================================

export const ImageLightboxContent: React.FC<ImageLightboxContentProps> = ({
  sidePanelLayoutProps,
  centeredLayoutProps,
  showTaskDetails,
  shouldShowSidePanel,
}) => {
  // ========================================
  // CONTEXT STATE - for layout decisions
  // ========================================
  const { isMobile } = useLightboxCoreSafe();
  const { isSpecialEditMode } = useImageEditSafe();

  // ========================================
  // RENDER - Layout Selection
  // ========================================

  if (shouldShowSidePanel) {
    return <DesktopSidePanelLayout {...sidePanelLayoutProps} />;
  }

  if ((showTaskDetails || isSpecialEditMode) && isMobile) {
    return <MobileStackedLayout {...sidePanelLayoutProps} />;
  }

  return <CenteredLayout {...centeredLayoutProps} />;
};

export default ImageLightboxContent;
