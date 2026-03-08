/**
 * usePromptManagement - Manages prompts, master prompt, and prompt mode
 */

import { useMemo, useState } from 'react';
import { usePromptHandlers } from './promptManagement/usePromptHandlers';
import { usePromptIdDedupEffect } from './promptManagement/usePromptIdDedupEffect';
import { usePromptInitializationEffect } from './promptManagement/usePromptInitializationEffect';
import { usePromptPersistenceEffects } from './promptManagement/usePromptPersistenceEffects';
import { usePromptRouting } from './promptManagement/usePromptRouting';
import type {
  PromptManagementInput,
  PromptManagementOutput,
} from './promptManagement/types';
import { getStoredPromptCount } from './promptManagement/storedPromptCount';

;

export function usePromptManagement(
  input: PromptManagementInput
): PromptManagementOutput {
  const {
    associatedShotId,
    effectiveShotId,
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
    ready,
    markAsInteracted,
    generatePromptId,
    promptIdCounter,
  } = input;

  const [lastKnownPromptCount, setLastKnownPromptCount] = useState<number>(() =>
    getStoredPromptCount(effectiveShotId)
  );

  const isShotSettingsReady = useMemo(() => {
    if (!associatedShotId) {
      return false;
    }

    const settingsForCurrentShot = shotPromptSettings.entityId === associatedShotId;
    return (
      settingsForCurrentShot &&
      (shotPromptSettings.status === 'ready' || shotPromptSettings.status === 'saving')
    );
  }, [associatedShotId, shotPromptSettings.entityId, shotPromptSettings.status]);

  const routing = usePromptRouting({
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
  });

  usePromptPersistenceEffects({
    ready,
    promptsLength: routing.prompts.length,
    effectiveShotId,
    setLastKnownPromptCount,
    isShotSettingsReady,
    shotPromptSettings,
    effectivePromptMode: routing.effectivePromptMode,
  });

  usePromptInitializationEffect({
    associatedShotId,
    shotPromptSettings,
    noShotPrompts,
    setNoShotPrompts,
    generatePromptId,
  });

  usePromptIdDedupEffect({
    prompts: routing.prompts,
    setPrompts: routing.setPrompts,
    promptIdCounter,
  });

  const {
    handleAddPrompt,
    handleUpdatePrompt,
    handleRemovePrompt,
    handleDeleteAllPrompts,
    handleSavePromptsFromModal,
  } = usePromptHandlers({
    prompts: routing.prompts,
    setPrompts: routing.setPrompts,
    markAsInteracted,
    generatePromptId,
  });

  const actionablePromptsCount = useMemo(
    () => routing.prompts.filter((prompt) => prompt.fullPrompt.trim() !== '').length,
    [routing.prompts]
  );

  return {
    prompts: routing.prompts,
    masterPromptText: routing.masterPromptText,
    effectivePromptMode: routing.effectivePromptMode,
    currentBeforePromptText: routing.currentBeforePromptText,
    currentAfterPromptText: routing.currentAfterPromptText,
    isShotSettingsReady,
    actionablePromptsCount,
    lastKnownPromptCount,
    setPrompts: routing.setPrompts,
    setMasterPromptText: routing.setMasterPromptText,
    setEffectivePromptMode: routing.setEffectivePromptMode,
    setCurrentBeforePromptText: routing.setCurrentBeforePromptText,
    setCurrentAfterPromptText: routing.setCurrentAfterPromptText,
    handleAddPrompt,
    handleUpdatePrompt,
    handleRemovePrompt,
    handleDeleteAllPrompts,
    handleSavePromptsFromModal,
  };
}
