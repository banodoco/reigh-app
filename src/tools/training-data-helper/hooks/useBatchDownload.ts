import { useState, useCallback } from 'react';
import { TrainingDataBatch, TrainingDataVideo, TrainingDataSegment } from './useTrainingData';
import { toast } from '@/shared/components/ui/sonner';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { extractVideoSegment } from '../lib/extractVideoSegment';

interface UseBatchDownloadParams {
  batches: TrainingDataBatch[];
  videos: TrainingDataVideo[];
  segments: TrainingDataSegment[];
  selectedBatchId: string | null;
  getVideoUrl: (video: TrainingDataVideo) => string;
}

export function useBatchDownload({
  batches,
  videos,
  segments,
  selectedBatchId,
  getVideoUrl,
}: UseBatchDownloadParams) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handlePrepareDownload = useCallback(async () => {
    if (!selectedBatchId) {
      toast.error('Please select a batch first');
      return;
    }

    const batchVideos = videos.filter(v => v.batchId === selectedBatchId);
    if (batchVideos.length === 0) {
      toast.error('No videos found in this batch');
      return;
    }

    const batchSegments = segments.filter(s =>
      batchVideos.some(v => v.id === s.trainingDataId)
    );
    if (batchSegments.length === 0) {
      toast.error('No segments found for videos in this batch');
      return;
    }

    setIsDownloading(true);

    try {
      const JSZipModule = await import('jszip');
      const zip = new JSZipModule.default();
      let processedSegments = 0;

      toast.info(`Starting to process ${batchSegments.length} segments...`);

      for (const segment of batchSegments) {
        const video = batchVideos.find(v => v.id === segment.trainingDataId);
        if (!video) continue;

        try {
          const videoUrl = getVideoUrl(video);
          if (!videoUrl) {
            console.warn(`No URL available for video ${video.id}`);
            continue;
          }

          const startTimeSeconds = segment.startTime / 1000;
          const endTimeSeconds = segment.endTime / 1000;
          const duration = endTimeSeconds - startTimeSeconds;

          toast.info(`Processing segment ${processedSegments + 1}/${batchSegments.length}: ${video.originalFilename} (${startTimeSeconds.toFixed(1)}s-${endTimeSeconds.toFixed(1)}s)`);

          const { blob: segmentBlob, fileExtension: fileExt } = await extractVideoSegment(videoUrl, startTimeSeconds, endTimeSeconds, video.originalFilename);

          const videoBaseName = video.originalFilename.replace(/\.[^/.]+$/, '');
          const segmentFileName = `${videoBaseName}_${Math.floor(startTimeSeconds)}s-${Math.floor(endTimeSeconds)}s.${fileExt}`;

          zip.file(segmentFileName, segmentBlob);

          const metadataContent = `Video: ${video.originalFilename}
Start Time: ${startTimeSeconds.toFixed(2)}s
End Time: ${endTimeSeconds.toFixed(2)}s
Duration: ${duration.toFixed(2)}s
Description: ${segment.description || 'No description'}
Created: ${new Date(segment.createdAt).toLocaleString()}
Format: ${segmentBlob.type}
File Size: ${segmentBlob.size} bytes`;

          zip.file(segmentFileName.replace(`.${fileExt}`, '_metadata.txt'), metadataContent);

          processedSegments++;
        } catch (error) {
          handleError(error, { context: 'BatchSelector', toastTitle: `Failed to process segment from ${video.originalFilename}` });
        }
      }

      if (processedSegments === 0) {
        toast.error('No segments were successfully processed');
        return;
      }

      toast.info('Creating zip file...');
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      const selectedBatch = batches.find(b => b.id === selectedBatchId);
      const batchName = selectedBatch?.name || 'training_batch';
      const fileName = `${batchName.replace(/[^a-zA-Z0-9]/g, '_')}_segments.zip`;

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      handleError(error, { context: 'BatchSelector', toastTitle: 'Failed to prepare download. Please try again.' });
    } finally {
      setIsDownloading(false);
    }
  }, [batches, videos, segments, selectedBatchId, getVideoUrl]);

  return { isDownloading, handlePrepareDownload };
}
