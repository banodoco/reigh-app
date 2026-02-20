import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { SHOT_FILTER } from '@/shared/constants/filterConstants';
import type { PromptEntry } from '../../types';
import type { ShotPromptSettingsContract } from './types';

interface PromptInitializationInput {
  associatedShotId: string | null;
  shotPromptSettings: ShotPromptSettingsContract;
  noShotPrompts: PromptEntry[];
  setNoShotPrompts: Dispatch<SetStateAction<PromptEntry[]>>;
  generatePromptId: () => string;
}

export function usePromptInitializationEffect(input: PromptInitializationInput): void {
  const {
    associatedShotId,
    shotPromptSettings,
    noShotPrompts,
    setNoShotPrompts,
    generatePromptId,
  } = input;

  const initializedEntitiesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const entityKey = associatedShotId || SHOT_FILTER.NO_SHOT;

    if (initializedEntitiesRef.current.has(entityKey)) {
      return;
    }

    const settingsForCurrentShot = shotPromptSettings.entityId === associatedShotId;
    if (
      associatedShotId &&
      (shotPromptSettings.status !== 'ready' || !settingsForCurrentShot)
    ) {
      return;
    }

    const currentPrompts = associatedShotId
      ? shotPromptSettings.settings.prompts
      : noShotPrompts;

    if (!currentPrompts || currentPrompts.length === 0) {
      initializedEntitiesRef.current.add(entityKey);

      const timeoutId = setTimeout(() => {
        const emptyPrompt = {
          id: generatePromptId(),
          fullPrompt: '',
          shortPrompt: '',
        };

        if (associatedShotId) {
          shotPromptSettings.updateField('prompts', [emptyPrompt]);
        } else {
          setNoShotPrompts([emptyPrompt]);
        }
      }, 50);

      return () => clearTimeout(timeoutId);
    }

    initializedEntitiesRef.current.add(entityKey);
  }, [
    associatedShotId,
    shotPromptSettings.status,
    shotPromptSettings.entityId,
    shotPromptSettings,
    noShotPrompts,
    setNoShotPrompts,
    generatePromptId,
  ]);
}
