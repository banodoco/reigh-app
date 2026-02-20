import { useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ShotPromptSettingsContract } from './types';

interface PromptTextRoutingInput {
  associatedShotId: string | null;
  isShotSettingsReady: boolean;
  shotPromptSettings: ShotPromptSettingsContract;
  beforeEachPromptText: string;
  setBeforeEachPromptText: Dispatch<SetStateAction<string>>;
  afterEachPromptText: string;
  setAfterEachPromptText: Dispatch<SetStateAction<string>>;
  markAsInteracted: () => void;
}

interface PromptTextRoutingOutput {
  currentBeforePromptText: string;
  setCurrentBeforePromptText: (text: string) => void;
  currentAfterPromptText: string;
  setCurrentAfterPromptText: (text: string) => void;
}

export function usePromptTextRouting(
  input: PromptTextRoutingInput
): PromptTextRoutingOutput {
  const {
    associatedShotId,
    isShotSettingsReady,
    shotPromptSettings,
    beforeEachPromptText,
    setBeforeEachPromptText,
    afterEachPromptText,
    setAfterEachPromptText,
    markAsInteracted,
  } = input;

  const currentBeforePromptText = useMemo(() => {
    if (!associatedShotId) {
      return beforeEachPromptText;
    }

    return isShotSettingsReady
      ? shotPromptSettings.settings.beforeEachPromptText ?? ''
      : '';
  }, [
    associatedShotId,
    isShotSettingsReady,
    shotPromptSettings.settings.beforeEachPromptText,
    beforeEachPromptText,
  ]);

  const setCurrentBeforePromptText = useCallback(
    (text: string) => {
      if (associatedShotId) {
        shotPromptSettings.updateField('beforeEachPromptText', text);
        markAsInteracted();
        return;
      }

      setBeforeEachPromptText(text);
    },
    [associatedShotId, shotPromptSettings, markAsInteracted, setBeforeEachPromptText]
  );

  const currentAfterPromptText = useMemo(() => {
    if (!associatedShotId) {
      return afterEachPromptText;
    }

    return isShotSettingsReady ? shotPromptSettings.settings.afterEachPromptText ?? '' : '';
  }, [
    associatedShotId,
    isShotSettingsReady,
    shotPromptSettings.settings.afterEachPromptText,
    afterEachPromptText,
  ]);

  const setCurrentAfterPromptText = useCallback(
    (text: string) => {
      if (associatedShotId) {
        shotPromptSettings.updateField('afterEachPromptText', text);
        markAsInteracted();
        return;
      }

      setAfterEachPromptText(text);
    },
    [associatedShotId, shotPromptSettings, markAsInteracted, setAfterEachPromptText]
  );

  return {
    currentBeforePromptText,
    setCurrentBeforePromptText,
    currentAfterPromptText,
    setCurrentAfterPromptText,
  };
}
