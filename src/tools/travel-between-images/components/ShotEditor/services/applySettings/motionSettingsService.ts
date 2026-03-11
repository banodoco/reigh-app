import type {
  ApplyMotionContext,
  ApplyResult,
  ApplyTextAddonContext,
  ExtractedMotionSettings,
  ExtractedTextAddonSettings,
} from './types';

export const applyTextPromptAddons = (
  settings: ExtractedTextAddonSettings,
  context: ApplyTextAddonContext,
): ApplyResult => {
  // Apply text before prompts
  if (settings.textBeforePrompts !== undefined && context.onTextBeforePromptsChange) {
    context.onTextBeforePromptsChange(settings.textBeforePrompts);
  }

  // Apply text after prompts
  if (settings.textAfterPrompts !== undefined && context.onTextAfterPromptsChange) {
    context.onTextAfterPromptsChange(settings.textAfterPrompts);
  }

  return { success: true, settingName: 'textAddons' };
};

export const applyMotionSettings = (
  settings: ExtractedMotionSettings & { advancedMode?: boolean },
  context: ApplyMotionContext,
): ApplyResult => {
  // Only apply if NOT in advanced mode
  if (settings.amountOfMotion !== undefined && !settings.advancedMode && context.onAmountOfMotionChange) {
    context.onAmountOfMotionChange(settings.amountOfMotion * 100);
  }

  return { success: true, settingName: 'motion' };
};
