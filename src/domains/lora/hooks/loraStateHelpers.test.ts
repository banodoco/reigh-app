import { describe, expect, it } from 'vitest';
import type { ActiveLora } from '@/domains/lora/types/lora';
import {
  buildLoraAutoLoadStateKey,
  dedupeActiveLoras,
  shouldApplyLoraDefaults,
} from './loraStateHelpers';

describe('loraStateHelpers', () => {
  it('deduplicates active loras by id while preserving first occurrence', () => {
    const loras = [
      { id: 'lora-1', strength: 0.7 },
      { id: 'lora-2', strength: 0.5 },
      { id: 'lora-1', strength: 0.9 },
    ] as ActiveLora[];

    expect(dedupeActiveLoras(loras)).toEqual([
      { id: 'lora-1', strength: 0.7 },
      { id: 'lora-2', strength: 0.5 },
    ]);
  });

  it('applies defaults only when the user has not set loras and no persisted selection exists', () => {
    expect(shouldApplyLoraDefaults({
      hasEverSetLoras: false,
      selectedLoraCount: 0,
      persistenceScope: 'none',
      persistedLoras: undefined,
    })).toBe(true);

    expect(shouldApplyLoraDefaults({
      hasEverSetLoras: true,
      selectedLoraCount: 0,
      persistenceScope: 'none',
      persistedLoras: undefined,
    })).toBe(false);

    expect(shouldApplyLoraDefaults({
      hasEverSetLoras: false,
      selectedLoraCount: 2,
      persistenceScope: 'none',
      persistedLoras: undefined,
    })).toBe(false);

    expect(shouldApplyLoraDefaults({
      hasEverSetLoras: false,
      selectedLoraCount: 0,
      persistenceScope: 'project',
      persistedLoras: [{ id: 'persisted', strength: 0.4 }],
    })).toBe(false);
  });

  it('builds a stable auto-load state key', () => {
    expect(buildLoraAutoLoadStateKey(true, false, 3, true)).toBe('true-false-3-true');
  });
});
