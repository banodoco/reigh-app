import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { mapSelectedLorasForModal } from '@/shared/components/lora/mapSelectedLorasForModal';
import { LoraSelectorModal } from '@/domains/lora/components/LoraSelectorModal';
import { ActiveLoRAsDisplay } from '@/domains/lora/components/ActiveLoRAsDisplay';
import { useLoraManager } from '@/domains/lora/hooks/useLoraManager';
import type { LoraModel } from '@/domains/lora/types/lora';
import type { LoraManagerOptions, LoraManagerState } from '@/domains/lora/types/loraManager';

interface LoraManagerProps extends LoraManagerOptions {
  availableLoras: LoraModel[];
  className?: string;
  title?: string;
  addButtonText?: string;
  fullWidth?: boolean;
  externalLoraManager?: LoraManagerState;
}

export const LoraManager: React.FC<LoraManagerProps> = ({
  availableLoras,
  className = "",
  title = "LoRA Models",
  addButtonText = "Add or manage LoRAs",
  fullWidth = true,
  externalLoraManager,
  ...options
}) => {
  const internalLoraManager = useLoraManager(availableLoras, options);
  const loraManager = externalLoraManager ?? internalLoraManager;

  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="font-light text-sm">{title}</h3>

      <Button
        type="button"
        variant="outline"
        className={fullWidth ? "w-full" : ""}
        onClick={() => loraManager.setIsLoraModalOpen(true)}
      >
        {addButtonText}
      </Button>

      <ActiveLoRAsDisplay
        selectedLoras={loraManager.selectedLoras}
        onRemoveLora={loraManager.handleRemoveLora}
        onLoraStrengthChange={loraManager.handleLoraStrengthChange}
        availableLoras={availableLoras}
        className="mt-4"
        onAddTriggerWord={loraManager.handleAddTriggerWord}
        renderHeaderActions={loraManager.renderHeaderActions}
      />

      <LoraSelectorModal
        isOpen={loraManager.isLoraModalOpen}
        onClose={() => loraManager.setIsLoraModalOpen(false)}
        loras={availableLoras}
        onAddLora={loraManager.handleAddLora}
        onRemoveLora={loraManager.handleRemoveLora}
        onUpdateLoraStrength={loraManager.handleLoraStrengthChange}
        selectedLoras={mapSelectedLorasForModal(loraManager.selectedLoras, availableLoras)}
        lora_type="Wan 2.1 14b"
      />
    </div>
  );
};
