import { describe, expect, it, vi } from 'vitest';

vi.mock('./params.ts', () => ({
  extractShotAndPosition: vi.fn(() => ({ shotId: null, addInPosition: false })),
}));

const mocks = vi.hoisted(() => ({
  createVariant: vi.fn(),
}));

vi.mock('./generation-core.ts', async () => {
  const actual = await vi.importActual<typeof import('./generation-core.ts')>('./generation-core.ts');
  return {
    ...actual,
    createVariant: (...args: unknown[]) => mocks.createVariant(...args),
  };
});

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

  it('returns the created parent variant id alongside the parent generation id', async () => {
    mocks.createVariant.mockResolvedValue({ id: 'variant-parent-1' });
    const taskUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const taskUpdate = vi.fn().mockReturnValue({ eq: taskUpdateEq });
    const parentSingle = vi.fn().mockResolvedValue({
      data: { id: 'parent-1', project_id: 'project-1' },
      error: null,
    });
    const parentEq = vi.fn().mockReturnValue({ single: parentSingle });
    const parentSelect = vi.fn().mockReturnValue({ eq: parentEq });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'generations') {
          return { select: parentSelect };
        }
        if (table === 'tasks') {
          return { update: taskUpdate };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    await expect(createVariantOnParent(
      supabase as never,
      'parent-1',
      'https://example.com/video.mp4',
      null,
      { params: {}, task_type: 'video_travel' } as never,
      'task-1',
      'travel',
    )).resolves.toMatchObject({
      id: 'parent-1',
      variant_id: 'variant-parent-1',
    });
  });
});
