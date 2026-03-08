import { useState, useMemo } from 'react';
import { resolveEditModeLoras } from '@/domains/lora/lib/loraUtils';

export type LoraMode = 'none' | 'in-scene' | 'next-scene' | 'custom';

interface UseEditModeLorasReturn {
  // Mode selection for automatic LoRAs
  loraMode: LoraMode;
  setLoraMode: (mode: LoraMode) => void;
  
  // Custom URL support
  customLoraUrl: string;
  setCustomLoraUrl: (url: string) => void;
  
  // The computed LoRAs based on mode
  editModeLoras: Array<{ url: string; strength: number }> | undefined;
  
  // Legacy boolean support for backward compatibility
  isInSceneBoostEnabled: boolean;
  setIsInSceneBoostEnabled: (enabled: boolean) => void;
}

/**
 * Hook to manage LoRA mode state for image editing operations
 * Supports: In-Scene, Next Scene, Custom, or None
 * Used by both inpainting and magic edit modes
 */
export const useEditModeLoras = (): UseEditModeLorasReturn => {
  const [loraMode, setLoraMode] = useState<LoraMode>('none'); // Default to no preset LoRA
  const [customLoraUrl, setCustomLoraUrl] = useState<string>('');

  // Legacy boolean support - map to new lora mode
  const isInSceneBoostEnabled = loraMode !== 'none';
  const setIsInSceneBoostEnabled = (enabled: boolean) => {
    setLoraMode(enabled ? 'in-scene' : 'none');
  };

  // Build loras array based on selected mode
  const editModeLoras = useMemo(
    () => resolveEditModeLoras(loraMode, customLoraUrl),
    [loraMode, customLoraUrl],
  );

  return {
    // Mode selection
    loraMode,
    setLoraMode,
    // Custom URL
    customLoraUrl,
    setCustomLoraUrl,
    // Computed LoRAs
    editModeLoras,
    // Legacy boolean support
    isInSceneBoostEnabled,
    setIsInSceneBoostEnabled,
  };
};
