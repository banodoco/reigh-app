import { useState, useEffect, useRef } from 'react';
import { PageFadeIn } from '@/shared/components/transitions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { VideoUploadList } from '../components/VideoUploadList';
import { VideoSegmentEditor } from '../components/VideoSegmentEditor/VideoSegmentEditor';
import { BatchSelector } from '../components/BatchSelector';
import { MultiVideoUploader } from '../components/MultiVideoUploader';
import { useTrainingData } from '../hooks/useTrainingData';
import { Video, Scissors } from 'lucide-react';
import { cropFilename } from '@/shared/lib/utils';
import { handleError } from '@/shared/lib/errorHandling/handleError';

export default function TrainingDataHelperPage() {
  const { 
    videos, 
    uploadVideosWithSplitModes,
    isUploading, 
    segments, 
    createSegment, 
    deleteSegment, 
    batches, 
    selectedBatchId, 
    createBatch, 
    updateBatch,
    deleteBatch,
    setSelectedBatchId,
    getVideoUrl,
  } = useTrainingData();
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const segmentEditorRef = useRef<HTMLDivElement>(null);

  // Clear selection if the selected video no longer exists
  useEffect(() => {
    if (selectedVideo && !videos.find(video => video.id === selectedVideo)) {
      setSelectedVideo(null);
    }
  }, [videos, selectedVideo]);

  // Scroll to segment editor when a video is selected
  useEffect(() => {
    if (selectedVideo && segmentEditorRef.current) {
      // Small delay to ensure the element is rendered
      setTimeout(() => {
        segmentEditorRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 100);
    }
  }, [selectedVideo]);

  const handleMultiVideoUpload = async (videoFiles: Array<{
    file: File;
    splitMode: 'take-all' | 'manual' | 'auto-scene';
    detectedScenes?: number[];
  }>) => {
    try {
      await uploadVideosWithSplitModes(videoFiles);
    } catch (error) {
      handleError(error, { context: 'TrainingDataHelperPage', toastTitle: 'Failed to upload videos' });
    }
  };

  const selectedVideoData = selectedVideo ? videos.find(video => video.id === selectedVideo) : null;
  const videoSegments = selectedVideo ? segments.filter(segment => segment.trainingDataId === selectedVideo) : [];

  return (
    <PageFadeIn className="container mx-auto p-6 max-w-7xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-light">Training Data Helper</h1>
          <p className="text-muted-foreground">
            Upload videos and extract training segments for AI model development
          </p>
        </div>

        {/* Batch Selector */}
        <BatchSelector
          batches={batches}
          selectedBatchId={selectedBatchId}
          onSelectBatch={setSelectedBatchId}
          onCreateBatch={createBatch}
          onUpdateBatch={updateBatch}
          onDeleteBatch={deleteBatch}
          videos={videos}
          segments={segments}
          getVideoUrl={getVideoUrl}
        />

        {/* Only show upload and video sections when a batch is selected */}
        {selectedBatchId && (
          <>
            {/* Upload Section */}
            <MultiVideoUploader
              onUpload={handleMultiVideoUpload}
              isUploading={isUploading}
              selectedBatchId={selectedBatchId}
            />

            {/* Video Library */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Video className="h-5 w-5" />
                  Video Library ({videos.length})
                </CardTitle>
                <CardDescription>
                  Your uploaded videos. Click on a video to extract segments.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <VideoUploadList 
                  videos={videos}
                  selectedVideo={selectedVideo}
                  onVideoSelect={setSelectedVideo}
                  segments={segments}
                />
              </CardContent>
            </Card>

            {/* Segment Editor */}
            {selectedVideoData && (
              <Card ref={segmentEditorRef}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Scissors className="h-5 w-5" />
                    Segment Editor - {cropFilename(selectedVideoData.originalFilename)}
                  </CardTitle>
                  <CardDescription>
                    Create and manage training segments from the selected video
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <VideoSegmentEditor
                    video={selectedVideoData}
                    segments={videoSegments}
                    onCreateSegment={createSegment}
                    onDeleteSegment={deleteSegment}
                  />
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </PageFadeIn>
  );
} 
