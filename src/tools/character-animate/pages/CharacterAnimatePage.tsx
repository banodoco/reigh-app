import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Upload, Film, Play, X } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { useAsyncOperation } from '@/shared/hooks/useAsyncOperation';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { storagePaths, getFileExtension, MEDIA_BUCKET } from '@/shared/lib/storagePaths';
import { useAutoSaveSettings } from '@/shared/hooks/useAutoSaveSettings';
import { CharacterAnimateSettings, characterAnimateSettings } from '../settings';
import { PageFadeIn } from '@/shared/components/transitions';
import { createCharacterAnimateTask } from '@/shared/lib/tasks/characterAnimate';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { useProjectGenerations, type GenerationsPaginatedResponse } from '@/shared/hooks/useProjectGenerations';
import { useDeleteGeneration } from '@/shared/hooks/useGenerationMutations';
import { MediaGallery } from '@/shared/components/MediaGallery';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { SKELETON_COLUMNS } from '@/shared/components/MediaGallery/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { cn } from '@/shared/lib/utils';
import { extractVideoPosterFrame } from '@/shared/utils/videoPosterExtractor';

// Image/Video container skeleton loader
const MediaContainerSkeleton: React.FC = () => (
  <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-muted animate-pulse">
    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-400"></div>
  </div>
);

// Upload loading state
const UploadingMediaState: React.FC<{ type: 'image' | 'video' }> = ({ type }) => (
  <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-muted/50 backdrop-blur-sm">
    <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mb-3"></div>
    <p className="text-sm font-medium text-foreground">
      Uploading {type === 'image' ? 'image' : 'video'}...
    </p>
  </div>
);

const CharacterAnimatePage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProject();
  const isMobile = useIsMobile();
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();
  const incomingTaskIdRef = useRef<string | null>(null);
  
  // Local state for inputs
  const [characterImage, setCharacterImage] = useState<{ url: string; file?: File } | null>(null);
  const [motionVideo, setMotionVideo] = useState<{ url: string; posterUrl?: string; file?: File } | null>(null);
  const [prompt, setPrompt] = useState('');
  const [localMode, setLocalMode] = useState<'animate' | 'replace'>('animate');

  // Upload operations with automatic loading state and error handling
  const imageUpload = useAsyncOperation();
  const videoUpload = useAsyncOperation();
  
  // Loading states for smooth transitions
  const [characterImageLoaded, setCharacterImageLoaded] = useState(false);
  const [motionVideoLoaded, setMotionVideoLoaded] = useState(false);
  
  // Playing state - track if user has pressed play
  const [motionVideoPlaying, setMotionVideoPlaying] = useState(false);
  
  const characterImageInputRef = useRef<HTMLInputElement>(null);
  const motionVideoInputRef = useRef<HTMLInputElement>(null);
  
  // Video ref for forcefully pausing
  const motionVideoRef = useRef<HTMLVideoElement>(null);

  // Track drag state and scroll state separately to prevent mobile scroll conflicts
  const [isDraggingOverImage, setIsDraggingOverImage] = useState(false);
  const [isDraggingOverVideo, setIsDraggingOverVideo] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);

  // Track when we've just triggered a generation to prevent empty state flash
  const [videosViewJustEnabled, setVideosViewJustEnabled] = useState<boolean>(false);
  
  // Track success state for button feedback
  const [showSuccessState, setShowSuccessState] = useState(false);

  // Load settings with auto-save
  const { settings, updateField, updateFields, status } = useAutoSaveSettings<CharacterAnimateSettings>({
    toolId: 'character-animate',
    projectId: selectedProjectId,
    scope: 'project',
    defaults: characterAnimateSettings.defaults,
    enabled: !!selectedProjectId,
  });

  // Settings are ready when status is 'ready'
  const settingsLoaded = status === 'ready';
  
  // Get current project for aspect ratio
  const { projects } = useProject();
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
  
  // Fetch all videos generated with character-animate tool type
  // Disable polling to prevent gallery flicker (character-animate tasks are long-running)
  const generationsQuery = useProjectGenerations(
    selectedProjectId,
    1, // page
    100, // limit
    !!selectedProjectId, // only enable when project is selected
    {
      toolType: 'character-animate',
      mediaType: 'video'
    },
    {
      disablePolling: true // Prevent periodic refetching that causes flicker
    }
  );
  
  const videosData = generationsQuery.data as GenerationsPaginatedResponse | undefined;
  const videosLoading = generationsQuery.isLoading;
  const videosFetching = generationsQuery.isFetching;
  const videosError = generationsQuery.error;
  
  // Delete mutation for gallery items
  const deleteGenerationMutation = useDeleteGeneration();
  const handleDeleteGeneration = useCallback((id: string) => {
    deleteGenerationMutation.mutate(id);
  }, [deleteGenerationMutation]);
  
  // Clear videosViewJustEnabled flag when data loads
  useEffect(() => {
    if (videosViewJustEnabled && videosData?.items) {
      // Data has loaded, clear the flag
      setVideosViewJustEnabled(false);
      console.log('[CharacterAnimate] Data loaded, clearing videosViewJustEnabled flag', {
        itemsCount: videosData.items.length,
        timestamp: Date.now()
      });
    }
  }, [videosViewJustEnabled, videosData?.items]);
  
  // Refresh gallery when returning to the page (since polling is disabled)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && selectedProjectId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.unified.projectPrefix(selectedProjectId)
        });
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [selectedProjectId, queryClient]);
  
  // Initialize prompt from settings
  useEffect(() => {
    if (settings?.defaultPrompt) {
      setPrompt(settings.defaultPrompt);
    }
  }, [settings?.defaultPrompt]);
  
  // Load saved input image and video from settings, and sync mode
  useEffect(() => {
    if (settings?.inputImageUrl && !characterImage) {
      setCharacterImage({ url: settings.inputImageUrl });
    }
    if (settings?.inputVideoUrl && !motionVideo) {
      setMotionVideo({ 
        url: settings.inputVideoUrl,
        posterUrl: settings.inputVideoPosterUrl 
      });
    }
    if (settings?.mode) {
      setLocalMode(settings.mode);
    }
  }, [settings?.inputImageUrl, settings?.inputVideoUrl, settings?.inputVideoPosterUrl, settings?.mode]);
  
  // Add timeout fallback for image loading on mobile
  useEffect(() => {
    if (characterImage && !characterImageLoaded) {
      const timer = setTimeout(() => {
        setCharacterImageLoaded(true);
      }, 2000); // Show image after 2 seconds even if not fully loaded
      return () => clearTimeout(timer);
    }
  }, [characterImage, characterImageLoaded]);
  
  // Add timeout fallback for video loading on mobile
  useEffect(() => {
    if (motionVideo && !motionVideoLoaded) {
      const timer = setTimeout(() => {
        setMotionVideoLoaded(true);
      }, 3000); // Show video after 3 seconds even if not fully loaded
      return () => clearTimeout(timer);
    }
  }, [motionVideo, motionVideoLoaded]);
  
  // The definitive fix for preventing autoplay on mobile browsers
  useEffect(() => {
    const video = motionVideoRef.current;
    if (video) {
      // Prevent play events from doing anything
      const preventPlay = () => video.pause();
      video.addEventListener('play', preventPlay);
      
      // Ensure it's paused on mount and on src change
      video.pause();

      return () => video.removeEventListener('play', preventPlay);
    }
  }, [motionVideo]); // Re-run when the video source changes

  // Track scroll state to prevent layout shifts
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolling(true);
      const timer = setTimeout(() => setIsScrolling(false), 200);
      return () => clearTimeout(timer);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Always generate a random seed for each generation
  const generateRandomSeed = useCallback(() => {
    return Math.floor(Math.random() * 1000000);
  }, []);
  
  // Handle mode change with optimistic update
  const handleModeChange = useCallback((newMode: 'animate' | 'replace') => {
    setLocalMode(newMode); // Immediate UI update
    updateField('mode', newMode); // Background persist
  }, [updateField]);
  
  // Handle character image upload
  const handleCharacterImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PNG or JPG image (avoid WEBP)',
        variant: 'destructive',
      });
      return;
    }

    await imageUpload.execute(async () => {
      const uploadedUrl = await uploadImageToStorage(file);
      setCharacterImageLoaded(false);
      setCharacterImage({ url: uploadedUrl, file });
      if (selectedProjectId) {
        updateField('inputImageUrl', uploadedUrl);
      }
    }, { context: 'CharacterAnimate', toastTitle: 'Upload Failed' });
  };

  // Handle motion video selection
  const handleMotionVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a video file',
        variant: 'destructive',
      });
      return;
    }

    await videoUpload.execute(async () => {
      const posterBlob = await extractVideoPosterFrame(file);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        throw new Error('User not authenticated');
      }
      const userId = session.user.id;

      const fileExt = getFileExtension(file.name, file.type, 'mp4');
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const fileName = storagePaths.upload(userId, `${timestamp}-${randomId}.${fileExt}`);
      const posterFileName = storagePaths.thumbnail(userId, `${timestamp}-${randomId}-poster.jpg`);

      const { error: videoError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(fileName, file, { cacheControl: '3600', upsert: false });
      if (videoError) throw videoError;

      const { error: posterError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(posterFileName, posterBlob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'image/jpeg'
        });
      if (posterError) throw posterError;

      const { data: { publicUrl: videoUrl } } = supabase.storage
        .from(MEDIA_BUCKET)
        .getPublicUrl(fileName);
      const { data: { publicUrl: posterUrl } } = supabase.storage
        .from(MEDIA_BUCKET)
        .getPublicUrl(posterFileName);

      setMotionVideoLoaded(false);
      setMotionVideoPlaying(false);
      setMotionVideo({ url: videoUrl, posterUrl, file });

      if (selectedProjectId) {
        updateFields({ inputVideoUrl: videoUrl, inputVideoPosterUrl: posterUrl });
      }
    }, { context: 'CharacterAnimate', toastTitle: 'Upload Failed' });
  };

  // Generate animation mutation
  const generateAnimationMutation = useMutation({
    onMutate: () => {
      incomingTaskIdRef.current = addIncomingTask({
        taskType: 'character_animate',
        label: prompt?.substring(0, 50) || 'Character animation...',
      });
    },
    mutationFn: async () => {
      if (!characterImage) throw new Error('No character image');
      if (!motionVideo) throw new Error('No motion video');
      if (!selectedProjectId) throw new Error('No project selected');
      
      // Create task using the character animate task creation utility
      const taskParams: import('@/shared/lib/tasks/characterAnimate').CharacterAnimateTaskParams = {
        project_id: selectedProjectId,
        character_image_url: characterImage.url,
        motion_video_url: motionVideo.url,
        prompt: prompt || settings?.defaultPrompt || 'natural expression; preserve outfit details',
        mode: localMode, // Use optimistic local mode
        resolution: '480p', // Always use 480p
        seed: generateRandomSeed(), // Always use a random seed
        random_seed: true, // Always random
      };
      
      console.log('[CharacterAnimate] Creating task with params:', taskParams);
      
      const result = await createCharacterAnimateTask(taskParams);
      return result;
    },
    onSuccess: (data) => {
      // Show success state on button
      setShowSuccessState(true);
      setTimeout(() => setShowSuccessState(false), 1500);
      
      // Set flag to indicate we just created a task
      setVideosViewJustEnabled(true);
      
      // Invalidate both tasks and generations queries
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(selectedProjectId) });
    },
    onError: (error) => {
      handleError(error, { context: 'CharacterAnimate', toastTitle: 'Failed to create task' });
    },
    onSettled: async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
      if (incomingTaskIdRef.current) {
        removeIncomingTask(incomingTaskIdRef.current);
        incomingTaskIdRef.current = null;
      }
    },
  });
  
  const handleGenerate = () => {
    if (!characterImage) {
      toast({
        title: 'Missing character image',
        description: 'Please upload a character image first',
        variant: 'destructive',
      });
      return;
    }
    
    if (!motionVideo) {
      toast({
        title: 'Missing motion video',
        description: 'Please select a motion video',
        variant: 'destructive',
      });
      return;
    }
    
    generateAnimationMutation.mutate();
  };
  
  // Drag and drop handlers for character image
  const handleImageDragOver = (e: React.DragEvent) => {
    if (isScrolling) return;
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleImageDragEnter = (e: React.DragEvent) => {
    if (isScrolling) return;
    e.preventDefault();
    e.stopPropagation();
    
    // Check if dragged item is an image
    const items = Array.from(e.dataTransfer.items);
    const hasValidImage = items.some(item => 
      item.kind === 'file' && ['image/png', 'image/jpeg', 'image/jpg'].includes(item.type)
    );
    
    if (hasValidImage) {
      setIsDraggingOverImage(true);
    }
  };
  
  const handleImageDragLeave = (e: React.DragEvent) => {
    if (isScrolling) return;
    e.preventDefault();
    e.stopPropagation();
    // Check if we're actually leaving the drop zone (not just entering a child element)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDraggingOverImage(false);
    }
  };
  
  const handleImageDrop = async (e: React.DragEvent) => {
    if (isScrolling) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverImage(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PNG or JPG image (avoid WEBP)',
        variant: 'destructive',
      });
      return;
    }

    await imageUpload.execute(async () => {
      const uploadedUrl = await uploadImageToStorage(file);
      setCharacterImageLoaded(false);
      setCharacterImage({ url: uploadedUrl, file });
      if (selectedProjectId) {
        updateField('inputImageUrl', uploadedUrl);
      }
    }, { context: 'CharacterAnimate', toastTitle: 'Upload Failed' });
  };

  // Drag and drop handlers for motion video
  const handleVideoDragOver = (e: React.DragEvent) => {
    if (isScrolling) return;
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleVideoDragEnter = (e: React.DragEvent) => {
    if (isScrolling) return;
    e.preventDefault();
    e.stopPropagation();
    
    // Check if dragged item is a video
    const items = Array.from(e.dataTransfer.items);
    const hasValidVideo = items.some(item => 
      item.kind === 'file' && item.type.startsWith('video/')
    );
    
    if (hasValidVideo) {
      setIsDraggingOverVideo(true);
    }
  };
  
  const handleVideoDragLeave = (e: React.DragEvent) => {
    if (isScrolling) return;
    e.preventDefault();
    e.stopPropagation();
    // Check if we're actually leaving the drop zone (not just entering a child element)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDraggingOverVideo(false);
    }
  };
  
  const handleVideoDrop = async (e: React.DragEvent) => {
    if (isScrolling) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverVideo(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a video file',
        variant: 'destructive',
      });
      return;
    }

    await videoUpload.execute(async () => {
      const posterBlob = await extractVideoPosterFrame(file);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        throw new Error('User not authenticated');
      }
      const userId = session.user.id;

      const fileExt = getFileExtension(file.name, file.type, 'mp4');
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const fileName = storagePaths.upload(userId, `${timestamp}-${randomId}.${fileExt}`);
      const posterFileName = storagePaths.thumbnail(userId, `${timestamp}-${randomId}-poster.jpg`);

      const { error: videoError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(fileName, file, { cacheControl: '3600', upsert: false });
      if (videoError) throw videoError;

      const { error: posterError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(posterFileName, posterBlob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'image/jpeg'
        });
      if (posterError) throw posterError;

      const { data: { publicUrl: videoUrl } } = supabase.storage
        .from(MEDIA_BUCKET)
        .getPublicUrl(fileName);
      const { data: { publicUrl: posterUrl } } = supabase.storage
        .from(MEDIA_BUCKET)
        .getPublicUrl(posterFileName);

      setMotionVideoLoaded(false);
      setMotionVideoPlaying(false);
      setMotionVideo({ url: videoUrl, posterUrl, file });

      if (selectedProjectId) {
        updateFields({ inputVideoUrl: videoUrl, inputVideoPosterUrl: posterUrl });
      }
    }, { context: 'CharacterAnimate', toastTitle: 'Upload Failed' });
  };

  if (!selectedProjectId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select a project first.</p>
      </div>
    );
  }

  return (
    <PageFadeIn>
      <div className="flex flex-col space-y-6 pb-6 px-4 max-w-7xl mx-auto pt-6">
        <h1 className="text-3xl font-light tracking-tight text-foreground">Animate Characters</h1>
        
        {/* Mode Selection - First */}
        <div className="space-y-2">
          <Label>Mode:</Label>
          <div className="flex items-center gap-4">
            <div className="flex space-x-2 flex-1">
              <Button
                variant={localMode === 'animate' ? 'default' : 'outline'}
                onClick={() => handleModeChange('animate')}
                className="flex-1"
              >
                Animate
              </Button>
              <Button
                variant={localMode === 'replace' ? 'default' : 'outline'}
                onClick={() => handleModeChange('replace')}
                className="flex-1"
              >
                Replace
              </Button>
            </div>
            <p className="text-xs text-muted-foreground flex-1">
              {localMode === 'animate' 
                ? 'Animate the character in input image with movements from the input video'
                : 'Replace the character in input video with the character in input image'
              }
            </p>
          </div>
        </div>
        
        {/* Input Image | Input Video */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Character Image */}
          <div className="space-y-3">
            <Label className="text-lg font-medium">
              {localMode === 'animate' 
                ? '✨ Character to animate'
                : '✨ Character to insert'
              }
            </Label>
            <div 
              className={`aspect-video bg-muted rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors relative ${
                isDraggingOverImage 
                  ? 'border-primary bg-primary/10' 
                  : 'border-border hover:border-primary/50'
              } ${!characterImage && !imageUpload.isLoading ? 'cursor-pointer' : ''}`}
              onDragOver={handleImageDragOver}
              onDragEnter={handleImageDragEnter}
              onDragLeave={handleImageDragLeave}
              onDrop={handleImageDrop}
              onClick={() => !characterImage && !imageUpload.isLoading && characterImageInputRef.current?.click()}
            >
              {imageUpload.isLoading ? (
                <UploadingMediaState type="image" />
              ) : characterImage ? (
                <>
                  {!characterImageLoaded && <MediaContainerSkeleton />}
                  <img
                    src={characterImage.url}
                    alt="Character"
                    className={cn(
                      'absolute inset-0 w-full h-full object-contain transition-opacity duration-300',
                      characterImageLoaded ? 'opacity-100' : 'opacity-0'
                    )}
                    onLoad={() => setCharacterImageLoaded(true)}
                    onLoadStart={() => setCharacterImageLoaded(true)}
                  />
                  {/* Delete button */}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-lg z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCharacterImage(null);
                      setCharacterImageLoaded(false);
                      if (selectedProjectId) {
                        updateField('inputImageUrl', undefined);
                      }
                    }}
                    disabled={imageUpload.isLoading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  {isDraggingOverImage && !isScrolling && (
                    <div className="absolute inset-0 bg-primary/20 backdrop-blur-sm flex items-center justify-center pointer-events-none z-20">
                      <p className="text-lg font-medium text-foreground">Drop to replace</p>
                    </div>
                  )}
                </>
              ) : !settingsLoaded ? (
                // Show skeleton while settings are loading
                <MediaContainerSkeleton />
              ) : (
                <div className="text-center p-6 pointer-events-none">
                  <Film className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-2">
                    {isDraggingOverImage ? 'Drop image here' : 'Drag & drop or click to upload'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isDraggingOverImage ? '' : 'PNG, JPG supported'}
                  </p>
                </div>
              )}
            </div>
            <input
              ref={characterImageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              className="hidden"
              onChange={handleCharacterImageUpload}
            />
            {characterImage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => characterImageInputRef.current?.click()}
                disabled={imageUpload.isLoading}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Replace Image
              </Button>
            )}
          </div>

          {/* Motion Video */}
          <div className="space-y-3">
            <Label className="text-lg font-medium">
              {localMode === 'animate' 
                ? '🎬 Source of movement'
                : '🎬 Video to replace character in'
              }
            </Label>
            <div 
              className={`aspect-video bg-muted rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors relative ${
                isDraggingOverVideo 
                  ? 'border-primary bg-primary/10' 
                  : 'border-border hover:border-primary/50'
              } ${!motionVideo && !videoUpload.isLoading ? 'cursor-pointer' : ''}`}
              onDragOver={handleVideoDragOver}
              onDragEnter={handleVideoDragEnter}
              onDragLeave={handleVideoDragLeave}
              onDrop={handleVideoDrop}
              onClick={() => !motionVideo && !videoUpload.isLoading && motionVideoInputRef.current?.click()}
            >
              {videoUpload.isLoading ? (
                <UploadingMediaState type="video" />
              ) : motionVideo ? (
                <>
                  {!motionVideoLoaded && <MediaContainerSkeleton />}
                  {/* Show poster image or video based on playing state */}
                  {!motionVideoPlaying && motionVideo.posterUrl ? (
                    <>
                      <img
                        src={motionVideo.posterUrl}
                        alt="Video poster"
                        className={cn(
                          'absolute inset-0 w-full h-full object-contain transition-opacity duration-300 z-0',
                          motionVideoLoaded ? 'opacity-100' : 'opacity-0'
                        )}
                        onLoad={() => setMotionVideoLoaded(true)}
                      />
                      {/* Play button overlay */}
                      <div 
                        className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer hover:bg-black/30 transition-colors z-[5]"
                        onClick={() => setMotionVideoPlaying(true)}
                      >
                        <div className="bg-black/50 rounded-full p-4 hover:bg-black/70 transition-colors">
                          <Play className="h-12 w-12 text-white" fill="white" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <video
                      ref={motionVideoRef}
                      src={motionVideo.url}
                      controls
                      autoPlay={motionVideoPlaying}
                      preload="metadata"
                      playsInline
                      muted
                      className={cn(
                        'absolute inset-0 w-full h-full object-contain transition-opacity duration-300 z-0',
                        motionVideoLoaded ? 'opacity-100' : 'opacity-0'
                      )}
                      onLoadedData={() => {
                        setMotionVideoLoaded(true);
                      }}
                    />
                  )}
                  {/* Delete button */}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-lg z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMotionVideo(null);
                      setMotionVideoLoaded(false);
                      setMotionVideoPlaying(false);
                      if (selectedProjectId) {
                        updateFields({
                          inputVideoUrl: undefined,
                          inputVideoPosterUrl: undefined
                        });
                      }
                    }}
                    disabled={videoUpload.isLoading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  {isDraggingOverVideo && !isScrolling && (
                    <div className="absolute inset-0 bg-primary/20 backdrop-blur-sm flex items-center justify-center pointer-events-none z-20">
                      <p className="text-lg font-medium text-foreground">Drop to replace</p>
                    </div>
                  )}
                </>
              ) : !settingsLoaded ? (
                // Show skeleton while settings are loading
                <MediaContainerSkeleton />
              ) : (
                <div className="text-center p-6 pointer-events-none">
                  <Film className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-2">
                    {isDraggingOverVideo ? 'Drop video here' : 'Drag & drop or click to upload'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isDraggingOverVideo ? '' : 'MP4, WebM, MOV supported'}
                  </p>
                </div>
              )}
            </div>
            <input
              ref={motionVideoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleMotionVideoSelect}
            />
            {motionVideo && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => motionVideoInputRef.current?.click()}
                disabled={videoUpload.isLoading}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Replace Video
              </Button>
            )}
          </div>
        </div>

        {/* Settings Section */}
        <div className="space-y-5">
          {/* Prompt */}
          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt: (Optional)</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Brief rules, e.g., preserve outfit; natural expression; no background changes"
              rows={2}
              className="resize-none"
              clearable
              onClear={() => setPrompt('')}
              voiceInput
              voiceContext="This is a prompt for character animation. Provide brief rules or guidance like 'preserve outfit', 'natural expression', 'no background changes'. Keep it concise."
              onVoiceResult={(result) => {
                setPrompt(result.prompt || result.transcription);
              }}
            />
          </div>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={!characterImage || !motionVideo || generateAnimationMutation.isPending || showSuccessState}
          className="w-full"
          size="lg"
          variant={showSuccessState ? 'default' : 'default'}
        >
          {generateAnimationMutation.isPending 
            ? 'Creating Task...' 
            : showSuccessState 
            ? '✓ Task Created!' 
            : 'Generate'}
        </Button>

        {/* Results Gallery */}
        {(() => {
          const hasValidData = videosData?.items && videosData.items.length > 0;
          const isLoadingOrFetching = videosLoading || videosFetching;
          
          // Show skeleton only if we're loading AND we already have data (refetching)
          // This prevents showing "Previous Results" when there might not be any data yet
          const shouldShowSkeleton = (isLoadingOrFetching || videosViewJustEnabled) && hasValidData;
          
          if (shouldShowSkeleton) {
            return (
              <div className="space-y-4 pt-4 border-t">
                <h2 className="text-xl font-medium">
                  Previous Results ({videosData.items.length})
                </h2>
                <SkeletonGallery
                  count={videosData.items.length}
                  columns={SKELETON_COLUMNS[3]}
                  showControls={true}
                  projectAspectRatio={projectAspectRatio}
                />
              </div>
            );
          }
          
          if (hasValidData) {
            return (
              <div className="space-y-4 pt-4 border-t">
                <h2 className="text-xl font-medium">
                  Previous Results ({videosData.items.length})
                </h2>
                <MediaGallery
                  images={videosData.items || []}
                  allShots={[]}
                  onAddToLastShot={async () => false} // No-op for video gallery
                  onAddToLastShotWithoutPosition={async () => false} // No-op for video gallery
                  onDelete={handleDeleteGeneration}
                  isDeleting={deleteGenerationMutation.isPending ? deleteGenerationMutation.variables as string : null}
                  currentToolType="character-animate"
                  initialMediaTypeFilter="video"
                  initialToolTypeFilter={true}
                  currentToolTypeName="Animate Characters"
                  showShotFilter={false}
                  initialShotFilter="all"
                  columnsPerRow={3}
                  itemsPerPage={isMobile ? 20 : 12} // Mobile: 20 (10 rows of 2), Desktop: 12 (4 rows of 3)
                  reducedSpacing={true}
                  hidePagination={videosData.items.length <= (isMobile ? 20 : 12)}
                />
              </div>
            );
          }
          
          // Only show empty state when not loading and no data
          if (!isLoadingOrFetching) {
            return (
              <div className="text-sm text-muted-foreground text-center pt-4 border-t">
                No animations yet. Create your first one above!
              </div>
            );
          }
          
          // While loading for the first time, don't show anything
          return null;
        })()}
      </div>
    </PageFadeIn>
  );
};

export default CharacterAnimatePage;

