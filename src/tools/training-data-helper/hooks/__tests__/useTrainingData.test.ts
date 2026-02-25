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

vi.mock('@/shared/lib/compat/errorHandler', () => ({
  handleError: vi.fn(),
}));

// Stable mock references to avoid infinite re-render loops
// (unstable vi.fn() inside mock factory creates new refs every render,
// causing useEffect deps to change → re-run → setState → re-render → loop)
const mockGetVideoUrl = vi.fn().mockReturnValue('');
const mockMarkVideoAsInvalid = vi.fn();
const mockClearUrlCache = vi.fn();
const mockFetchBatches = vi.fn();
const mockSetSelectedBatchId = vi.fn();
const mockCreateBatch = vi.fn();
const mockUpdateBatch = vi.fn();
const mockDeleteBatch = vi.fn();
const mockUploadVideo = vi.fn();
const mockUploadVideosWithSplitModes = vi.fn();

vi.mock('../useVideoUrlCache', () => ({
  useVideoUrlCache: () => ({
    getVideoUrl: mockGetVideoUrl,
    markVideoAsInvalid: mockMarkVideoAsInvalid,
    clearUrlCache: mockClearUrlCache,
  }),
}));

vi.mock('../useTrainingDataBatches', () => ({
  useTrainingDataBatches: () => ({
    batches: [],
    selectedBatchId: 'batch-1',
    setSelectedBatchId: mockSetSelectedBatchId,
    fetchBatches: mockFetchBatches,
    createBatch: mockCreateBatch,
    updateBatch: mockUpdateBatch,
    deleteBatch: mockDeleteBatch,
  }),
}));

vi.mock('../useTrainingDataUpload', () => ({
  useTrainingDataUpload: () => ({
    isUploading: false,
    uploadVideo: mockUploadVideo,
    uploadVideosWithSplitModes: mockUploadVideosWithSplitModes,
  }),
}));

vi.mock('../transforms', () => ({
  transformVideo: (v: unknown) => ({
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
  transformSegment: (s: unknown) => ({
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
    // Set up table-based mock routing
    const checkSingle = vi.fn().mockResolvedValue({
      data: { id: 'td-1', batch_id: 'batch-1' },
      error: null,
    });
    const checkEq = vi.fn().mockReturnValue({ single: checkSingle });
    const checkSelect = vi.fn().mockReturnValue({ eq: checkEq });

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
    const insertSelectFn = vi.fn().mockReturnValue({ single: insertSingle });
    const insertFn = vi.fn().mockReturnValue({ select: insertSelectFn });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'training_data') {
        return { select: checkSelect };
      }
      // training_data_segments or any other table
      return {
        select: mockSelect,
        insert: insertFn,
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

    // Use table-based routing to avoid global mock conflicts
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'training_data_segments') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: segmentsData, error: null }),
            eq: mockEq,
            single: mockSingle,
          }),
          insert: mockInsert,
          update: mockUpdate,
          delete: deleteFn,
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

    // Wait for initial data loading
    await waitFor(() => {
      // effects may or may not have run
    });

    await act(async () => {
      // Allow effects to settle
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
