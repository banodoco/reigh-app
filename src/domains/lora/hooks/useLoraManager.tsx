import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import type { ActiveLora, LoraModel } from '@/domains/lora/types/lora';
import type { LoraManagerOptions, LoraManagerState } from '@/domains/lora/types/loraManager';
import { dedupeActiveLoras, shouldApplyLoraDefaults } from './loraStateHelpers';
import { useLoraPersistence } from './loraPersistence';


const EMPTY_ACTIVE_LORAS: ActiveLora[] = [];

export const useLoraManager = (
  availableLoras: LoraModel[] = [],
  options: LoraManagerOptions = {},
): LoraManagerState => {
  const {
    projectId,
    shotId,
    selectedLoras: controlledSelectedLoras,
    onSelectedLorasChange,
    persistenceScope = 'none',
    enableProjectPersistence = false,
    persistenceKey = 'loras',
    enableTriggerWords = false,
    onPromptUpdate,
    currentPrompt = '',
    disableAutoLoad = false,
  } = options;

  const isControlledSelection = !!(controlledSelectedLoras && onSelectedLorasChange);
  const [internalSelectedLoras, setInternalSelectedLoras] = useState<ActiveLora[]>([]);
  const selectedLoras = useMemo(
    () => (isControlledSelection
      ? (controlledSelectedLoras ?? EMPTY_ACTIVE_LORAS)
      : internalSelectedLoras),
    [controlledSelectedLoras, internalSelectedLoras, isControlledSelection],
  );

  const [hasEverSetLoras, setHasEverSetLoras] = useState(false);
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);

  const setSelectedLoras = useCallback((loras: ActiveLora[]) => {
    if (isControlledSelection) {
      onSelectedLorasChange?.(loras);
      return;
    }
    setInternalSelectedLoras(loras);
  }, [isControlledSelection, onSelectedLorasChange]);

  useEffect(() => {
    if (selectedLoras.length <= 1) {
      return;
    }
    const deduped = dedupeActiveLoras(selectedLoras);
    if (deduped.length !== selectedLoras.length) {
      setSelectedLoras(deduped);
    }
  }, [selectedLoras, setSelectedLoras]);

  const selectedLorasRef = useRef(selectedLoras);
  useEffect(() => {
    selectedLorasRef.current = selectedLoras;
  }, [selectedLoras]);

  const markAsUserSet = useCallback(() => {
    setHasEverSetLoras(true);
  }, []);

  const latestPromptRef = useRef(currentPrompt);
  useEffect(() => {
    latestPromptRef.current = currentPrompt;
  }, [currentPrompt]);

  const handleAddLora = useCallback((loraToAdd: LoraModel, isManualAction = true, initialStrength?: number) => {
    if (selectedLorasRef.current.find((selectedLora) => selectedLora.id === loraToAdd['Model ID'])) {
      return;
    }

    if (!loraToAdd['Model Files'] || loraToAdd['Model Files'].length === 0) {
      toast.error('Selected LoRA has no model file specified.');
      return;
    }

    const loraName = loraToAdd.Name !== 'N/A' ? loraToAdd.Name : loraToAdd['Model ID'];
    const hasHighNoise = !!loraToAdd.high_noise_url;
    const hasLowNoise = !!loraToAdd.low_noise_url;
    const isMultiStage = hasHighNoise || hasLowNoise;
    const primaryPath = isMultiStage
      ? (loraToAdd.high_noise_url || loraToAdd.low_noise_url)
      : (loraToAdd['Model Files'][0].url || loraToAdd['Model Files'][0].path);

    if (!primaryPath) {
      toast.error('Selected LoRA has no valid model URL.');
      return;
    }

    const newLora: ActiveLora = {
      id: loraToAdd['Model ID'],
      name: loraName,
      path: (hasHighNoise ? loraToAdd.high_noise_url : primaryPath) ?? primaryPath,
      strength: initialStrength || 1.0,
      previewImageUrl: loraToAdd.Images && loraToAdd.Images.length > 0
        ? loraToAdd.Images[0].url
        : undefined,
      trigger_word: loraToAdd.trigger_word,
      lowNoisePath: hasLowNoise ? loraToAdd.low_noise_url : undefined,
      isMultiStage,
    };

    setSelectedLoras([...selectedLorasRef.current, newLora]);
    if (isManualAction) {
      markAsUserSet();
    }
  }, [markAsUserSet, setSelectedLoras]);

  const handleRemoveLora = useCallback((loraIdToRemove: string, isManualAction = true) => {
    const loraToRemove = selectedLorasRef.current.find((lora) => lora.id === loraIdToRemove);
    if (!loraToRemove) {
      return;
    }

    setSelectedLoras(selectedLorasRef.current.filter((lora) => lora.id !== loraIdToRemove));
    if (isManualAction) {
      markAsUserSet();
    }
  }, [markAsUserSet, setSelectedLoras]);

  const handleLoraStrengthChange = useCallback((loraId: string, newStrength: number) => {
    setSelectedLoras(
      selectedLorasRef.current.map((lora) => (
        lora.id === loraId ? { ...lora, strength: newStrength } : lora
      )),
    );
    markAsUserSet();
  }, [markAsUserSet, setSelectedLoras]);

  const handleAddTriggerWord = useCallback((triggerWord: string) => {
    if (!enableTriggerWords || !onPromptUpdate) {
      return;
    }

    const prompt = latestPromptRef.current || '';
    const newPrompt = prompt.trim() ? `${prompt}, ${triggerWord}` : triggerWord;
    onPromptUpdate(newPrompt);
    latestPromptRef.current = newPrompt;
  }, [enableTriggerWords, onPromptUpdate]);

  const {
    persistenceSettings,
    isSavingLoras,
    hasSavedLoras,
    saveSuccess,
    saveFlash,
    handleSaveProjectLoras,
    handleLoadProjectLoras,
    renderHeaderActions,
  } = useLoraPersistence({
    projectId,
    shotId,
    persistenceScope,
    persistenceKey,
    disableAutoLoad,
    enableProjectPersistence,
    manager: {
      selectedLoras,
      selectedLorasRef,
      availableLoras,
      handleAddLora,
      handleRemoveLora,
      handleLoraStrengthChange,
      markAsUserSet,
      setHasEverSetLoras,
    },
  });

  const shouldApplyDefaults = useMemo(() => shouldApplyLoraDefaults({
    hasEverSetLoras,
    selectedLoraCount: selectedLoras.length,
    persistenceScope,
    persistedLoras: persistenceSettings?.loras,
  }), [hasEverSetLoras, selectedLoras.length, persistenceScope, persistenceSettings?.loras]);

  return {
    selectedLoras,
    setSelectedLoras,
    isLoraModalOpen,
    setIsLoraModalOpen,
    handleAddLora,
    handleRemoveLora,
    handleLoraStrengthChange,
    hasEverSetLoras,
    shouldApplyDefaults,
    markAsUserSet,
    ...(enableTriggerWords && { handleAddTriggerWord }),
    ...(enableProjectPersistence && {
      handleSaveProjectLoras,
      handleLoadProjectLoras,
      hasSavedLoras,
      isSavingLoras,
      saveSuccess,
      saveFlash,
      renderHeaderActions,
    }),
  };
};
