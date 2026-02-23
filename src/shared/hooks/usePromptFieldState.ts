import { useCallback, useMemo } from 'react';

type PromptBadgeType = 'enhanced' | 'default' | null;

interface UsePromptFieldStateOptions {
  settingsPrompt: string | undefined;
  enhancedPrompt: string | undefined;
  basePromptForEnhancement: string | undefined;
  defaultPrompt: string | undefined;
  onSettingsChange: (prompt: string | undefined) => void;
  onClearEnhancedPrompt?: () => void;
}

interface PromptFieldState {
  displayValue: string;
  badgeType: PromptBadgeType;
  hasEnhancedPrompt: boolean;
  userHasSetPrompt: boolean;
  userHasEditedAfterEnhancement: boolean;
  handleChange: (value: string) => void;
  handleClearAll: () => void;
  handleClearEnhanced: () => void;
  handleVoiceResult: (result: { prompt?: string; transcription?: string }) => void;
}

/** Resolve prompt display priority across user edits, enhanced prompts, and defaults. */
export function usePromptFieldState({
  settingsPrompt,
  enhancedPrompt,
  basePromptForEnhancement,
  defaultPrompt,
  onSettingsChange,
  onClearEnhancedPrompt,
}: UsePromptFieldStateOptions): PromptFieldState {
  const hasEnhancedPrompt = !!enhancedPrompt?.trim();
  const hasSettingsPrompt = settingsPrompt !== undefined;

  const userHasEditedAfterEnhancement = useMemo(() => {
    if (settingsPrompt === undefined) return false;
    if (!hasEnhancedPrompt) return false;

    if (basePromptForEnhancement !== undefined) {
      return settingsPrompt.trim() !== basePromptForEnhancement.trim();
    }

    // Legacy rows may not have a stored base prompt.
    return enhancedPrompt ? settingsPrompt.trim() !== enhancedPrompt.trim() : false;
  }, [hasEnhancedPrompt, settingsPrompt, basePromptForEnhancement, enhancedPrompt]);

  const { displayValue, badgeType } = useMemo(() => {
    if (userHasEditedAfterEnhancement && settingsPrompt !== undefined) {
      return { displayValue: settingsPrompt, badgeType: null as PromptBadgeType };
    }

    if (enhancedPrompt?.trim()) {
      return { displayValue: enhancedPrompt, badgeType: 'enhanced' as PromptBadgeType };
    }

    if (settingsPrompt !== undefined) {
      return { displayValue: settingsPrompt, badgeType: null as PromptBadgeType };
    }

    if (defaultPrompt !== undefined) {
      return { displayValue: defaultPrompt, badgeType: 'default' as PromptBadgeType };
    }

    return { displayValue: '', badgeType: null as PromptBadgeType };
  }, [
    userHasEditedAfterEnhancement,
    settingsPrompt,
    enhancedPrompt,
    defaultPrompt,
  ]);

  const handleClearAll = useCallback(() => {
    onSettingsChange(undefined);
    onClearEnhancedPrompt?.();
  }, [onSettingsChange, onClearEnhancedPrompt]);

  const handleClearEnhanced = useCallback(() => {
    onClearEnhancedPrompt?.();
  }, [onClearEnhancedPrompt]);

  const handleVoiceResult = useCallback((result: { prompt?: string; transcription?: string }) => {
    onSettingsChange(result.prompt || result.transcription || '');
  }, [onSettingsChange]);

  return {
    displayValue,
    badgeType,
    hasEnhancedPrompt,
    userHasSetPrompt: hasSettingsPrompt,
    userHasEditedAfterEnhancement,
    handleChange: onSettingsChange,
    handleClearAll,
    handleClearEnhanced,
    handleVoiceResult,
  };
}
