import { useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { PromptEntry, PromptMode } from '../../types';
import type { PromptRoutingResult, ShotPromptSettingsContract } from './types';
import { usePromptTextRouting } from './usePromptTextRouting';

interface PromptRoutingInput {
  associatedShotId: string | null;
  isShotSettingsReady: boolean;
  shotPromptSettings: ShotPromptSettingsContract;
  noShotPrompts: PromptEntry[];
  setNoShotPrompts: Dispatch<SetStateAction<PromptEntry[]>>;
  noShotMasterPrompt: string;
  setNoShotMasterPrompt: Dispatch<SetStateAction<string>>;
  promptMode: PromptMode;
  setPromptMode: Dispatch<SetStateAction<PromptMode>>;
  beforeEachPromptText: string;
  setBeforeEachPromptText: Dispatch<SetStateAction<string>>;
  afterEachPromptText: string;
  setAfterEachPromptText: Dispatch<SetStateAction<string>>;
  markAsInteracted: () => void;
}

export function usePromptRouting(input: PromptRoutingInput): PromptRoutingResult {
  const {
    associatedShotId,
    isShotSettingsReady,
    shotPromptSettings,
    noShotPrompts,
    setNoShotPrompts,
    noShotMasterPrompt,
    setNoShotMasterPrompt,
    promptMode,
    setPromptMode,
    beforeEachPromptText,
    setBeforeEachPromptText,
    afterEachPromptText,
    setAfterEachPromptText,
    markAsInteracted,
  } = input;

  const prompts = useMemo(() => {
    if (!associatedShotId) {
      return noShotPrompts;
    }

    return isShotSettingsReady ? shotPromptSettings.settings.prompts || [] : [];
  }, [associatedShotId, isShotSettingsReady, shotPromptSettings.settings.prompts, noShotPrompts]);

  const setPrompts = useCallback(
    (newPrompts: PromptEntry[] | ((prev: PromptEntry[]) => PromptEntry[])) => {
      if (associatedShotId) {
        const currentPrompts = shotPromptSettings.settings.prompts || [];
        const updatedPrompts =
          typeof newPrompts === 'function' ? newPrompts(currentPrompts) : newPrompts;

        shotPromptSettings.updateField('prompts', updatedPrompts);
        markAsInteracted();
        return;
      }

      setNoShotPrompts((prev) =>
        typeof newPrompts === 'function' ? newPrompts(prev) : newPrompts
      );
      markAsInteracted();
    },
    [associatedShotId, shotPromptSettings, markAsInteracted, setNoShotPrompts]
  );

  const masterPromptText = useMemo(() => {
    if (!associatedShotId) {
      return noShotMasterPrompt;
    }

    return isShotSettingsReady ? shotPromptSettings.settings.masterPrompt || '' : '';
  }, [associatedShotId, isShotSettingsReady, shotPromptSettings.settings.masterPrompt, noShotMasterPrompt]);

  const setMasterPromptText: Dispatch<SetStateAction<string>> = useCallback(
    (newTextOrUpdater) => {
      if (associatedShotId) {
        const currentText = shotPromptSettings.settings.masterPrompt || '';
        const newText =
          typeof newTextOrUpdater === 'function'
            ? newTextOrUpdater(currentText)
            : newTextOrUpdater;

        shotPromptSettings.updateField('masterPrompt', newText);
        markAsInteracted();
        return;
      }

      setNoShotMasterPrompt(newTextOrUpdater);
      markAsInteracted();
    },
    [associatedShotId, shotPromptSettings, markAsInteracted, setNoShotMasterPrompt]
  );

  const effectivePromptMode = useMemo<PromptMode>(() => {
    if (!associatedShotId) {
      return promptMode;
    }

    return isShotSettingsReady
      ? shotPromptSettings.settings.promptMode || 'automated'
      : 'automated';
  }, [associatedShotId, isShotSettingsReady, shotPromptSettings.settings.promptMode, promptMode]);

  const setEffectivePromptMode = useCallback(
    (mode: PromptMode) => {
      if (associatedShotId) {
        shotPromptSettings.updateField('promptMode', mode);
        markAsInteracted();
        return;
      }

      setPromptMode(mode);
    },
    [associatedShotId, shotPromptSettings, markAsInteracted, setPromptMode]
  );

  const {
    currentBeforePromptText,
    setCurrentBeforePromptText,
    currentAfterPromptText,
    setCurrentAfterPromptText,
  } = usePromptTextRouting({
    associatedShotId,
    isShotSettingsReady,
    shotPromptSettings,
    beforeEachPromptText,
    setBeforeEachPromptText,
    afterEachPromptText,
    setAfterEachPromptText,
    markAsInteracted,
  });

  return {
    prompts,
    setPrompts,
    masterPromptText,
    setMasterPromptText,
    effectivePromptMode,
    setEffectivePromptMode,
    currentBeforePromptText,
    setCurrentBeforePromptText,
    currentAfterPromptText,
    setCurrentAfterPromptText,
  };
}
