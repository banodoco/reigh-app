import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateTask, mockSupabase } = vi.hoisted(() => {
  const mockCreateTask = vi.fn().mockResolvedValue({ id: 'task-123' });
  const mockSupabase = {
    rpc: vi.fn().mockResolvedValue({ data: 'parent-gen-123', error: null }),
  };
  return { mockCreateTask, mockSupabase };
});

vi.mock('../../../taskCreation', () => ({
  resolveProjectResolution: vi.fn().mockResolvedValue({ resolution: '1280x720' }),
  generateTaskId: vi.fn().mockReturnValue('task-id-123'),
  generateRunId: vi.fn().mockReturnValue('run-id-456'),
  createTask: mockCreateTask,
}));

vi.mock('../payloadBuilder', () => ({
  validateTravelBetweenImagesParams: vi.fn(),
  buildTravelBetweenImagesPayload: vi.fn().mockReturnValue({ payload: true }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase,
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/shared/lib/toolIds', () => ({
  TOOL_IDS: {
    TRAVEL_BETWEEN_IMAGES: 'travel-between-images',
  },
}));

import { createTravelBetweenImagesTask } from '../createTravelBetweenImagesTask';
import { validateTravelBetweenImagesParams } from '../payloadBuilder';

describe('createTravelBetweenImagesTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.rpc.mockResolvedValue({ data: 'parent-gen-123', error: null });
  });

  const baseParams = {
    project_id: 'project-1',
    image_urls: ['https://img1.jpg', 'https://img2.jpg'],
    resolution: '1280x720',
    shot_id: 'shot-1',
  } as unknown;

  it('validates parameters', async () => {
    await createTravelBetweenImagesTask(baseParams);
    expect(validateTravelBetweenImagesParams).toHaveBeenCalledWith(baseParams);
  });

  it('ensures a canonical parent generation when no parent_generation_id', async () => {
    await createTravelBetweenImagesTask(baseParams);

    expect(mockSupabase.rpc).toHaveBeenCalledWith('ensure_shot_parent_generation', {
      p_shot_id: 'shot-1',
      p_project_id: 'project-1',
    });
  });

  it('uses existing parent_generation_id when provided', async () => {
    const params = { ...baseParams, parent_generation_id: 'existing-parent' };
    await createTravelBetweenImagesTask(params);

    // Should NOT call ensure RPC when parent is already provided
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('calls createTask with correct task type', async () => {
    await createTravelBetweenImagesTask(baseParams);

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'project-1',
        task_type: 'travel_orchestrator',
      })
    );
  });

  it('uses wan_2_2_i2v task type for turbo mode', async () => {
    await createTravelBetweenImagesTask({ ...baseParams, turbo_mode: true });

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        task_type: 'wan_2_2_i2v',
      })
    );
  });

  it('returns task result and parent generation ID', async () => {
    const result = await createTravelBetweenImagesTask(baseParams);

    expect(result.task).toEqual({ id: 'task-123' });
    expect(result.parentGenerationId).toBe('parent-gen-123');
  });

  it('rethrows errors from validation', async () => {
    vi.mocked(validateTravelBetweenImagesParams).mockImplementationOnce(() => {
      throw new Error('Validation failed');
    });

    await expect(createTravelBetweenImagesTask(baseParams)).rejects.toThrow('Validation failed');
  });

  it('handles parent ensure error', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'RPC failed' },
    });

    await expect(createTravelBetweenImagesTask(baseParams)).rejects.toThrow(
      'Failed to ensure parent generation for shot shot-1: RPC failed'
    );
  });

  it('throws when neither parent_generation_id nor shot_id is provided', async () => {
    const params = { ...baseParams, shot_id: undefined, parent_generation_id: undefined };
    await expect(createTravelBetweenImagesTask(params)).rejects.toThrow(
      'parent_generation_id is required when shot_id is missing'
    );
  });

  it('includes generation_name in params when provided', async () => {
    await createTravelBetweenImagesTask({ ...baseParams, generation_name: 'My Video' });

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          generation_name: 'My Video',
        }),
      })
    );
  });
});
