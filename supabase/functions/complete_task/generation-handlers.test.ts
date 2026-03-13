import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleVariantCreation,
  handleVariantOnParent,
  handleVariantOnChild,
  handleStandaloneGeneration,
  handleChildGeneration,
} from './generation-handlers.ts';
import { CompletionError } from './errors.ts';

const mocks = vi.hoisted(() => ({
  createVariant: vi.fn(),
  getOrCreateParentGeneration: vi.fn(),
  createVariantOnParent: vi.fn(),
}));

vi.mock('./params.ts', () => ({
  extractShotAndPosition: vi.fn(() => ({ shotId: null, addInPosition: false })),
  buildGenerationParams: vi.fn(() => ({})),
  resolveBasedOn: vi.fn(() => null),
}));

vi.mock('./generation-child.ts', () => ({
  handleChildGeneration: vi.fn(),
  createSingleItemVariant: vi.fn(),
  findExistingGenerationAtPosition: vi.fn(),
  createChildGenerationRecord: vi.fn(),
}));

vi.mock('./generation-core.ts', async () => {
  const actual = await vi.importActual<typeof import('./generation-core.ts')>('./generation-core.ts');
  return {
    ...actual,
    createVariant: (...args: unknown[]) => mocks.createVariant(...args),
    insertGeneration: actual.insertGeneration,
    linkGenerationToShot: actual.linkGenerationToShot,
  };
});

vi.mock('./generation-parent.ts', async () => {
  const actual = await vi.importActual<typeof import('./generation-parent.ts')>('./generation-parent.ts');
  return {
    ...actual,
    getOrCreateParentGeneration: (...args: unknown[]) => mocks.getOrCreateParentGeneration(...args),
    createVariantOnParent: (...args: unknown[]) => mocks.createVariantOnParent(...args),
  };
});

describe('complete_task/generation-handlers exports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports generation handlers', () => {
    expect(handleVariantCreation).toBeTypeOf('function');
    expect(handleVariantOnParent).toBeTypeOf('function');
    expect(handleVariantOnChild).toBeTypeOf('function');
    expect(handleStandaloneGeneration).toBeTypeOf('function');
    expect(handleChildGeneration).toBeTypeOf('function');
  });

  it('throws CompletionError when variant source generation lookup fails', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'missing' } });
    const eq = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq });
    const supabase = {
      from: vi.fn().mockReturnValue({ select }),
    };

    await expect(handleVariantCreation(
      supabase as never,
      'task-1',
      { params: {}, variant_type: 'image' },
      'gen-source',
      'https://example.com/out.png',
      null,
    )).rejects.toBeInstanceOf(CompletionError);
  });

  it('throws CompletionError when a stitched task cannot resolve its parent generation', async () => {
    mocks.getOrCreateParentGeneration.mockResolvedValue(null);
    const logger = { info: vi.fn() };

    await expect(handleVariantOnParent({
      supabase: {} as never,
      taskId: 'task-1',
      taskData: {
        task_type: 'join_final_stitch',
        project_id: 'project-1',
        params: {
          orchestrator_task_id: 'orch-1',
        },
      },
      publicUrl: 'https://example.com/out.mp4',
      thumbnailUrl: null,
      logger,
    } as never)).rejects.toBeInstanceOf(CompletionError);
  });
});
