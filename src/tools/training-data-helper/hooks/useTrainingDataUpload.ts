import { useState } from 'react';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { transformVideo } from './transforms';
import type { TrainingDataVideo } from './types';

interface UseTrainingDataUploadProps {
  selectedBatchId: string | null;
  videos: TrainingDataVideo[];
  setVideos: React.Dispatch<React.SetStateAction<TrainingDataVideo[]>>;
  createSegment: (
    trainingDataId: string,
    startTime: number,
    endTime: number,
    description?: string,
  ) => Promise<string>;
  fetchVideos: () => Promise<void>;
  fetchSegments: () => Promise<void>;
}

export function useTrainingDataUpload({
  selectedBatchId,
  videos,
  setVideos,
  createSegment,
  fetchVideos,
  fetchSegments,
}: UseTrainingDataUploadProps) {
  const [isUploading, setIsUploading] = useState(false);

  /** Get the duration (in seconds) of a video file via a temporary <video> element. */
  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        resolve(video.duration);
        URL.revokeObjectURL(video.src);
      };
      video.onerror = () => {
        console.warn('Could not get video duration for:', file.name);
        resolve(0);
        URL.revokeObjectURL(video.src);
      };
      video.src = URL.createObjectURL(file);
    });
  };

  /** Upload a single video file to storage + DB. Returns the new video's ID. */
  const uploadVideoFile = async (file: File, userId: string): Promise<string> => {
    const duration = await getVideoDuration(file);

    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase().storage
      .from('training-data')
      .upload(fileName, file);

    if (uploadError) {
      console.error('[Upload] Storage upload error:', uploadError);
      throw uploadError;
    }

    const { data, error } = await supabase().from('training_data')
      .insert({
        user_id: userId,
        batch_id: selectedBatchId!,
        original_filename: file.name,
        storage_location: fileName,
        duration: Math.round(duration),
        metadata: {
          size: file.size,
          type: file.type,
        },
      })
      .select()
      .single();

    if (error) {
      console.error('[Upload] Database insert error:', error);
      throw error;
    }

    setVideos(prev => [transformVideo(data), ...prev]);
    return data.id;
  };

  /** Create a segment for a video, resolving null endTimeMs from the video's duration. */
  const createSegmentForVideo = async (
    videoId: string,
    startTimeMs: number,
    endTimeMs: number | null,
    description: string,
  ) => {
    if (endTimeMs === null) {
      const localVideo = videos.find(v => v.id === videoId);
      if (localVideo?.duration) {
        endTimeMs = Math.round(localVideo.duration * 1000);
      } else {
        const { data, error } = await supabase().from('training_data')
          .select('duration')
          .eq('id', videoId)
          .single();

        if (!error && data?.duration) {
          endTimeMs = Math.round(data.duration * 1000);
        } else {
          endTimeMs = 10000;
        }
      }
    }

    await createSegment(videoId, startTimeMs, endTimeMs, description);
  };

  /** Upload a single video file. Wraps uploadVideoFile with auth + batch checks. */
  const uploadVideo = async (file: File): Promise<string> => {
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (!selectedBatchId) {
        throw new Error('Please select a batch first');
      }

      return await uploadVideoFile(file, user.id);
    } catch (error) {
      console.error('[Upload] Error uploading video:', error);
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  /** Upload multiple videos, optionally creating segments based on each file's split mode. */
  const uploadVideosWithSplitModes = async (videoFiles: Array<{
    file: File;
    splitMode: 'take-all' | 'manual' | 'auto-scene';
    detectedScenes?: number[];
  }>): Promise<void> => {
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (!selectedBatchId) {
        throw new Error('Please select a batch first');
      }

      for (const videoFile of videoFiles) {
        const videoId = await uploadVideoFile(videoFile.file, user.id);

        switch (videoFile.splitMode) {
          case 'take-all':
            await createSegmentForVideo(videoId, 0, null, 'Full video segment');
            break;

          case 'auto-scene':
            if (videoFile.detectedScenes && videoFile.detectedScenes.length > 1) {
              for (let i = 0; i < videoFile.detectedScenes.length - 1; i++) {
                const startTime = videoFile.detectedScenes[i];
                const endTime = videoFile.detectedScenes[i + 1];
                await createSegmentForVideo(
                  videoId,
                  Math.round(startTime * 1000),
                  Math.round(endTime * 1000),
                  `Auto-detected scene ${i + 1}`,
                );
              }
            } else {
              await createSegmentForVideo(videoId, 0, null, 'Auto-scene fallback (full video)');
            }
            break;

          case 'manual':
            // Don't create any segments - user will do it manually
            break;
        }
      }

      // Refresh videos to ensure they're properly loaded
      await Promise.all([fetchVideos(), fetchSegments()]);

      // Give a small delay to ensure DB has fully processed
      await new Promise(resolve => setTimeout(resolve, 500));

      // Refresh one more time to ensure URLs are generated
      await fetchVideos();
    } catch (error) {
      console.error('Error uploading videos:', error);
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    isUploading,
    uploadVideo,
    uploadVideosWithSplitModes,
  };
}
