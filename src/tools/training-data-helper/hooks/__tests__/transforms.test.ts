import { describe, it, expect } from 'vitest';
import { transformBatch, transformVideo, transformSegment } from '../transforms';

describe('transformBatch', () => {
  it('transforms a DB batch row to camelCase client type', () => {
    const dbRow = {
      id: 'batch-1',
      user_id: 'user-1',
      name: 'Test Batch',
      description: 'A test batch',
      metadata: { key: 'value' },
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-02T00:00:00Z',
    };

    const result = transformBatch(dbRow);

    expect(result).toEqual({
      id: 'batch-1',
      userId: 'user-1',
      name: 'Test Batch',
      description: 'A test batch',
      metadata: { key: 'value' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
    });
  });

  it('handles null description', () => {
    const dbRow = {
      id: 'batch-2',
      user_id: 'user-1',
      name: 'No Description',
      description: null,
      metadata: {},
      created_at: '2025-01-01T00:00:00Z',
      updated_at: null,
    };

    const result = transformBatch(dbRow);

    expect(result.description).toBeNull();
    expect(result.updatedAt).toBeNull();
  });
});

describe('transformVideo', () => {
  it('transforms a DB video row to camelCase client type', () => {
    const dbRow = {
      id: 'video-1',
      original_filename: 'test.mp4',
      storage_location: 'user1/test.mp4',
      duration: 120,
      metadata: { size: 1024, type: 'video/mp4' },
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-02T00:00:00Z',
      user_id: 'user-1',
      batch_id: 'batch-1',
    };

    const result = transformVideo(dbRow);

    expect(result).toEqual({
      id: 'video-1',
      originalFilename: 'test.mp4',
      storageLocation: 'user1/test.mp4',
      duration: 120,
      metadata: { size: 1024, type: 'video/mp4' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
      userId: 'user-1',
      batchId: 'batch-1',
    });
  });

  it('handles null duration', () => {
    const dbRow = {
      id: 'video-2',
      original_filename: 'no-duration.mp4',
      storage_location: 'user1/no-duration.mp4',
      duration: null,
      metadata: {},
      created_at: '2025-01-01T00:00:00Z',
      updated_at: null,
      user_id: 'user-1',
      batch_id: 'batch-1',
    };

    const result = transformVideo(dbRow);

    expect(result.duration).toBeNull();
  });
});

describe('transformSegment', () => {
  it('transforms a DB segment row to camelCase client type', () => {
    const dbRow = {
      id: 'seg-1',
      training_data_id: 'video-1',
      start_time: 0,
      end_time: 5000,
      segment_location: 'segments/seg-1.mp4',
      description: 'First segment',
      metadata: { duration: 5000 },
      created_at: '2025-01-01T00:00:00Z',
      updated_at: null,
    };

    const result = transformSegment(dbRow);

    expect(result).toEqual({
      id: 'seg-1',
      trainingDataId: 'video-1',
      startTime: 0,
      endTime: 5000,
      segmentLocation: 'segments/seg-1.mp4',
      description: 'First segment',
      metadata: { duration: 5000 },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: null,
    });
  });

  it('handles null segment_location and description', () => {
    const dbRow = {
      id: 'seg-2',
      training_data_id: 'video-1',
      start_time: 1000,
      end_time: 3000,
      segment_location: null,
      description: null,
      metadata: {},
      created_at: '2025-01-01T00:00:00Z',
      updated_at: null,
    };

    const result = transformSegment(dbRow);

    expect(result.segmentLocation).toBeNull();
    expect(result.description).toBeNull();
  });

  it('preserves numeric time values exactly', () => {
    const dbRow = {
      id: 'seg-3',
      training_data_id: 'video-1',
      start_time: 12345,
      end_time: 67890,
      segment_location: null,
      description: null,
      metadata: {},
      created_at: '2025-01-01T00:00:00Z',
      updated_at: null,
    };

    const result = transformSegment(dbRow);

    expect(result.startTime).toBe(12345);
    expect(result.endTime).toBe(67890);
  });
});
