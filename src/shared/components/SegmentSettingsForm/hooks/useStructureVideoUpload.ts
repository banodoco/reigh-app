/**
 * useStructureVideoUpload Hook
 *
 * Encapsulates structure video upload logic for the SegmentSettingsForm:
 * - File validation and upload
 * - Resource creation
 * - Loading state management
 * - Video browser modal state
 */

import { useState, useCallback, useRef } from 'react';
import { toast } from '@/shared/components/ui/sonner';
import { handleError } from '@/shared/lib/errorHandler';
import { uploadVideoToStorage, extractVideoMetadata } from '@/shared/lib/videoUploader';
import { supabase } from '@/integrations/supabase/client';
import { useCreateResource, type Resource, type StructureVideoMetadata } from '@/shared/hooks/useResources';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
import type { SegmentSettings } from '../../segmentSettingsUtils';

const MAX_UPLOAD_SIZE_MB = 200;
const BYTES_PER_KB = 1024;

interface UseStructureVideoUploadOptions {
  /** Frame range for the segment (required for creating structure video config) */
  structureVideoFrameRange?: {
    segmentStart: number;
    segmentEnd: number;
    videoTotalFrames: number;
    videoFps: number;
  };
  /** Current settings (for default values) */
  settings: SegmentSettings;
  /** Shot-level structure video defaults */
  structureVideoDefaults?: {
    motionStrength: number;
    treatment: 'adjust' | 'clip';
    uni3cEndPercent: number;
  };
  /** Callback when a structure video is added */
  onAddSegmentStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
}

interface UseStructureVideoUploadReturn {
  // State
  isUploadingVideo: boolean;
  uploadProgress: number;
  pendingVideoUrl: string | null;
  showVideoBrowser: boolean;

  // Actions
  setShowVideoBrowser: (show: boolean) => void;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleVideoResourceSelect: (resource: Resource) => void;
  handleVideoPreviewLoaded: () => void;
  clearPendingVideo: () => void;

  // Refs for file inputs
  fileInputRef: React.RefObject<HTMLInputElement>;
  addFileInputRef: React.RefObject<HTMLInputElement>;

  // Computed
  isVideoLoading: boolean;
}

export function useStructureVideoUpload(
  options: UseStructureVideoUploadOptions
): UseStructureVideoUploadReturn {
  const {
    structureVideoFrameRange,
    settings,
    structureVideoDefaults,
    onAddSegmentStructureVideo,
  } = options;

  // UI state
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingVideoUrl, setPendingVideoUrl] = useState<string | null>(null);
  const [showVideoBrowser, setShowVideoBrowser] = useState(false);

  // File input refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  // Resource creation hook for video upload
  const createResource = useCreateResource();

  // Privacy defaults for new resources
  const { value: privacyDefaults } = useUserUIState('privacyDefaults', {
    resourcesPublic: true,
    generationsPublic: false,
  });

  // Show loading state when uploading OR waiting for frames to be captured
  const isVideoLoading = isUploadingVideo || !!pendingVideoUrl;

  // Callback when StructureVideoPreview finishes capturing all frames
  const handleVideoPreviewLoaded = useCallback(() => {
    setPendingVideoUrl(null);
  }, []);

  // Clear pending state (e.g., when video is removed)
  const clearPendingVideo = useCallback(() => {
    setPendingVideoUrl(null);
  }, []);

  // Handle selecting a video from the browser
  const handleVideoResourceSelect = useCallback((resource: Resource) => {
    if (!onAddSegmentStructureVideo || !structureVideoFrameRange) return;

    const metadata = resource.metadata as StructureVideoMetadata;

    const newVideo: StructureVideoConfigWithMetadata = {
      path: metadata.videoUrl,
      start_frame: structureVideoFrameRange.segmentStart,
      end_frame: structureVideoFrameRange.segmentEnd,
      treatment: settings.structureTreatment ?? structureVideoDefaults?.treatment ?? 'adjust',
      motion_strength: settings.structureMotionStrength ?? structureVideoDefaults?.motionStrength ?? 1.2,
      structure_type: 'uni3c', // Default to uni3c for new uploads
      uni3c_end_percent: settings.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1,
      metadata: metadata.videoMetadata ?? null,
      resource_id: resource.id,
    };

    // Set pending state to show loading until props update
    setPendingVideoUrl(metadata.videoUrl);
    onAddSegmentStructureVideo(newVideo);
    setShowVideoBrowser(false);
  }, [onAddSegmentStructureVideo, structureVideoFrameRange, settings, structureVideoDefaults]);

  // Process uploaded video file
  const processVideoFile = useCallback(async (file: File) => {
    if (!onAddSegmentStructureVideo || !structureVideoFrameRange) return;

    // Validate file type
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type. Please upload an MP4, WebM, or MOV file.');
      return;
    }

    // Validate file size
    const maxSizeMB = MAX_UPLOAD_SIZE_MB;
    const fileSizeMB = file.size / (BYTES_PER_KB * BYTES_PER_KB);
    if (fileSizeMB > maxSizeMB) {
      toast.error(`File too large. Maximum size is ${maxSizeMB}MB`);
      return;
    }

    try {
      setIsUploadingVideo(true);
      setUploadProgress(0);

      // Extract metadata
      const metadata = await extractVideoMetadata(file);
      setUploadProgress(25);

      // Upload to storage
      const { data: { user } } = await supabase.auth.getUser();
      const videoUrl = await uploadVideoToStorage(
        file,
        '', // projectId - will use default bucket path
        '', // shotId
        (progress) => setUploadProgress(25 + (progress * 0.65))
      );
      setUploadProgress(90);

      // Create resource for reuse
      const now = new Date().toISOString();
      const resourceMetadata: StructureVideoMetadata = {
        name: `Guidance Video ${new Date().toLocaleString()}`,
        videoUrl: videoUrl,
        thumbnailUrl: null,
        videoMetadata: metadata,
        created_by: {
          is_you: true,
          username: user?.email || 'user',
        },
        is_public: privacyDefaults.resourcesPublic,
        createdAt: now,
      };

      const resource = await createResource.mutateAsync({
        type: 'structure-video',
        metadata: resourceMetadata,
      });
      setUploadProgress(100);

      // Create the structure video config
      const newVideo: StructureVideoConfigWithMetadata = {
        path: videoUrl,
        start_frame: structureVideoFrameRange.segmentStart,
        end_frame: structureVideoFrameRange.segmentEnd,
        treatment: settings.structureTreatment ?? structureVideoDefaults?.treatment ?? 'adjust',
        motion_strength: settings.structureMotionStrength ?? structureVideoDefaults?.motionStrength ?? 1.2,
        structure_type: 'uni3c',
        uni3c_end_percent: settings.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1,
        metadata: metadata,
        resource_id: resource.id,
      };

      // Set pending state to show loading until props update
      setPendingVideoUrl(videoUrl);
      onAddSegmentStructureVideo(newVideo);
    } catch (error) {
      handleError(error, { context: 'SegmentSettingsForm', toastTitle: 'Failed to upload video' });
    } finally {
      setIsUploadingVideo(false);
      setUploadProgress(0);
      // Clear both file inputs so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (addFileInputRef.current) {
        addFileInputRef.current.value = '';
      }
    }
  }, [onAddSegmentStructureVideo, structureVideoFrameRange, settings, structureVideoDefaults, createResource, privacyDefaults]);

  // Handle file input change
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processVideoFile(file);
    }
  }, [processVideoFile]);

  return {
    // State
    isUploadingVideo,
    uploadProgress,
    pendingVideoUrl,
    showVideoBrowser,

    // Actions
    setShowVideoBrowser,
    handleFileSelect,
    handleVideoResourceSelect,
    handleVideoPreviewLoaded,
    clearPendingVideo,

    // Refs
    fileInputRef: fileInputRef as React.RefObject<HTMLInputElement>,
    addFileInputRef: addFileInputRef as React.RefObject<HTMLInputElement>,

    // Computed
    isVideoLoading,
  };
}
