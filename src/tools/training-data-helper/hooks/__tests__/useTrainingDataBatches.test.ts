import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockOrder = vi.fn();
const mockGetUser = vi.fn();
const mockToastError = vi.fn();
const mockHandleError = vi.fn();

// Set up chainable mock
function setupChain() {
  mockSingle.mockResolvedValue({ data: null, error: null });
  mockEq.mockReturnValue({ select: mockSelect, single: mockSingle });
  mockOrder.mockReturnValue({ data: [], error: null });
  mockSelect.mockReturnValue({ order: mockOrder, eq: mockEq, single: mockSingle });
  mockInsert.mockReturnValue({ select: mockSelect });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockDelete.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  });
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getUser: () => mockGetUser(),
    },
  },
}));

vi.mock('@/shared/components/ui/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: (...args: unknown[]) => mockHandleError(...args),
}));

import { useTrainingDataBatches } from '../useTrainingDataBatches';

describe('useTrainingDataBatches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupChain();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('returns initial state with empty batches', () => {
    const { result } = renderHook(() =>
      useTrainingDataBatches({ videos: [] }),
    );

    expect(result.current.batches).toEqual([]);
    expect(result.current.selectedBatchId).toBeNull();
  });

  it('fetchBatches loads batches from supabase', async () => {
    const mockBatches = [
      {
        id: 'b1',
        user_id: 'user-1',
        name: 'Batch 1',
        description: null,
        metadata: {},
        created_at: '2025-01-01T00:00:00Z',
        updated_at: null,
      },
      {
        id: 'b2',
        user_id: 'user-1',
        name: 'Batch 2',
        description: 'desc',
        metadata: {},
        created_at: '2025-01-02T00:00:00Z',
        updated_at: null,
      },
    ];

    mockOrder.mockResolvedValue({ data: mockBatches, error: null });

    const { result } = renderHook(() =>
      useTrainingDataBatches({ videos: [] }),
    );

    await act(async () => {
      await result.current.fetchBatches();
    });

    expect(result.current.batches).toHaveLength(2);
    expect(result.current.batches[0].name).toBe('Batch 1');
    // Auto-selects first batch
    expect(result.current.selectedBatchId).toBe('b1');
  });

  it('createBatch inserts a new batch and selects it', async () => {
    const newBatch = {
      id: 'b-new',
      user_id: 'user-1',
      name: 'New Batch',
      description: 'A new batch',
      metadata: {},
      created_at: '2025-01-03T00:00:00Z',
      updated_at: null,
    };

    mockSingle.mockResolvedValue({ data: newBatch, error: null });

    const { result } = renderHook(() =>
      useTrainingDataBatches({ videos: [] }),
    );

    let batchId = '';
    await act(async () => {
      batchId = await result.current.createBatch('New Batch', 'A new batch');
    });

    expect(batchId).toBe('b-new');
    expect(result.current.batches).toHaveLength(1);
    expect(result.current.batches[0].name).toBe('New Batch');
    expect(result.current.selectedBatchId).toBe('b-new');
  });

  it('createBatch throws when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { result } = renderHook(() =>
      useTrainingDataBatches({ videos: [] }),
    );

    await expect(
      act(async () => {
        await result.current.createBatch('Test');
      }),
    ).rejects.toThrow('User not authenticated');
  });

  it('updateBatch updates an existing batch', async () => {
    // First, set up initial batches
    const initialBatches = [
      {
        id: 'b1',
        user_id: 'user-1',
        name: 'Original Name',
        description: null,
        metadata: {},
        created_at: '2025-01-01T00:00:00Z',
        updated_at: null,
      },
    ];
    mockOrder.mockResolvedValue({ data: initialBatches, error: null });

    const { result } = renderHook(() =>
      useTrainingDataBatches({ videos: [] }),
    );

    await act(async () => {
      await result.current.fetchBatches();
    });

    // Now update the batch
    const updatedBatch = {
      id: 'b1',
      user_id: 'user-1',
      name: 'Updated Name',
      description: 'New description',
      metadata: {},
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-03T00:00:00Z',
    };
    mockSingle.mockResolvedValue({ data: updatedBatch, error: null });

    await act(async () => {
      await result.current.updateBatch('b1', {
        name: 'Updated Name',
        description: 'New description',
      });
    });

    expect(result.current.batches[0].name).toBe('Updated Name');
    expect(result.current.batches[0].description).toBe('New description');
  });

  it('deleteBatch prevents deletion when batch has videos', async () => {
    const videos = [
      {
        id: 'v1',
        batchId: 'b1',
        originalFilename: 'test.mp4',
        storageLocation: 'path/test.mp4',
        duration: null,
        metadata: {},
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: null,
        userId: 'user-1',
      },
    ];

    const { result } = renderHook(() =>
      useTrainingDataBatches({ videos: videos as any }),
    );

    await act(async () => {
      await result.current.deleteBatch('b1');
    });

    expect(mockToastError).toHaveBeenCalledWith(
      'Cannot delete batch with videos. Please delete all videos first.',
    );
    expect(mockFrom).not.toHaveBeenCalledWith('training_data_batches');
  });

  it('deleteBatch removes empty batch and selects next', async () => {
    // Set up two batches
    const batchesData = [
      {
        id: 'b1',
        user_id: 'user-1',
        name: 'Batch 1',
        description: null,
        metadata: {},
        created_at: '2025-01-01T00:00:00Z',
        updated_at: null,
      },
      {
        id: 'b2',
        user_id: 'user-1',
        name: 'Batch 2',
        description: null,
        metadata: {},
        created_at: '2025-01-02T00:00:00Z',
        updated_at: null,
      },
    ];
    mockOrder.mockResolvedValue({ data: batchesData, error: null });

    // For the delete operation
    mockEq.mockReturnValue(Promise.resolve({ error: null }));

    const { result } = renderHook(() =>
      useTrainingDataBatches({ videos: [] }),
    );

    await act(async () => {
      await result.current.fetchBatches();
    });

    expect(result.current.selectedBatchId).toBe('b1');

    await act(async () => {
      await result.current.deleteBatch('b1');
    });

    expect(result.current.batches).toHaveLength(1);
    expect(result.current.batches[0].id).toBe('b2');
    // Should select the remaining batch
    expect(result.current.selectedBatchId).toBe('b2');
  });

  it('setSelectedBatchId updates the selected batch', () => {
    const { result } = renderHook(() =>
      useTrainingDataBatches({ videos: [] }),
    );

    act(() => {
      result.current.setSelectedBatchId('b1');
    });

    expect(result.current.selectedBatchId).toBe('b1');
  });

  it('fetchBatches does not overwrite selectedBatchId if already set', async () => {
    const mockBatches = [
      {
        id: 'b1',
        user_id: 'user-1',
        name: 'Batch 1',
        description: null,
        metadata: {},
        created_at: '2025-01-01T00:00:00Z',
        updated_at: null,
      },
    ];
    mockOrder.mockResolvedValue({ data: mockBatches, error: null });

    const { result } = renderHook(() =>
      useTrainingDataBatches({ videos: [] }),
    );

    // Pre-set a batch ID
    act(() => {
      result.current.setSelectedBatchId('b-existing');
    });

    await act(async () => {
      await result.current.fetchBatches();
    });

    // Should keep the pre-set batch ID
    expect(result.current.selectedBatchId).toBe('b-existing');
  });

  it('fetchBatches handles errors gracefully', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'Network error' } });

    const { result } = renderHook(() =>
      useTrainingDataBatches({ videos: [] }),
    );

    await act(async () => {
      await result.current.fetchBatches();
    });

    expect(mockHandleError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        context: 'useTrainingData.fetchBatches',
      }),
    );
  });
});
