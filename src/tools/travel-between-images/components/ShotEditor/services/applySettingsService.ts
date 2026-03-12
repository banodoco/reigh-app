/**
 * Backward-compatible facade for apply settings services.
 *
 * The implementation has been split into focused modules under
 * `services/applySettings/` to reduce file size and improve cohesion while
 * keeping existing imports stable.
 */

export type {
  ApplyAdvancedContext,
  ApplyGenerationContext,
  ApplyLoraContext,
  ApplyModeContext,
  ApplyModelContext,
  ApplyResult,
  ApplyMotionContext,
  ApplyPromptContext,
  ApplyStructureVideoContext,
  ApplyTextAddonContext,
  ExtractedSettings,
  FetchTaskResult,
  TaskData,
} from './applySettings/types';

export { fetchTask, extractSettings } from './applySettings/taskDataService';

export {
  applyModelSettings,
  applyPromptSettings,
  applyGenerationSettings,
  applyModeSettings,
  applyAdvancedModeSettings,
} from './applySettings/generationSettingsService';

export {
  applyTextPromptAddons,
  applyMotionSettings,
} from './applySettings/motionSettingsService';

export {
  applyLoRAs,
  applyStructureVideo,
} from './applySettings/resourceService';

export {
  applyFramePositionsToExistingImages,
  replaceImagesIfRequested,
} from './applySettings/imageService';
