import React, { useRef } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/primitives/label';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { useCreateResource, StructureVideoMetadata } from '@/shared/hooks/useResources';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { calculateNewVideoPlacement } from '../../utils/timeline-utils';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
import { extractVideoMetadata, uploadVideoToStorage, type VideoMetadata } from '@/shared/lib/videoUploader';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface GuidanceVideoControlsProps {
  shotId: string;
  projectId?: string;
  readOnly?: boolean;
  hasNoImages?: boolean;
  primaryStructureVideoType: 'uni3c' | 'flow' | 'canny' | 'depth';
  primaryStructureVideoTreatment: 'adjust' | 'clip';
  primaryStructureVideoMotionStrength: number;
  structureVideos?: StructureVideoConfigWithMetadata[];
  fullMax: number;
  onAddStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  onUpdateStructureVideo?: (index: number, updates: Partial<StructureVideoConfigWithMetadata>) => void;
  onPrimaryStructureVideoInputChange?: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => void;
  onShowVideoBrowser: () => void;
  isUploadingStructureVideo: boolean;
  setIsUploadingStructureVideo: (value: boolean) => void;
}

/** Controls for uploading/browsing guidance videos */
export const GuidanceVideoControls = React.memo<GuidanceVideoControlsProps>(function GuidanceVideoControls({
  shotId: _shotId,
  projectId: _projectId,
  readOnly = false,
  hasNoImages = false,
  primaryStructureVideoType,
  primaryStructureVideoTreatment,
  primaryStructureVideoMotionStrength,
  structureVideos,
  fullMax,
  onAddStructureVideo,
  onUpdateStructureVideo,
  onPrimaryStructureVideoInputChange,
  onShowVideoBrowser,
  isUploadingStructureVideo,
  setIsUploadingStructureVideo,
}) {
  const createResource = useCreateResource();
  const { value: privacyDefaults } = useUserUIState('privacyDefaults', { resourcesPublic: true, generationsPublic: false });
  // Read from ref in the upload callback — avoids re-renders from privacy state changes
  const privacyDefaultsRef = useRef(privacyDefaults);
  privacyDefaultsRef.current = privacyDefaults;

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingStructureVideo(true);
    try {
      const metadata = await extractVideoMetadata(file);
      const videoUrl = await uploadVideoToStorage(file);

      // Create resource for reuse
      const { data: { user } } = await supabase().auth.getUser();
      const now = new Date().toISOString();
      const resourceMetadata: StructureVideoMetadata = {
        name: `Guidance Video ${new Date().toLocaleString()}`,
        videoUrl: videoUrl,
        thumbnailUrl: null,
        videoMetadata: metadata,
        created_by: { is_you: true, username: user?.email || 'user' },
        is_public: privacyDefaultsRef.current.resourcesPublic,
        createdAt: now,
      };
      await createResource.mutateAsync({ type: 'structure-video', metadata: resourceMetadata });

      // Use multi-video interface if available, otherwise fall back to legacy
      if (onAddStructureVideo) {
        const placement = calculateNewVideoPlacement(
          metadata.total_frames,
          structureVideos,
          fullMax
        );

        // Apply clipping to last video if needed
        if (placement.lastVideoUpdate && onUpdateStructureVideo) {
          onUpdateStructureVideo(placement.lastVideoUpdate.index, {
            end_frame: placement.lastVideoUpdate.newEndFrame,
          });
        }

        onAddStructureVideo({
          path: videoUrl,
          start_frame: placement.start_frame,
          end_frame: placement.end_frame,
          treatment: 'adjust',
          motion_strength: 1.0,
          structure_type: primaryStructureVideoType,
          metadata,
          resource_id: null,
        });
      } else if (onPrimaryStructureVideoInputChange) {
        // Legacy single-video interface
        onPrimaryStructureVideoInputChange(videoUrl, metadata, primaryStructureVideoTreatment, primaryStructureVideoMotionStrength, primaryStructureVideoType);
      }
      e.target.value = '';
    } catch (error) {
      normalizeAndPresentError(error, { context: 'GuidanceVideoControls.upload' });
      toast.error('Failed to upload guidance video');
    } finally {
      setIsUploadingStructureVideo(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 pointer-events-auto bg-background/95 backdrop-blur-sm px-2 py-1 rounded shadow-md border border-border/50 ${hasNoImages ? 'opacity-30 blur-[0.5px]' : ''}`}>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        Camera Guidance Video:
      </span>
      <input
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={handleVideoUpload}
        className="hidden"
        id="guidance-video-upload-top"
        disabled={readOnly || isUploadingStructureVideo}
      />
      <Label htmlFor={readOnly ? undefined : "guidance-video-upload-top"} className={`m-0 ${readOnly ? 'cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2"
          disabled={readOnly || isUploadingStructureVideo}
          asChild
        >
          <span>{isUploadingStructureVideo ? 'Uploading...' : 'Upload'}</span>
        </Button>
      </Label>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs px-2"
        onClick={readOnly ? undefined : onShowVideoBrowser}
        disabled={readOnly}
      >
        Browse
      </Button>
    </div>
  );
});
