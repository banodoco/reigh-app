/**
 * DB-to-client transform functions for training data entities.
 * Pure functions: snake_case DB rows -> camelCase client types.
 */
import type { TrainingDataBatch, TrainingDataVideo, TrainingDataSegment } from './types';
import type { Json } from '@/integrations/supabase/types';

function toRecord(value: Json): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

// Database types (snake_case, matching Supabase row shapes)
interface TrainingDataBatchDB {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string | null;
}

interface TrainingDataVideoDB {
  id: string;
  original_filename: string;
  storage_location: string;
  duration: number | null;
  metadata: Json;
  created_at: string;
  updated_at: string | null;
  user_id: string;
  batch_id: string | null;
}

interface TrainingDataSegmentDB {
  id: string;
  training_data_id: string;
  start_time: number;
  end_time: number;
  segment_location: string | null;
  description: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string | null;
}

export const transformBatch = (batch: TrainingDataBatchDB): TrainingDataBatch => ({
  id: batch.id,
  userId: batch.user_id,
  name: batch.name,
  description: batch.description,
  metadata: toRecord(batch.metadata),
  createdAt: batch.created_at,
  updatedAt: batch.updated_at,
});

export const transformVideo = (video: TrainingDataVideoDB): TrainingDataVideo => ({
  id: video.id,
  originalFilename: video.original_filename,
  storageLocation: video.storage_location,
  duration: video.duration,
  metadata: toRecord(video.metadata),
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
  metadata: toRecord(segment.metadata),
  createdAt: segment.created_at,
  updatedAt: segment.updated_at,
});
