import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { ShotLora } from '@/tools/travel-between-images/settings';
import { ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { handleError } from '@/shared/lib/errorHandler';
import { LoraHeaderActions } from '../ui/LoraHeaderActions';
import React from 'react';

interface UseLoRASyncProps {
  // LoRAs from unified shot settings
  selectedLoras: ShotLora[];
  onSelectedLorasChange: (loras: ShotLora[]) => void;

  // Project ID for Save/Load functionality
  projectId?: string;

  // Available loras for lookup
  availableLoras: LoraModel[];

  // Prompt integration
  batchVideoPrompt: string;
  onBatchVideoPromptChange: (prompt: string) => void;
}

export interface LoraManagerReturn {
  // Core state (derived from props)
  selectedLoras: ActiveLora[];
  setSelectedLoras: (loras: ActiveLora[]) => void;

  // Modal state
  isLoraModalOpen: boolean;
  setIsLoraModalOpen: (open: boolean) => void;

  // Core handlers
  handleAddLora: (lora: LoraModel, isManualAction?: boolean, initialStrength?: number) => void;
  handleRemoveLora: (loraId: string) => void;
  handleLoraStrengthChange: (loraId: string, strength: number) => void;

  // Trigger word functionality
  handleAddTriggerWord?: (triggerWord: string) => void;

  // Project-level Save/Load functionality
  handleSaveProjectLoras?: () => Promise<void>;
  handleLoadProjectLoras?: () => Promise<void>;
  hasSavedLoras?: boolean;

  // Render helpers - returns a React node for header actions
  renderHeaderActions?: () => React.ReactNode;
}

export const useLoraSync = ({
  selectedLoras: selectedLorasFromProps,
  onSelectedLorasChange,
  projectId,
  availableLoras,
  batchVideoPrompt,
  onBatchVideoPromptChange,
}: UseLoRASyncProps): { loraManager: LoraManagerReturn } => {

  // Modal state (local only)
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);

  // Save/Load state
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Project-level LoRA settings for Save/Load functionality
  const {
    settings: projectLoraSettings,
    update: updateProjectLoraSettings,
  } = useToolSettings<{
    loras?: { id: string; strength: number }[];
  }>('project-loras', {
    projectId,
    enabled: !!projectId
  });

  // Track latest prompt value for trigger words
  const latestPromptRef = useRef(batchVideoPrompt);
  useEffect(() => {
    latestPromptRef.current = batchVideoPrompt;
  }, [batchVideoPrompt]);

  // Convert ShotLora[] to ActiveLora[] for UI compatibility
  // Memoized to prevent new array reference on every render
  const selectedLoras: ActiveLora[] = useMemo(() =>
    selectedLorasFromProps.map(lora => ({
      id: lora.id,
      name: lora.name,
      path: lora.path,
      strength: lora.strength,
      previewImageUrl: lora.previewImageUrl,
      trigger_word: lora.trigger_word,
    })), [selectedLorasFromProps]);

  // Set selected loras - convert back to ShotLora[] and call parent
  const setSelectedLoras = useCallback((loras: ActiveLora[]) => {
    const shotLoras: ShotLora[] = loras.map(lora => ({
      id: lora.id,
      name: lora.name,
      path: lora.path,
      strength: lora.strength,
      previewImageUrl: lora.previewImageUrl,
      trigger_word: lora.trigger_word,
    }));
    onSelectedLorasChange(shotLoras);
  }, [onSelectedLorasChange]);

  // Add lora handler
  const handleAddLora = useCallback((loraToAdd: LoraModel, _isManualAction = true, initialStrength?: number) => {

    // Check if already exists
    if (selectedLorasFromProps.find(sl => sl.id === loraToAdd["Model ID"])) {
      return;
    }

    if (loraToAdd["Model Files"] && loraToAdd["Model Files"].length > 0) {
      const loraName = loraToAdd.Name !== "N/A" ? loraToAdd.Name : loraToAdd["Model ID"];
      const newLora: ShotLora = {
        id: loraToAdd["Model ID"],
        name: loraName,
        path: loraToAdd["Model Files"][0].url || loraToAdd["Model Files"][0].path,
        strength: initialStrength || 1.0,
        previewImageUrl: loraToAdd.Images && loraToAdd.Images.length > 0
          ? loraToAdd.Images[0].url
          : undefined,
        trigger_word: loraToAdd.trigger_word,
      };
      onSelectedLorasChange([...selectedLorasFromProps, newLora]);
    }
  }, [selectedLorasFromProps, onSelectedLorasChange]);

  // Remove lora handler
  const handleRemoveLora = useCallback((loraIdToRemove: string) => {
    onSelectedLorasChange(selectedLorasFromProps.filter(lora => lora.id !== loraIdToRemove));
  }, [selectedLorasFromProps, onSelectedLorasChange]);

  // Strength change handler
  const handleLoraStrengthChange = useCallback((loraId: string, newStrength: number) => {
    onSelectedLorasChange(
      selectedLorasFromProps.map(lora =>
        lora.id === loraId ? { ...lora, strength: newStrength } : lora
      )
    );
  }, [selectedLorasFromProps, onSelectedLorasChange]);

  // Trigger word functionality
  const handleAddTriggerWord = useCallback((triggerWord: string) => {
    const currentPromptValue = latestPromptRef.current || '';
    const newPrompt = currentPromptValue.trim()
      ? `${currentPromptValue}, ${triggerWord}`
      : triggerWord;

    onBatchVideoPromptChange(newPrompt);
    latestPromptRef.current = newPrompt;
  }, [onBatchVideoPromptChange]);

  // Save current loras to project level
  const handleSaveProjectLoras = useCallback(async () => {
    if (!projectId) return;

    setSaveFlash(true);
    setIsSaving(true);

    try {
      const lorasToSave = selectedLorasFromProps.map(lora => ({
        id: lora.id,
        strength: lora.strength
      }));

      await updateProjectLoraSettings('project', { loras: lorasToSave });

      setSaveFlash(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      handleError(error, { context: 'LoraSync', showToast: false });
      setSaveFlash(false);
    } finally {
      setIsSaving(false);
    }
  }, [projectId, selectedLorasFromProps, updateProjectLoraSettings]);

  // Load saved loras from project level
  const handleLoadProjectLoras = useCallback(async () => {
    const savedLoras = projectLoraSettings?.loras;
    if (!savedLoras || savedLoras.length === 0) return;

    try {
      const lorasToLoad: ShotLora[] = [];

      for (const savedLora of savedLoras) {
        const availableLora = availableLoras.find(lora => lora['Model ID'] === savedLora.id);
        if (availableLora) {
          const loraName = availableLora.Name !== "N/A" ? availableLora.Name : availableLora["Model ID"];
          lorasToLoad.push({
            id: availableLora["Model ID"],
            name: loraName,
            path: availableLora["Model Files"]?.[0]?.url || availableLora["Model Files"]?.[0]?.path || '',
            strength: savedLora.strength,
            previewImageUrl: availableLora.Images?.[0]?.url,
            trigger_word: availableLora.trigger_word,
          });
        } else {
          console.warn(`LoRA ${savedLora.id} not found in available LoRAs`);
        }
      }

      onSelectedLorasChange(lorasToLoad);
    } catch (error) {
      handleError(error, { context: 'LoraSync', showToast: false });
    }
  }, [projectLoraSettings?.loras, availableLoras, onSelectedLorasChange]);

  // Check if there are saved LoRAs
  const hasSavedLoras = !!(projectLoraSettings?.loras && projectLoraSettings.loras.length > 0);

  // Header actions render function - uses extracted component
  const renderHeaderActions = useCallback(() => {
    return (
      <LoraHeaderActions
        hasSavedLoras={hasSavedLoras}
        onSave={handleSaveProjectLoras}
        onLoad={handleLoadProjectLoras}
        selectedLorasCount={selectedLorasFromProps.length}
        isSaving={isSaving}
        saveSuccess={saveSuccess}
        saveFlash={saveFlash}
        savedLoras={projectLoraSettings?.loras}
      />
    );
  }, [
    hasSavedLoras,
    handleLoadProjectLoras,
    handleSaveProjectLoras,
    selectedLorasFromProps.length,
    isSaving,
    saveSuccess,
    saveFlash,
    projectLoraSettings?.loras
  ]);

  return {
    loraManager: {
      selectedLoras,
      setSelectedLoras,
      isLoraModalOpen,
      setIsLoraModalOpen,
      handleAddLora,
      handleRemoveLora,
      handleLoraStrengthChange,
      handleAddTriggerWord,
      handleSaveProjectLoras,
      handleLoadProjectLoras,
      hasSavedLoras,
      renderHeaderActions,
    },
  };
};
