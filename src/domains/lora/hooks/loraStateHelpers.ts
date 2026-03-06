import type { ActiveLora } from '@/domains/lora/types/lora';

export function dedupeActiveLoras(loras: ActiveLora[]): ActiveLora[] {
  const uniqueMap = new Map<string, ActiveLora>();
  loras.forEach((lora) => {
    if (!uniqueMap.has(lora.id)) {
      uniqueMap.set(lora.id, lora);
    }
  });
  return Array.from(uniqueMap.values());
}

interface ShouldApplyDefaultsArgs {
  hasEverSetLoras: boolean;
  selectedLoraCount: number;
  persistenceScope: 'project' | 'shot' | 'none';
  persistedLoras?: { id: string; strength: number }[];
}

export function shouldApplyLoraDefaults({
  hasEverSetLoras,
  selectedLoraCount,
  persistenceScope,
  persistedLoras,
}: ShouldApplyDefaultsArgs): boolean {
  if (hasEverSetLoras) {
    return false;
  }

  if (selectedLoraCount > 0) {
    return false;
  }

  if (persistenceScope !== 'none' && persistedLoras) {
    return false;
  }

  return true;
}

export function buildLoraAutoLoadStateKey(
  enableProjectPersistence: boolean,
  hasSavedLoras: boolean,
  selectedLoraCount: number,
  userHasManuallyInteracted: boolean,
): string {
  return `${enableProjectPersistence}-${hasSavedLoras}-${selectedLoraCount}-${userHasManuallyInteracted}`;
}
