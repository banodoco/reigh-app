import { describe, expect, it, vi } from 'vitest';
import { getChildVariantViewedAt, getOrCreateParentGeneration, createVariantOnParent } from './generation-parent.ts';

describe('generation-parent', () => {
  it('returns timestamp immediately for explicit single-segment flag', async () => {
    const viewedAt = await getChildVariantViewedAt({} as never, {
      taskParams: { _isSingleSegmentCase: true },
    });

    expect(viewedAt).toBeTypeOf('string');
  });

  it('returns null when no parent source is available', async () => {
    const viewedAt = await getChildVariantViewedAt({} as never, {});
    expect(viewedAt).toBeNull();
  });

  it('returns null when parent generation resolution throws', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockRejectedValue(new Error('boom')),
          })),
        })),
      })),
    };

    const result = await getOrCreateParentGeneration(
      supabase as never,
      'orch-task-1',
      'project-1',
    );

    expect(result).toBeNull();
  });

  it('returns null when parent generation lookup fails in variant creation', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'missing' } }),
          })),
        })),
      })),
    };

    const result = await createVariantOnParent(
      supabase as never,
      'parent-1',
      'https://example.com/video.mp4',
      null,
      { params: {}, task_type: 'video_travel' } as never,
      'task-1',
      'travel',
    );

    expect(result).toBeNull();
  });
});
