// ============================================================================
// External exports (used by InlineEditView and ShotImagesEditor)
// ============================================================================
export { MediaDisplayWithCanvas } from './MediaDisplayWithCanvas';
export { TopRightControls, BottomLeftControls, BottomRightControls } from './ButtonGroups';
export { EditModePanel } from './EditModePanel';
export type { EditModePanelProps } from './EditModePanel';
export { FloatingToolControls } from './FloatingToolControls';
export type { FloatingToolControlsProps } from './FloatingToolControls';
export { SegmentEditorModal } from './SegmentEditorModal';
export type { SegmentEditorModalProps } from './SegmentEditorModal';

// ============================================================================
// Internal exports (used by ImageLightbox/VideoLightbox orchestrators)
// ============================================================================
export { LightboxShell } from './LightboxShell';
export type { LightboxShellProps } from './LightboxShell';
export { LightboxProviders } from './LightboxProviders';
export { ImageLightboxContent } from './image';
export type { ImageLightboxContentProps } from './image';
export { VideoLightboxContent } from './video';
export type { VideoLightboxContentProps } from './video';

// ============================================================================
// Note: The following components are NOT exported from the barrel file:
// - NavigationButtons, MediaDisplay, TaskDetailsSection, MediaControls,
//   WorkflowControls, SourceGenerationDisplay, ActiveVariantDisplay,
//   ShotSelectorControls, WorkflowControlsBar, NavigationArrows,
//   OpenEditModeButton, TaskDetailsPanelWrapper, VideoEditPanel, InfoPanel,
//   ControlsPanel, VideoEditModeDisplay, VideoTrimModeDisplay,
//   SegmentRegenerateForm, SegmentSlotFormView
// These are internal-only, imported directly by layout components.
// ============================================================================
