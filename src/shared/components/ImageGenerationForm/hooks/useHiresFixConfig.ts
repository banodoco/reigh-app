import { useState, useMemo } from 'react';
import type { HiresFixConfig } from '../types';
import { DEFAULT_HIRES_FIX_CONFIG } from '../types';

export function useHiresFixConfig() {
  const [hiresFixConfigRaw, setHiresFixConfig] = useState<Partial<HiresFixConfig>>({});

  // Always merge with defaults to handle incomplete persisted data
  // Also migrate legacy camelCase field names to snake_case
  const hiresFixConfig = useMemo<HiresFixConfig>(() => {
    const raw = hiresFixConfigRaw as Record<string, unknown>;
    // Migrate legacy camelCase fields if present
    const migrated: Partial<HiresFixConfig> = {
      ...hiresFixConfigRaw,
      // Map old camelCase to new snake_case (prefer new names if both exist)
      base_steps: (raw.base_steps as number) ?? (raw.baseSteps as number),
      hires_scale: (raw.hires_scale as number) ?? (raw.hiresScale as number),
      hires_steps: (raw.hires_steps as number) ?? (raw.hiresSteps as number),
      hires_denoise: (raw.hires_denoise as number) ?? (raw.hiresDenoise as number),
      // Migrate from old single lightning_lora_strength to phase_1 (phase_2 defaults to 0)
      lightning_lora_strength_phase_1: (raw.lightning_lora_strength_phase_1 as number)
        ?? (raw.lightning_lora_strength as number)
        ?? (raw.lightningLoraStrength as number),
      lightning_lora_strength_phase_2: (raw.lightning_lora_strength_phase_2 as number),
    };
    return {
      ...DEFAULT_HIRES_FIX_CONFIG,
      ...migrated,
    };
  }, [hiresFixConfigRaw]);

  return { hiresFixConfig, setHiresFixConfig };
}
