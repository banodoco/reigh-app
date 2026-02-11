// ============================================================================
// External exports (used by InlineEditView and ShotImagesEditor)
// ============================================================================
export { MediaDisplayWithCanvas } from './MediaDisplayWithCanvas';
export { TopRightControls, BottomLeftControls, BottomRightControls } from './ButtonGroups';
export { EditModePanel } from './EditModePanel';
export { FloatingToolControls } from './FloatingToolControls';
export { SegmentEditorModal } from './SegmentEditorModal';

// ============================================================================
// Internal exports (used by ImageLightbox/VideoLightbox orchestrators)
// ============================================================================
export { LightboxShell } from './LightboxShell';
export { LightboxProviders } from './LightboxProviders';

// ============================================================================
// Note: The following components are NOT exported from the barrel file:
// - NavigationButtons, MediaDisplay, TaskDetailsSection, MediaControls,
//   WorkflowControls, ActiveVariantDisplay,
//   ShotSelectorControls, WorkflowControlsBar, NavigationArrows,
//   OpenEditModeButton, TaskDetailsPanelWrapper, VideoEditPanel, InfoPanel,
//   ControlsPanel, VideoEditModeDisplay, VideoTrimModeDisplay,
//   SegmentRegenerateForm, SegmentSlotFormView
// These are internal-only, imported directly by layout components.
// ============================================================================
