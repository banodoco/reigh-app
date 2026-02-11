/**
 * Shared types for training-data-helper hooks.
 * Extracted to break the import cycle between useTrainingData and useVideoUrlCache.
 */

export interface TrainingDataBatch {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string | null;
}

export interface TrainingDataVideo {
  id: string;
  originalFilename: string;
  storageLocation: string;
  duration: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string | null;
  userId: string;
  batchId: string;
}

export interface TrainingDataSegment {
  id: string;
  trainingDataId: string;
  startTime: number;
  endTime: number;
  segmentLocation: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string | null;
}
