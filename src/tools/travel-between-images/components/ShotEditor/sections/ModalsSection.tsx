/**
 * ModalsSection - Renders all modals used by ShotSettingsEditor
 *
 * Keeps modal rendering separate from main component logic.
 */

import React from 'react';
import { LoraSelectorModal, LoraModel } from '@/domains/lora/components/LoraSelectorModal';
import SettingsModal from '@/shared/components/SettingsModal/SettingsModal';
import { useShotSettingsContext } from '../ShotSettingsContext';

interface ModalsSectionProps {
  // LoRA modal
  isLoraModalOpen: boolean;
  onLoraModalClose: () => void;
  onAddLora: (lora: LoraModel, isManualAction?: boolean, initialStrength?: number) => void;
  onRemoveLora: (loraId: string) => void;
  onUpdateLoraStrength: (loraId: string, strength: number) => void;
  selectedLoras: Array<{
    id: string;
    name: string;
    strength: number;
    path?: string;
  }>;

  // Settings modal
  isSettingsModalOpen: boolean;
  onSettingsModalOpenChange: (open: boolean) => void;
}

export const ModalsSection: React.FC<ModalsSectionProps> = ({
  isLoraModalOpen,
  onLoraModalClose,
  onAddLora,
  onRemoveLora,
  onUpdateLoraStrength,
  selectedLoras,
  isSettingsModalOpen,
  onSettingsModalOpenChange,
}) => {
  const { availableLoras } = useShotSettingsContext();

  return (
    <>
      <LoraSelectorModal
        isOpen={isLoraModalOpen}
        onClose={onLoraModalClose}
        loras={availableLoras}
        onAddLora={onAddLora}
        onRemoveLora={onRemoveLora}
        onUpdateLoraStrength={onUpdateLoraStrength}
        selectedLoras={selectedLoras.map(lora => {
          const fullLora = availableLoras.find(l => l['Model ID'] === lora.id);
          return {
            ...fullLora,
            "Model ID": lora.id,
            Name: lora.name,
            strength: lora.strength,
          } as LoraModel & { strength: number };
        })}
        lora_type="Wan 2.1 14b"
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onOpenChange={onSettingsModalOpenChange}
      />
    </>
  );
};
