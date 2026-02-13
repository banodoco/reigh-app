import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateTask, mockSupabase } = vi.hoisted(() => {
  const mockCreateTask = vi.fn().mockResolvedValue({ id: 'task-123' });
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'parent-gen-123' }, error: null }),
    rpc: vi.fn().mockResolvedValue({ error: null }),
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

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/shared/lib/toolConstants', () => ({
  TOOL_IDS: {
    TRAVEL_BETWEEN_IMAGES: 'travel-between-images',
  },
}));

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'mock-uuid-1234' });

import { createTravelBetweenImagesTask } from '../createTravelBetweenImagesTask';
import { validateTravelBetweenImagesParams, buildTravelBetweenImagesPayload } from '../payloadBuilder';

describe('createTravelBetweenImagesTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReturnThis();
    mockSupabase.insert.mockReturnThis();
    mockSupabase.select.mockReturnThis();
    mockSupabase.single.mockResolvedValue({ data: { id: 'parent-gen-123' }, error: null });
    mockSupabase.rpc.mockResolvedValue({ error: null });
  });

  const baseParams = {
    project_id: 'project-1',
    image_urls: ['https://img1.jpg', 'https://img2.jpg'],
    resolution: '1280x720',
    shot_id: 'shot-1',
  } as any;

  it('validates parameters', async () => {
    await createTravelBetweenImagesTask(baseParams);
    expect(validateTravelBetweenImagesParams).toHaveBeenCalledWith(baseParams);
  });

  it('creates placeholder parent generation when no parent_generation_id', async () => {
    await createTravelBetweenImagesTask(baseParams);

    // Should have inserted a placeholder
    expect(mockSupabase.from).toHaveBeenCalledWith('generations');
    expect(mockSupabase.insert).toHaveBeenCalled();
  });

  it('links parent to shot via RPC', async () => {
    await createTravelBetweenImagesTask(baseParams);

    expect(mockSupabase.rpc).toHaveBeenCalledWith('add_generation_to_shot', {
      p_shot_id: 'shot-1',
      p_generation_id: 'mock-uuid-1234',
      p_with_position: false,
    });
  });

  it('uses existing parent_generation_id when provided', async () => {
    const params = { ...baseParams, parent_generation_id: 'existing-parent' };
    await createTravelBetweenImagesTask(params);

    // Should NOT create a placeholder
    expect(mockSupabase.insert).not.toHaveBeenCalled();
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
    expect(result.parentGenerationId).toBe('mock-uuid-1234');
  });

  it('rethrows errors from validation', async () => {
    vi.mocked(validateTravelBetweenImagesParams).mockImplementationOnce(() => {
      throw new Error('Validation failed');
    });

    await expect(createTravelBetweenImagesTask(baseParams)).rejects.toThrow('Validation failed');
  });

  it('handles parent creation error', async () => {
    mockSupabase.single.mockResolvedValue({
      data: null,
      error: { message: 'Insert failed' },
    });

    await expect(createTravelBetweenImagesTask(baseParams)).rejects.toThrow(
      'Failed to create placeholder parent generation'
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
