/**
 * ShotEditor hooks barrel file
 *
 * Re-exports all hooks used by the ShotEditor component.
 */

export { useAudio } from './video/useAudio';
export { useStructureVideo } from './video/useStructureVideo';
export { useApplySettingsHandler } from './actions/useApplySettingsHandler';
export { useLoraSync } from './editor-state/useLoraSync';
export { useGenerationActions } from './actions/useGenerationActions';
export { useOutputSelection } from './video/useOutputSelection';
export { useNameEditing } from './editor-state/useNameEditing';
export { useModeReadiness } from './video/useModeReadiness';
export { useJoinSegmentsHandler } from './actions/useJoinSegmentsHandler';
export { useShotActions } from './actions/useShotActions';
export { useGenerateBatch } from './actions/useGenerateBatch';
export { useShotEditorSetup } from './editor-state/useShotEditorSetup';
export { useShotSettingsValue } from './editor-state/useShotSettingsValue';
export { useImageManagement } from './editor-state/useImageManagement';
export { useSteerableMotionHandlers } from './actions/useSteerableMotionHandlers';
export { useStructureVideoHandlers } from './video/useStructureVideoHandlers';
export { useJoinSegmentsSetup } from './actions/useJoinSegmentsSetup';
export { useShotEditorBridge } from './editor-state/useShotEditorBridge';
export { useLastVideoGeneration } from './video/useLastVideoGeneration';
export { useAspectAdjustedColumns } from './editor-state/useAspectAdjustedColumns';
export { useEnsureSelectedOutput } from './video/useEnsureSelectedOutput';

// NOTE: Bridge hooks (usePromptSettingsWithFallback, etc.) have been replaced
// with direct context hooks from VideoTravelSettingsProvider.
// The bridge hooks file is kept for reference but no longer exported.
// Use: import { usePromptSettings, ... } from '@/tools/travel-between-images/providers';

// Re-export timeline drop helpers
export * from './editor-state/timelineDropHelpers';
