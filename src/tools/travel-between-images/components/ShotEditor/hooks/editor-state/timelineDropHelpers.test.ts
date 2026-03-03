import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cropImagesToShotAspectRatio,
  fetchNextAvailableFrameForShot,
  persistTimelinePositions,
} from './timelineDropHelpers';

const mocks = vi.hoisted(() => {
  const state = {
    selectOrderResults: [] as Array<{ data: unknown; error: unknown }>,
    selectInResults: [] as Array<{ data: unknown; error: unknown }>,
    updateResults: [] as Array<{ error: unknown }>,
    updatePayloads: [] as unknown[],
    updateIds: [] as string[],
  };

  return {
    state,
    normalizeAndPresentError: vi.fn(),
    cropImageToProjectAspectRatio: vi.fn(),
    parseRatio: vi.fn(),
    isVideoShotGenerations: vi.fn(),
    ensureUniqueFrame: vi.fn(),
    calculateNextAvailableFrameSync: vi.fn(),
    supabaseClient: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => state.selectOrderResults.shift() ?? { data: null, error: null }),
            in: vi.fn(async () => state.selectInResults.shift() ?? { data: null, error: null }),
          })),
        })),
        update: vi.fn((payload: unknown) => ({
          eq: vi.fn(async (_field: string, id: string) => {
            state.updatePayloads.push(payload);
            state.updateIds.push(id);
            return state.updateResults.shift() ?? { error: null };
          }),
        })),
      })),
    },
  };
});

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

vi.mock('@/shared/lib/media/imageCropper', () => ({
  cropImageToProjectAspectRatio: (...args: unknown[]) => mocks.cropImageToProjectAspectRatio(...args),
}));

vi.mock('@/shared/lib/media/aspectRatios', () => ({
  parseRatio: (...args: unknown[]) => mocks.parseRatio(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => mocks.supabaseClient,
}));

vi.mock('@/shared/lib/typeGuards', () => ({
  isVideoShotGenerations: (...args: unknown[]) => mocks.isVideoShotGenerations(...args),
}));

vi.mock('@/shared/lib/timelinePositionCalculator', () => ({
  ensureUniqueFrame: (...args: unknown[]) => mocks.ensureUniqueFrame(...args),
  calculateNextAvailableFrame: (...args: unknown[]) => mocks.calculateNextAvailableFrameSync(...args),
}));

describe('timelineDropHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.selectOrderResults = [];
    mocks.state.selectInResults = [];
    mocks.state.updateResults = [];
    mocks.state.updatePayloads = [];
    mocks.state.updateIds = [];
  });

  it('crops files using resolved aspect ratio when enabled', async () => {
    const original = new File(['a'], 'a.png', { type: 'image/png' });
    const cropped = new File(['b'], 'cropped.png', { type: 'image/png' });
    mocks.parseRatio.mockReturnValue(1.5);
    mocks.cropImageToProjectAspectRatio.mockResolvedValue({ croppedFile: cropped });

    const result = await cropImagesToShotAspectRatio(
      [original],
      { id: 'shot-1', aspect_ratio: '3:2' } as never,
      'project-1',
      [{ id: 'project-1', aspectRatio: '16:9' }] as never,
      { cropToProjectSize: true },
    );

    expect(mocks.parseRatio).toHaveBeenCalledWith('3:2');
    expect(mocks.cropImageToProjectAspectRatio).toHaveBeenCalledWith(original, 1.5);
    expect(result).toEqual([cropped]);
  });

  it('falls back to original file and reports cropping errors', async () => {
    const original = new File(['x'], 'x.png', { type: 'image/png' });
    mocks.parseRatio.mockReturnValue(1.2);
    mocks.cropImageToProjectAspectRatio.mockRejectedValue(new Error('crop failed'));

    const result = await cropImagesToShotAspectRatio(
      [original],
      { id: 'shot-1', aspect_ratio: '6:5' } as never,
      'project-1',
      [{ id: 'project-1' }] as never,
      undefined,
    );

    expect(result).toEqual([original]);
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'ImageCrop', showToast: false }),
    );
  });

  it('fetches unique target frame while filtering out videos and invalid positions', async () => {
    mocks.state.selectOrderResults.push({
      data: [
        { generation: { type: 'image' }, timeline_frame: 10 },
        { generation: { type: 'video' }, timeline_frame: 999 },
        { generation: { type: 'image' }, timeline_frame: 20 },
        { generation: { type: 'image' }, timeline_frame: -1 },
      ],
      error: null,
    });
    mocks.isVideoShotGenerations.mockImplementation((row: { generation?: { type?: string } }) => row.generation?.type === 'video');
    mocks.ensureUniqueFrame.mockReturnValue(30);

    const frame = await fetchNextAvailableFrameForShot('shot-1', 20);

    expect(mocks.ensureUniqueFrame).toHaveBeenCalledWith(20, [10, 20]);
    expect(frame).toBe(30);
  });

  it('calculates next available frame when no explicit target is provided', async () => {
    mocks.state.selectOrderResults.push({
      data: [
        { generation: { type: 'image' }, timeline_frame: 5 },
        { generation: { type: 'image' }, timeline_frame: 55 },
      ],
      error: null,
    });
    mocks.isVideoShotGenerations.mockReturnValue(false);
    mocks.calculateNextAvailableFrameSync.mockReturnValue(105);

    const frame = await fetchNextAvailableFrameForShot('shot-1', undefined);

    expect(mocks.calculateNextAvailableFrameSync).toHaveBeenCalledWith([5, 55]);
    expect(frame).toBe(105);
  });

  it('persists timeline positions and verifies update writes', async () => {
    mocks.state.selectInResults.push({
      data: [
        { id: 'sg-1', generation_id: 'g1', timeline_frame: null },
        { id: 'sg-2', generation_id: 'g2', timeline_frame: null },
      ],
      error: null,
    });
    mocks.state.updateResults.push({ error: null }, { error: null });
    mocks.state.selectInResults.push({ data: [], error: null });

    await persistTimelinePositions('shot-1', ['g1', 'g2'], 100, 25);

    expect(mocks.state.updatePayloads).toEqual([
      { timeline_frame: 100 },
      { timeline_frame: 125 },
    ]);
    expect(mocks.state.updateIds).toEqual(['sg-1', 'sg-2']);
  });

  it('throws when position updates fail', async () => {
    mocks.state.selectInResults.push({
      data: [{ id: 'sg-1', generation_id: 'g1', timeline_frame: null }],
      error: null,
    });
    mocks.state.updateResults.push({ error: { message: 'update failed' } });

    await expect(
      persistTimelinePositions('shot-1', ['g1'], 0, 10),
    ).rejects.toThrow('Failed to update 1 position(s)');
  });
});
