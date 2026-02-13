import { describe, it, expect } from 'vitest';
import { getTaskVariantId } from '../getTaskVariantId';
import type { GenerationRow } from '@/types/shots';

describe('getTaskVariantId', () => {
  it('returns explicitVariantId when provided', () => {
    const gen = { id: 'gen-1' } as GenerationRow;
    expect(getTaskVariantId(gen, 'explicit-variant')).toBe('explicit-variant');
  });

  it('returns _variant_id from generation when no explicit ID', () => {
    const gen = { id: 'gen-1', _variant_id: 'variant-from-gen' } as GenerationRow & { _variant_id: string };
    expect(getTaskVariantId(gen)).toBe('variant-from-gen');
  });

  it('prefers explicitVariantId over _variant_id', () => {
    const gen = { id: 'gen-1', _variant_id: 'variant-from-gen' } as GenerationRow & { _variant_id: string };
    expect(getTaskVariantId(gen, 'explicit')).toBe('explicit');
  });

  it('returns undefined when generation is null', () => {
    expect(getTaskVariantId(null)).toBeUndefined();
  });

  it('returns undefined when generation is undefined', () => {
    expect(getTaskVariantId(undefined)).toBeUndefined();
  });

  it('returns undefined when generation has no _variant_id and no explicit ID', () => {
    const gen = { id: 'gen-1' } as GenerationRow;
    expect(getTaskVariantId(gen)).toBeUndefined();
  });

  it('treats empty string explicitVariantId as falsy', () => {
    const gen = { id: 'gen-1', _variant_id: 'from-gen' } as GenerationRow & { _variant_id: string };
    expect(getTaskVariantId(gen, '')).toBe('from-gen');
  });

  it('treats null explicitVariantId as falsy', () => {
    const gen = { id: 'gen-1', _variant_id: 'from-gen' } as GenerationRow & { _variant_id: string };
    expect(getTaskVariantId(gen, null)).toBe('from-gen');
  });
});
