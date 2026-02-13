/**
 * DB-to-client transform functions for training data entities.
 * Pure functions: snake_case DB rows -> camelCase client types.
 */
import type { TrainingDataBatch, TrainingDataVideo, TrainingDataSegment } from './types';

// Database types (snake_case, matching Supabase row shapes)
interface TrainingDataBatchDB {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
}

interface TrainingDataVideoDB {
  id: string;
  original_filename: string;
  storage_location: string;
  duration: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
  user_id: string;
  batch_id: string;
}

interface TrainingDataSegmentDB {
  id: string;
  training_data_id: string;
  start_time: number;
  end_time: number;
  segment_location: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
}

export const transformBatch = (batch: TrainingDataBatchDB): TrainingDataBatch => ({
  id: batch.id,
  userId: batch.user_id,
  name: batch.name,
  description: batch.description,
  metadata: batch.metadata,
  createdAt: batch.created_at,
  updatedAt: batch.updated_at,
});

export const transformVideo = (video: TrainingDataVideoDB): TrainingDataVideo => ({
  id: video.id,
  originalFilename: video.original_filename,
  storageLocation: video.storage_location,
  duration: video.duration,
  metadata: video.metadata,
  createdAt: video.created_at,
  updatedAt: video.updated_at,
  userId: video.user_id,
  batchId: video.batch_id,
});

export const transformSegment = (segment: TrainingDataSegmentDB): TrainingDataSegment => ({
  id: segment.id,
  trainingDataId: segment.training_data_id,
  startTime: segment.start_time,
  endTime: segment.end_time,
  segmentLocation: segment.segment_location,
  description: segment.description,
  metadata: segment.metadata,
  createdAt: segment.created_at,
  updatedAt: segment.updated_at,
});
