/**
 * ShotSettingsContext - Shot data and UI state for ShotSettingsEditor sections
 *
 * This context provides:
 * - Core: Shot data (selected shot, project, images)
 * - UI: State and actions for editor UI
 * - Structure Video: Video overlay configuration
 * - Audio: Audio track management
 * - Image Handlers: Timeline manipulation callbacks
 * - Shot Management: Shot navigation and creation
 *
 * Settings (prompt, motion, frames, etc.) come from VideoTravelSettingsProvider.
 * Use the focused hooks (usePromptSettings, useMotionSettings, etc.) for settings.
 *
 * @see providers/VideoTravelSettingsProvider.tsx for settings context
 */

export type {
  ShotCoreState,
  ShotLoraState,
  ShotImagesState,
  ShotImageHandlers,
  ShotManagementState,
  GenerationModeState,
  GenerationHandlers,
  StructureVideoHandlers,
  JoinState,
  DimensionState,
  ShotSettingsContextValue,
} from './ShotSettingsContext.types';

export {
  ShotSettingsProvider,
  useShotSettingsContext,
} from './ShotSettingsContext.provider';

export {
  useShotCore,
  useShotUI,
  useShotLoras,
  useShotImages,
  useShotStructureVideo,
  useShotAudio,
  useShotImageHandlers,
  useShotManagement,
  useGenerationMode,
  useGenerationHandlers,
  useStructureVideoHandlers,
  useJoinState,
  useDimensions,
} from './ShotSettingsContext.selectors';
