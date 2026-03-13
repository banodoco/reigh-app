import { describe, expect, it, vi } from 'vitest';

vi.mock('./params.ts', () => ({
  extractShotAndPosition: vi.fn(() => ({ shotId: null, addInPosition: false })),
}));

import { getChildVariantViewedAt, getOrCreateParentGeneration, createVariantOnParent } from './generation-parent.ts';
import { CompletionError } from './errors.ts';

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

  it('throws CompletionError when parent generation resolution fails', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockRejectedValue(new Error('boom')),
          })),
        })),
      })),
    };

    await expect(getOrCreateParentGeneration(
      supabase as never,
      'orch-task-1',
      'project-1',
    )).rejects.toBeInstanceOf(CompletionError);
  });

  it('throws CompletionError when parent generation lookup fails in variant creation', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'missing' } }),
          })),
        })),
      })),
    };

    await expect(createVariantOnParent(
      supabase as never,
      'parent-1',
      'https://example.com/video.mp4',
      null,
      { params: {}, task_type: 'video_travel' } as never,
      'task-1',
      'travel',
    )).rejects.toBeInstanceOf(CompletionError);
  });
});
