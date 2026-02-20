import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { useVideoUrlCache } from './useVideoUrlCache';
import { useTrainingDataBatches } from './useTrainingDataBatches';
import { useTrainingDataUpload } from './useTrainingDataUpload';
import { transformVideo, transformSegment } from './transforms';
import type { TrainingDataVideo, TrainingDataSegment } from './types';

// Re-export client types so existing consumers keep working
export type { TrainingDataBatch, TrainingDataVideo, TrainingDataSegment } from './types';

function roundTime(value: number): number {
  return Math.round(value);
}

async function fetchTrainingVideos(selectedBatchId: string | null): Promise<TrainingDataVideo[]> {
  let query = supabase
    .from('training_data')
    .select('*')
    .order('created_at', { ascending: false });

  if (selectedBatchId) {
    query = query.eq('batch_id', selectedBatchId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(transformVideo);
}

async function fetchTrainingSegments(): Promise<TrainingDataSegment[]> {
  const { data, error } = await supabase
    .from('training_data_segments')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(transformSegment);
}

async function ensureTrainingDataExists(trainingDataId: string): Promise<void> {
  const { error } = await supabase
    .from('training_data')
    .select('id, batch_id')
    .eq('id', trainingDataId)
    .single();

  if (error) {
    throw new Error(`Training data with ID ${trainingDataId} not found`);
  }
}

async function insertTrainingSegment(
  trainingDataId: string,
  startTime: number,
  endTime: number,
  description?: string
): Promise<{ id: string; segment: TrainingDataSegment }> {
  await ensureTrainingDataExists(trainingDataId);

  const { data, error } = await supabase
    .from('training_data_segments')
    .insert({
      training_data_id: trainingDataId,
      start_time: roundTime(startTime),
      end_time: roundTime(endTime),
      description,
      metadata: { duration: roundTime(endTime - startTime) },
    })
    .select()
    .single();

  if (error) throw error;
  return { id: data.id, segment: transformSegment(data) };
}

async function updateTrainingSegmentRecord(
  id: string,
  updates: Partial<{ startTime: number; endTime: number; description: string }>
): Promise<TrainingDataSegment> {
  const { data, error } = await supabase
    .from('training_data_segments')
    .update({
      start_time: updates.startTime !== undefined ? roundTime(updates.startTime) : undefined,
      end_time: updates.endTime !== undefined ? roundTime(updates.endTime) : undefined,
      description: updates.description,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return transformSegment(data);
}

async function deleteTrainingSegmentRecord(id: string): Promise<void> {
  const { error } = await supabase
    .from('training_data_segments')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

async function deleteTrainingVideoRecord(id: string): Promise<void> {
  const { error } = await supabase
    .from('training_data')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

async function removeTrainingVideoFromStorage(storageLocation: string): Promise<void> {
  const { error } = await supabase.storage
    .from('training-data')
    .remove([storageLocation]);

  if (error) {
    handleError(error, {
      context: 'useTrainingData.removeTrainingVideoFromStorage',
      showToast: false,
    });
  }
}

export function useTrainingData() {
  const [videos, setVideos] = useState<TrainingDataVideo[]>([]);
  const [segments, setSegments] = useState<TrainingDataSegment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- Sub-hooks ---

  const {
    batches,
    selectedBatchId,
    setSelectedBatchId,
    fetchBatches,
    createBatch,
    updateBatch,
    deleteBatch,
  } = useTrainingDataBatches({ videos });

  const fetchVideos = useCallback(async () => {
    try {
      const data = await fetchTrainingVideos(selectedBatchId);
      setVideos(data);
    } catch (error) {
      handleError(error, { context: 'useTrainingData.fetchVideos', toastTitle: 'Failed to load videos' });
    } finally {
      setIsLoading(false);
    }
  }, [selectedBatchId]);

  const fetchSegments = useCallback(async () => {
    try {
      const data = await fetchTrainingSegments();
      setSegments(data);
    } catch (error) {
      handleError(error, { context: 'useTrainingData.fetchSegments', toastTitle: 'Failed to load segments' });
    }
  }, []);

  const createSegment = useCallback(async (
    trainingDataId: string,
    startTime: number,
    endTime: number,
    description?: string,
  ): Promise<string> => {
    try {
      const { id, segment } = await insertTrainingSegment(trainingDataId, startTime, endTime, description);
      setSegments((previous) => [segment, ...previous]);
      return id;
    } catch (error) {
      handleError(error, { context: 'useTrainingData.createSegment', toastTitle: 'Failed to create segment' });
      throw error;
    }
  }, []);

  const updateSegment = useCallback(async (
    id: string,
    updates: Partial<{ startTime: number; endTime: number; description: string }>,
  ) => {
    try {
      const updatedSegment = await updateTrainingSegmentRecord(id, updates);
      setSegments((previous) => previous.map((segment) => (
        segment.id === id ? updatedSegment : segment
      )));
    } catch (error) {
      handleError(error, { context: 'useTrainingData.updateSegment', toastTitle: 'Failed to update segment' });
    }
  }, []);

  const deleteSegment = useCallback(async (id: string) => {
    try {
      await deleteTrainingSegmentRecord(id);
      setSegments((previous) => previous.filter((segment) => segment.id !== id));
    } catch (error) {
      handleError(error, { context: 'useTrainingData.deleteSegment', toastTitle: 'Failed to delete segment' });
    }
  }, []);

  const { getVideoUrl, markVideoAsInvalid, clearUrlCache } = useVideoUrlCache(videos);
  const deleteVideo = useCallback(async (id: string) => {
    try {
      const video = videos.find(v => v.id === id);
      if (!video) return;

      setVideos((previous) => previous.filter((currentVideo) => currentVideo.id !== id));
      setSegments((previous) => previous.filter((segment) => segment.trainingDataId !== id));
      clearUrlCache(id);

      try {
        await deleteTrainingVideoRecord(id);
      } catch (dbError) {
        await Promise.all([fetchVideos(), fetchSegments()]);
        throw dbError;
      }

      await removeTrainingVideoFromStorage(video.storageLocation);
    } catch (error) {
      handleError(error, { context: 'useTrainingData.deleteVideo', toastTitle: 'Failed to delete video' });
    }
  }, [videos, clearUrlCache, fetchVideos, fetchSegments]);

  const { isUploading, uploadVideo, uploadVideosWithSplitModes } = useTrainingDataUpload({
    selectedBatchId,
    videos,
    setVideos,
    createSegment,
    fetchVideos,
    fetchSegments,
  });

  useEffect(() => {
    fetchBatches();
    fetchSegments();
  }, [fetchBatches, fetchSegments]);

  useEffect(() => {
    if (selectedBatchId && batches.length > 0) {
      fetchVideos();
    }
  }, [selectedBatchId, batches.length, fetchVideos]);

  return {
    videos,
    segments,
    batches,
    selectedBatchId,
    isUploading,
    isLoading,
    uploadVideo,
    uploadVideosWithSplitModes,
    deleteVideo,
    createSegment,
    updateSegment,
    deleteSegment,
    getVideoUrl,
    markVideoAsInvalid,
    createBatch,
    updateBatch,
    deleteBatch,
    setSelectedBatchId,
  };
}
