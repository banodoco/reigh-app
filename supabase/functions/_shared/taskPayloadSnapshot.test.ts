import { describe, expect, it } from 'vitest';
import {
  buildTaskPayloadSnapshot,
  resolveSnapshotBasedOn,
  resolveSnapshotChildGenerationId,
  resolveSnapshotChildOrder,
  resolveSnapshotIsSingleItem,
  resolveSnapshotParentGenerationId,
} from './taskPayloadSnapshot.ts';

describe('_shared/taskPayloadSnapshot', () => {
  it('falls back orchestrator details to full payload when direct details are missing', () => {
    const snapshot = buildTaskPayloadSnapshot({
      full_orchestrator_payload: {
        parent_generation_id: 'parent-from-full',
      },
    });

    expect(snapshot.orchestratorDetails).toEqual({
      parent_generation_id: 'parent-from-full',
    });
  });

  it('resolves based_on with canonical precedence order', () => {
    const snapshot = buildTaskPayloadSnapshot({
      orchestration_contract: {
        based_on: 'based-on-contract',
      },
      based_on: 'based-on-raw',
      orchestrator_details: {
        based_on: 'based-on-details',
      },
    });

    expect(resolveSnapshotBasedOn(snapshot)).toBe('based-on-contract');
  });

  it('resolves child and parent generation ids across fallback paths', () => {
    const snapshot = buildTaskPayloadSnapshot({
      child_generation_id: 'child-raw',
      full_orchestrator_payload: {
        parent_generation_id: 'parent-full',
      },
    });

    expect(resolveSnapshotChildGenerationId(snapshot)).toBe('child-raw');
    expect(resolveSnapshotParentGenerationId(snapshot)).toBe('parent-full');
  });

  it('resolves child order from child_order then segment_index fallback', () => {
    expect(resolveSnapshotChildOrder(buildTaskPayloadSnapshot({
      child_order: 3,
      segment_index: 9,
    }))).toBe(3);

    expect(resolveSnapshotChildOrder(buildTaskPayloadSnapshot({
      segment_index: 4,
    }))).toBe(4);
  });

  it('resolves is_single_item from explicit flag, then first/last segment fallback', () => {
    expect(resolveSnapshotIsSingleItem(buildTaskPayloadSnapshot({
      orchestration_contract: {
        is_single_item: true,
      },
    }))).toBe(true);

    expect(resolveSnapshotIsSingleItem(buildTaskPayloadSnapshot({
      is_first_segment: true,
      is_last_segment: true,
    }))).toBe(true);

    expect(resolveSnapshotIsSingleItem(buildTaskPayloadSnapshot({
      is_first_segment: true,
      is_last_segment: false,
    }))).toBe(false);
  });
});
