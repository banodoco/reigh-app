import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { PromptMode } from '../../types';
import type { ShotPromptSettingsContract } from './types';
import { getStoredPromptCount } from './utils';

interface PromptPersistenceInput {
  ready: boolean;
  promptsLength: number;
  effectiveShotId: string;
  setLastKnownPromptCount: Dispatch<SetStateAction<number>>;
  isShotSettingsReady: boolean;
  shotPromptSettings: ShotPromptSettingsContract;
  effectivePromptMode: PromptMode;
}

export function usePromptPersistenceEffects(input: PromptPersistenceInput): void {
  const {
    ready,
    promptsLength,
    effectiveShotId,
    setLastKnownPromptCount,
    isShotSettingsReady,
    shotPromptSettings,
    effectivePromptMode,
  } = input;

  useEffect(() => {
    setLastKnownPromptCount(getStoredPromptCount(effectiveShotId));
  }, [effectiveShotId, setLastKnownPromptCount]);

  useEffect(() => {
    if (!ready || promptsLength <= 0) {
      return;
    }

    try {
      if (typeof window !== 'undefined') {
        const storageKey = `ig:lastPromptCount:${effectiveShotId}`;
        window.sessionStorage.setItem(storageKey, promptsLength.toString());
        window.sessionStorage.setItem('ig:lastPromptCount', promptsLength.toString());
        setLastKnownPromptCount(promptsLength);
      }
    } catch {
      // Ignore sessionStorage errors.
    }
  }, [ready, promptsLength, effectiveShotId, setLastKnownPromptCount]);

  useEffect(() => {
    if (!isShotSettingsReady || shotPromptSettings.status !== 'ready') {
      return;
    }

    try {
      const settingsToSave = {
        masterPrompt: shotPromptSettings.settings.masterPrompt || '',
        promptMode:
          shotPromptSettings.settings.promptMode || effectivePromptMode || 'automated',
      };

      localStorage.setItem(
        'image-gen-last-active-shot-settings',
        JSON.stringify(settingsToSave)
      );
    } catch {
      // Ignore localStorage errors.
    }
  }, [
    isShotSettingsReady,
    shotPromptSettings.status,
    shotPromptSettings.settings.masterPrompt,
    shotPromptSettings.settings.promptMode,
    effectivePromptMode,
  ]);
}
