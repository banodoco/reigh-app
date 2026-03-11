/**
 * ModalsSection - Renders all modals used by ShotSettingsEditor
 *
 * Keeps modal rendering separate from main component logic.
 */

import React from 'react';
import { LoraSelectorModal } from '@/domains/lora/components';
import type { LoraModel } from '@/domains/lora/types/lora';
import { mapSelectedLorasForModal } from '@/shared/components/lora/mapSelectedLorasForModal';
import { SettingsModal } from '@/shared/components/SettingsModal/SettingsModal';
import { useShotSettingsContext } from '../ShotSettingsContext';
import type { ModalSelectedLora } from '../types/modalLora';

interface ModalsSectionProps {
  // LoRA modal
  isLoraModalOpen: boolean;
  onLoraModalClose: () => void;
  onAddLora: (lora: LoraModel, isManualAction?: boolean, initialStrength?: number) => void;
  onRemoveLora: (loraId: string) => void;
  onUpdateLoraStrength: (loraId: string, strength: number) => void;
  selectedLoras: ModalSelectedLora[];

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
        selectedLoras={mapSelectedLorasForModal(selectedLoras, availableLoras)}
        lora_type="Wan 2.1 14b"
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onOpenChange={onSettingsModalOpenChange}
      />
    </>
  );
};
