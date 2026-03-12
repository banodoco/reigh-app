import { describe, expect, it } from 'vitest';
import {
  parseDayBuckets,
  parseQueuedTasksBreakdownRow,
  parseTaskAvailabilityAnalysis,
  parseUserCapacityStatsRows,
} from './rpcDecoders.ts';

describe('_shared/rpcDecoders', () => {
  it('parses valid RPC payloads into typed success values', () => {
    expect(
      parseDayBuckets([
        {
          date: '2026-03-12',
          images_generated: '3',
          images_edited: 2,
          videos_generated: '1',
        },
      ]),
    ).toMatchObject({
      ok: true,
      value: [
        {
          date: '2026-03-12',
          images_generated: 3,
          images_edited: 2,
          videos_generated: 1,
        },
      ],
    });

    expect(
      parseUserCapacityStatsRows([
        {
          user_id: 'user-1',
          credits: '12',
          queued_tasks: 3,
          in_progress_tasks: '1',
          allows_cloud: true,
          at_limit: false,
        },
      ]),
    ).toMatchObject({
      ok: true,
      value: [
        {
          user_id: 'user-1',
          credits: 12,
          queued_tasks: 3,
          in_progress_tasks: 1,
          allows_cloud: true,
          at_limit: false,
        },
      ],
    });

    expect(
      parseQueuedTasksBreakdownRow({
        claimable_now: '4',
        blocked_by_capacity: 1,
        blocked_by_deps: '2',
        blocked_by_settings: 0,
        total_queued: '7',
      }),
    ).toMatchObject({
      ok: true,
      value: {
        claimable_now: 4,
        blocked_by_capacity: 1,
        blocked_by_deps: 2,
        blocked_by_settings: 0,
        total_queued: 7,
      },
    });

    expect(
      parseTaskAvailabilityAnalysis({
        eligible_count: '5',
        user_info: { allows_cloud: true },
      }),
    ).toMatchObject({
      ok: true,
      value: {
        eligible_count: 5,
        user_info: { allows_cloud: true },
      },
    });
  });

  it('fails closed when required RPC fields are malformed', () => {
    const dayBuckets = parseDayBuckets([{ date: '2026-03-12', images_generated: 'x' }]);
    expect(dayBuckets.ok).toBe(false);
    if (!dayBuckets.ok) {
      expect(dayBuckets.errorCode).toBe('rpc_day_bucket_invalid');
    }

    const capacityRows = parseUserCapacityStatsRows([
      {
        user_id: 'user-1',
        credits: 12,
        queued_tasks: 3,
        in_progress_tasks: 1,
        allows_cloud: 'yes',
        at_limit: false,
      },
    ]);
    expect(capacityRows.ok).toBe(false);
    if (!capacityRows.ok) {
      expect(capacityRows.errorCode).toBe('rpc_user_capacity_row_invalid');
    }

    const breakdown = parseQueuedTasksBreakdownRow({
      claimable_now: 1,
      blocked_by_capacity: 2,
      blocked_by_deps: 3,
      blocked_by_settings: 4,
    });
    expect(breakdown.ok).toBe(false);
    if (!breakdown.ok) {
      expect(breakdown.errorCode).toBe('rpc_task_breakdown_invalid');
    }

    const availability = parseTaskAvailabilityAnalysis({
      eligible_count: 5,
      user_info: null,
    });
    expect(availability.ok).toBe(false);
    if (!availability.ok) {
      expect(availability.errorCode).toBe('rpc_task_availability_invalid');
    }
  });
});
