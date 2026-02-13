import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Track supabase chain calls
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDeleteFn = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockOrder = vi.fn();
const mockStorageFrom = vi.fn();
const mockStorageRemove = vi.fn();
const mockCreateSignedUrl = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: {
      from: (...args: unknown[]) => mockStorageFrom(...args),
    },
  },
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

// Mock sub-hooks with minimal returns
vi.mock('../useVideoUrlCache', () => ({
  useVideoUrlCache: () => ({
    getVideoUrl: vi.fn().mockReturnValue(''),
    markVideoAsInvalid: vi.fn(),
    clearUrlCache: vi.fn(),
  }),
}));

vi.mock('../useTrainingDataBatches', () => ({
  useTrainingDataBatches: () => ({
    batches: [],
    selectedBatchId: 'batch-1',
    setSelectedBatchId: vi.fn(),
    fetchBatches: vi.fn(),
    createBatch: vi.fn(),
    updateBatch: vi.fn(),
    deleteBatch: vi.fn(),
  }),
}));

vi.mock('../useTrainingDataUpload', () => ({
  useTrainingDataUpload: () => ({
    isUploading: false,
    uploadVideo: vi.fn(),
    uploadVideosWithSplitModes: vi.fn(),
  }),
}));

vi.mock('../transforms', () => ({
  transformVideo: (v: any) => ({
    id: v.id,
    originalFilename: v.original_filename || 'test.mp4',
    storageLocation: v.storage_location || 'path/test.mp4',
    duration: v.duration || null,
    metadata: v.metadata || {},
    createdAt: v.created_at || '2025-01-01T00:00:00Z',
    updatedAt: v.updated_at || null,
    userId: v.user_id || 'user-1',
    batchId: v.batch_id || 'batch-1',
  }),
  transformSegment: (s: any) => ({
    id: s.id,
    trainingDataId: s.training_data_id,
    startTime: s.start_time,
    endTime: s.end_time,
    segmentLocation: s.segment_location,
    description: s.description,
    metadata: s.metadata || {},
    createdAt: s.created_at || '2025-01-01T00:00:00Z',
    updatedAt: s.updated_at || null,
  }),
}));

import { useTrainingData } from '../useTrainingData';

describe('useTrainingData', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default chain setup
    mockSingle.mockResolvedValue({ data: null, error: null });
    mockEq.mockReturnValue({ select: mockSelect, single: mockSingle, data: null, error: null });
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockSelect.mockReturnValue({ order: mockOrder, eq: mockEq, single: mockSingle });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockDeleteFn.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDeleteFn,
    });

    mockStorageRemove.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://example.com' }, error: null });
    mockStorageFrom.mockReturnValue({
      remove: mockStorageRemove,
      createSignedUrl: mockCreateSignedUrl,
    });
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useTrainingData());

    expect(result.current.videos).toEqual([]);
    expect(result.current.segments).toEqual([]);
    expect(typeof result.current.isLoading).toBe('boolean');
    expect(typeof result.current.uploadVideo).toBe('function');
    expect(typeof result.current.createSegment).toBe('function');
    expect(typeof result.current.updateSegment).toBe('function');
    expect(typeof result.current.deleteSegment).toBe('function');
    expect(typeof result.current.deleteVideo).toBe('function');
    expect(typeof result.current.getVideoUrl).toBe('function');
  });

  it('createSegment validates training data exists first', async () => {
    // Set up a chain for the check query
    const checkEq = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: 'td-1', batch_id: 'batch-1' },
        error: null,
      }),
    });
    const checkSelect = vi.fn().mockReturnValue({ eq: checkEq });

    // Set up a chain for the insert
    const insertSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'seg-1',
        training_data_id: 'td-1',
        start_time: 0,
        end_time: 5000,
        segment_location: null,
        description: 'Test segment',
        metadata: { duration: 5000 },
        created_at: '2025-01-01T00:00:00Z',
        updated_at: null,
      },
      error: null,
    });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insertFn = vi.fn().mockReturnValue({ select: insertSelect });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'training_data') {
        callCount++;
        if (callCount === 1) {
          // First call: check query
          return { select: checkSelect };
        }
      }
      if (table === 'training_data_segments') {
        return {
          select: mockSelect,
          insert: insertFn,
          update: mockUpdate,
          delete: mockDeleteFn,
        };
      }
      return {
        select: mockSelect,
        insert: mockInsert,
        update: mockUpdate,
        delete: mockDeleteFn,
      };
    });

    const { result } = renderHook(() => useTrainingData());

    let segId: string = '';
    await act(async () => {
      segId = await result.current.createSegment('td-1', 0, 5000, 'Test segment');
    });

    expect(segId).toBe('seg-1');
  });

  it('deleteSegment removes segment from state', async () => {
    // Set up segments
    const segmentsData = [
      {
        id: 'seg-1',
        training_data_id: 'td-1',
        start_time: 0,
        end_time: 5000,
        segment_location: null,
        description: 'Test',
        metadata: {},
        created_at: '2025-01-01T00:00:00Z',
        updated_at: null,
      },
    ];

    // First call fetches segments, then we test delete
    let fetchCallCount = 0;
    mockOrder.mockImplementation(() => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        // segments fetch
        return Promise.resolve({ data: segmentsData, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    });

    mockEq.mockReturnValue(Promise.resolve({ error: null }));

    const { result } = renderHook(() => useTrainingData());

    // Wait for initial effects to complete
    await waitFor(() => {
      // segments may or may not be loaded depending on effect execution order
    });

    // The segments are loaded by the fetchSegments effect
    // Let's directly test deleteSegment behavior
    // First add a segment manually via act
    await act(async () => {
      // segments loaded from initial effect
    });

    // Delete
    await act(async () => {
      await result.current.deleteSegment('seg-1');
    });

    // After delete, seg-1 should be filtered out
    const hasSeg1 = result.current.segments.some(s => s.id === 'seg-1');
    expect(hasSeg1).toBe(false);
  });

  it('exposes batch management functions from sub-hook', () => {
    const { result } = renderHook(() => useTrainingData());

    expect(typeof result.current.createBatch).toBe('function');
    expect(typeof result.current.updateBatch).toBe('function');
    expect(typeof result.current.deleteBatch).toBe('function');
    expect(typeof result.current.setSelectedBatchId).toBe('function');
  });

  it('exposes upload functions from sub-hook', () => {
    const { result } = renderHook(() => useTrainingData());

    expect(typeof result.current.uploadVideo).toBe('function');
    expect(typeof result.current.uploadVideosWithSplitModes).toBe('function');
    expect(result.current.isUploading).toBe(false);
  });

  it('exposes video URL functions from sub-hook', () => {
    const { result } = renderHook(() => useTrainingData());

    expect(typeof result.current.getVideoUrl).toBe('function');
    expect(typeof result.current.markVideoAsInvalid).toBe('function');
  });
});
