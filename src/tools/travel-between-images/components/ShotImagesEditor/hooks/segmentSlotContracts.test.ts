import { describe, expect, it } from 'vitest';
import { parseSegmentSlotLocationState } from './segmentSlotContracts';

describe('parseSegmentSlotLocationState', () => {
  it('returns an empty object for non-record input', () => {
    expect(parseSegmentSlotLocationState(null)).toEqual({});
    expect(parseSegmentSlotLocationState('state')).toEqual({});
    expect(parseSegmentSlotLocationState([])).toEqual({});
  });

  it('extracts known string keys and strict fromShotClick boolean', () => {
    const result = parseSegmentSlotLocationState({
      openImageGenerationId: 'gen-1',
      openImageVariantId: 'variant-1',
      openSegmentSlot: 'slot-1',
      fromShotClick: true,
      ignored: 'value',
    });

    expect(result).toEqual({
      openImageGenerationId: 'gen-1',
      openImageVariantId: 'variant-1',
      openSegmentSlot: 'slot-1',
      fromShotClick: true,
    });
  });

  it('drops invalid value shapes when parser cannot coerce them', () => {
    const result = parseSegmentSlotLocationState({
      openImageGenerationId: 123,
      openImageVariantId: false,
      openSegmentSlot: { id: 'x' },
      fromShotClick: 'true',
    });

    expect(result).toEqual({
      openImageGenerationId: undefined,
      openImageVariantId: undefined,
      openSegmentSlot: undefined,
      fromShotClick: false,
    });
  });
});
