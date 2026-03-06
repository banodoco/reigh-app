import { useMemo } from 'react';
import { LoraSelectorModal } from '@/domains/lora/components/LoraSelectorModal';
import type { LoraModel } from '@/domains/lora/types/lora';
import type { SegmentSettings } from '../types';

interface AdvancedSettingsLoraModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableLoras: LoraModel[];
  effectiveLoras: NonNullable<SegmentSettings['loras']>;
  onAddLora: (lora: LoraModel) => void;
  onRemoveLora: (loraId: string) => void;
  onUpdateLoraStrength: (loraId: string, strength: number) => void;
}

export function AdvancedSettingsLoraModal({
  isOpen,
  onClose,
  availableLoras,
  effectiveLoras,
  onAddLora,
  onRemoveLora,
  onUpdateLoraStrength,
}: AdvancedSettingsLoraModalProps) {
  const selectedLoras = useMemo(
    () =>
      effectiveLoras.map((lora) => {
        const fullLora = availableLoras.find(
          (candidate) => candidate.id === lora.id || candidate.path === lora.path
        );
        return {
          ...fullLora,
          'Model ID': lora.id,
          Name: lora.name,
          strength: lora.strength,
        } as LoraModel & { strength: number };
      }),
    [availableLoras, effectiveLoras]
  );

  return (
    <LoraSelectorModal
      isOpen={isOpen}
      onClose={onClose}
      loras={availableLoras}
      onAddLora={onAddLora}
      onRemoveLora={onRemoveLora}
      onUpdateLoraStrength={onUpdateLoraStrength}
      selectedLoras={selectedLoras}
      lora_type="Wan I2V"
    />
  );
}
