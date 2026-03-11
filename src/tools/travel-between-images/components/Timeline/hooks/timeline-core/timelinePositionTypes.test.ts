import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  PositionStatus,
  UpdateOptions,
  UseTimelinePositionsReturn,
} from './timelinePositionTypes';
import * as timelinePositionTypesModule from './timelinePositionTypes';

describe('timelinePositionTypes', () => {
  it('loads as a type-only module', () => {
    expect(timelinePositionTypesModule).toBeDefined();
    expect(typeof timelinePositionTypesModule).toBe('object');
    expect(Object.keys(timelinePositionTypesModule).length).toBe(0);
  });

  it('keeps the timeline position contracts honest', () => {
    expectTypeOf<PositionStatus>().toMatchTypeOf<
      | { type: 'idle' }
      | { type: 'updating'; operationId: string; description: string }
      | { type: 'error'; message: string; canRetry: boolean }
    >();
    expectTypeOf<UpdateOptions['operation']>().toEqualTypeOf<
      'drag' | 'drop' | 'reorder' | 'reset' | undefined
    >();
    expectTypeOf<NonNullable<UpdateOptions['externalRollback']>>().toMatchTypeOf<() => void>();
    expectTypeOf<UseTimelinePositionsReturn['positions']>().toEqualTypeOf<Map<string, number>>();
    expectTypeOf<UseTimelinePositionsReturn['applyOptimisticPositionUpdate']>()
      .returns.toEqualTypeOf<(() => void) | null>();
    expectTypeOf<UseTimelinePositionsReturn['syncFromDatabase']>()
      .returns.toEqualTypeOf<void>();
  });
});
