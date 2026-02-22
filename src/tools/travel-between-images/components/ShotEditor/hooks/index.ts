/**
 * ShotEditor hooks barrel file
 *
 * Re-exports all hooks used by the ShotEditor component.
 */

export { useAudio } from './useAudio';
export { useStructureVideo } from './useStructureVideo';
export { useApplySettingsHandler } from './useApplySettingsHandler';
export { useLoraSync } from './useLoraSync';
export { useGenerationActions } from './useGenerationActions';
export { useOutputSelection } from './useOutputSelection';
export { useNameEditing } from './useNameEditing';
export { useModeReadiness } from './useModeReadiness';
export { useJoinSegmentsHandler } from './useJoinSegmentsHandler';
export { useShotActions } from './useShotActions';
export { useGenerateBatch } from './useGenerateBatch';
export { useShotEditorSetup } from './useShotEditorSetup';
export { useShotSettingsValue } from './useShotSettingsValue';
export { useImageManagement } from './useImageManagement';
export { useSteerableMotionHandlers } from './useSteerableMotionHandlers';
export { useStructureVideoHandlers } from './useStructureVideoHandlers';
export { useJoinSegmentsSetup } from './useJoinSegmentsSetup';
export { useShotEditorBridge } from './useShotEditorBridge';
export { useLastVideoGeneration } from './useLastVideoGeneration';
export { useAspectAdjustedColumns } from './useAspectAdjustedColumns';
export { useEnsureSelectedOutput } from './useEnsureSelectedOutput';

// NOTE: Bridge hooks (usePromptSettingsWithFallback, etc.) have been replaced
// with direct context hooks from VideoTravelSettingsProvider.
// The bridge hooks file is kept for reference but no longer exported.
// Use: import { usePromptSettings, ... } from '@/tools/travel-between-images/providers';

// Re-export timeline drop helpers
export * from './timelineDropHelpers';
