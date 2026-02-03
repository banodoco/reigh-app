// Layout components (used by ImageLightboxContent/VideoLightboxContent)
export { DesktopSidePanelLayout } from './DesktopSidePanelLayout';
export { MobileStackedLayout } from './MobileStackedLayout';
export { CenteredLayout } from './CenteredLayout';

// Types (used by ImageLightboxContent/VideoLightboxContent)
export type {
  SidePanelLayoutProps,
  CenteredLayoutProps,
} from './types';

// ============================================================================
// Note: The following components are NOT exported from the barrel file:
// - FlexContainer, MediaWrapper, MediaContentDisplay, VariantOverlayBadge,
//   NewImageOverlayButton, AnnotationOverlayControls, AdjacentSegmentNavigation
// These are internal-only, imported directly by layout components.
// ============================================================================
