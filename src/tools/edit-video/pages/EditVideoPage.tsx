import React, { useState, useCallback, useMemo } from 'react';
import { useFileDragTracking, preventDefaultDragOver, createSingleFileDropHandler } from '@/shared/hooks/useFileDragTracking';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Button } from '@/shared/components/ui/button';
import {
  Upload,
  ChevronDown,
  ChevronUp,
  Film
} from 'lucide-react';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { GenerationRow } from '@/types/shots';
import { toast } from '@/shared/components/ui/sonner';
import { useAsyncOperation } from '@/shared/hooks/useAsyncOperation';
import { supabase } from '@/integrations/supabase/client';
import { storagePaths, getFileExtension, MEDIA_BUCKET } from '@/shared/lib/storagePaths';
import { InlineEditVideoView } from '../components/InlineEditVideoView';
import { useProjectGenerations, type GenerationsPaginatedResponse } from '@/shared/hooks/useProjectGenerations';
import { useDeleteVariant } from '@/shared/hooks/useGenerationMutations';
import type { GeneratedImageWithMetadata } from '@/shared/components/MediaGallery';
import MediaGallery from '@/shared/components/MediaGallery';
import { useListShots } from '@/shared/hooks/useShots';
import { cn } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { extractVideoPosterFrame } from '@/shared/utils/videoPosterExtractor';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { VARIANT_TYPE } from '@/shared/constants/variantTypes';
import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';
import { parseRatio } from '@/shared/lib/aspectRatios';
import { variantToGenerationRow } from '@/shared/lib/mediaTypeHelpers';
import { MediaSelectionPanel } from '@/shared/components/MediaSelectionPanel';
import { useEditToolMediaPersistence } from '@/shared/hooks/useEditToolMediaPersistence';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { TOOL_IDS } from '@/shared/lib/toolConstants';

const TOOL_TYPE = TOOL_IDS.EDIT_VIDEO;

// Preload video poster helper - warm up the browser cache
const preloadedVideoRef = { current: null as string | null };
const preloadVideoPoster = (gen: GenerationRow) => {
  const urlToPreload = gen.thumbnail_url || gen.location;
  if (!urlToPreload || preloadedVideoRef.current === urlToPreload) return;
  const img = new Image();
  img.src = urlToPreload;
  preloadedVideoRef.current = urlToPreload;
};

const VIDEO_EXTRA_CLEAR_DATA = { lastEditedMediaSegments: undefined };

export default function EditVideoPage() {
  const { selectedProjectId, projects } = useProject();

  // Get project aspect ratio for skeleton sizing
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = selectedProject?.aspectRatio || '16:9';
  const aspectRatioValue = parseRatio(projectAspectRatio);
  const [savedSegments, setSavedSegments] = useState<PortionSelection[] | undefined>(undefined);
  const [resultsPage, setResultsPage] = useState(1);

  // Upload operation with automatic loading state
  const uploadOperation = useAsyncOperation<GenerationRow>();
  const [showResults, setShowResults] = useState(true);
  const { isDraggingOver, handleDragEnter, handleDragLeave, resetDrag: resetDragState } = useFileDragTracking();
  const isMobile = useIsMobile();
  const { data: shots } = useListShots(selectedProjectId);

  // Delete mutation for gallery items (uses variants table for edit tools)
  const deleteVariantMutation = useDeleteVariant();
  const handleDeleteVariant = useCallback((id: string) => {
    deleteVariantMutation.mutate(id);
  }, [deleteVariantMutation]);

  // Restore saved segments when settings are loaded from DB
  const handleSettingsLoaded = useCallback((settings: Record<string, unknown>) => {
    const storedSegments = settings.lastEditedMediaSegments as PortionSelection[] | undefined;
    if (storedSegments && storedSegments.length > 0) {
      setSavedSegments(storedSegments);
    }
  }, []);

  // Persisted media selection (load/save last-edited media ID to project settings)
  const {
    selectedMedia,
    setSelectedMedia,
    handleEditorClose: handleEditorCloseBase,
    showSkeleton,
    updateUISettings,
    isUISettingsLoading,
    isLoading: isLoadingPersistedMedia,
    uiSettings,
    userClosedEditor,
  } = useEditToolMediaPersistence({
    settingsToolId: 'edit-video-ui',
    projectId: selectedProjectId ?? undefined,
    preloadMedia: preloadVideoPoster,
    onSettingsLoaded: handleSettingsLoaded,
    extraClearData: VIDEO_EXTRA_CLEAR_DATA,
  });

  // Wrap editor close to also clear saved segments
  const handleEditorClose = useCallback(() => {
    handleEditorCloseBase();
    setSavedSegments(undefined);
  }, [handleEditorCloseBase]);

  // Callback to save segments when they change in InlineEditVideoView
  const handleSegmentsChange = useCallback((segments: PortionSelection[]) => {
    if (!selectedProjectId || isUISettingsLoading) return;
    updateUISettings('project', { lastEditedMediaSegments: segments });
  }, [selectedProjectId, isUISettingsLoading, updateUISettings]);
  
  // Lightbox state
  const [isLightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxInitialMedia, setLightboxInitialMedia] = useState<GenerationRow | null>(null);
  const [lightboxVariantId, setLightboxVariantId] = useState<string | null>(null);

  // Transform variant data to GenerationRow format for lightbox (using parent generation id)
  const transformVariantToGeneration = useCallback(
    (media: GeneratedImageWithMetadata): GenerationRow =>
      variantToGenerationRow(media, 'video', selectedProjectId || '') as unknown as GenerationRow,
    [selectedProjectId]
  );
  
  // Fetch results generated by this tool (video variants)
  const {
    data: resultsData,
  } = useProjectGenerations(
    selectedProjectId || null,
    resultsPage,
    12,
    true,
    {
      variantsOnly: true, // Fetch from generation_variants table
      toolType: TOOL_TYPE, // Only show variants created by edit-video tool
      mediaType: 'video', // Only show video variants
      parentsOnly: true, // Exclude child variants
    }
  );
  
  // All results for lightbox navigation (memoized to prevent callback re-creation)
  const allResults = useMemo(() => (resultsData as GenerationsPaginatedResponse | undefined)?.items || [], [resultsData]);
  
  // Navigate to previous/next in lightbox
  const handleNavigateLightbox = useCallback((direction: 'prev' | 'next') => {
    if (!lightboxInitialMedia || allResults.length === 0) return;
    // Find by variant ID since lightboxInitialMedia.id is the parent generation id
    const currentIndex = allResults.findIndex((m) => m.id === lightboxVariantId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'prev' 
      ? (currentIndex - 1 + allResults.length) % allResults.length
      : (currentIndex + 1) % allResults.length;
    const newMedia = allResults[newIndex];
    setLightboxVariantId(newMedia.id);
    setLightboxInitialMedia(transformVariantToGeneration(newMedia));
  }, [lightboxInitialMedia, allResults, lightboxVariantId, transformVariantToGeneration]);

  // Shared upload logic for both file input and drag-drop
  const uploadVideo = useCallback(async (file: File): Promise<GenerationRow> => {
    if (!selectedProjectId) {
      throw new Error('No project selected');
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      throw new Error('User not authenticated');
    }
    const userId = session.user.id;
    const timestamp = Date.now();

    // Extract poster frame from video
    let posterUrl = '';
    try {
      const posterBlob = await extractVideoPosterFrame(file);
      const posterFileName = storagePaths.thumbnail(userId, `${timestamp}-poster.jpg`);
      const { error: posterError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(posterFileName, posterBlob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'image/jpeg'
        });

      if (!posterError) {
        const { data: { publicUrl } } = supabase.storage
          .from(MEDIA_BUCKET)
          .getPublicUrl(posterFileName);
        posterUrl = publicUrl;
      }
    } catch { /* intentionally ignored */ }

    const fileExt = getFileExtension(file.name, file.type, 'mp4');
    const fileName = storagePaths.upload(userId, `${timestamp}.${fileExt}`);

    const { error: uploadError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (uploadError) throw uploadError;

    const { data: { publicUrl: videoUrl } } = supabase.storage
      .from(MEDIA_BUCKET)
      .getPublicUrl(fileName);

    const generationParams = {
      prompt: 'Uploaded video',
      status: 'completed',
      is_uploaded: true,
      model: 'upload'
    };

    const { data: generation, error: dbError } = await supabase
      .from('generations')
      .insert({
        project_id: selectedProjectId,
        location: videoUrl,
        thumbnail_url: posterUrl || videoUrl,
        type: 'video',
        params: generationParams
      })
      .select()
      .single();

    if (dbError) throw dbError;

    await supabase.from('generation_variants').insert({
      generation_id: generation.id,
      location: videoUrl,
      thumbnail_url: posterUrl || videoUrl,
      is_primary: true,
      variant_type: VARIANT_TYPE.ORIGINAL,
      name: 'Original',
      params: generationParams,
    });

    return generation as unknown as GenerationRow;
  }, [selectedProjectId]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    if (!selectedProjectId) {
      toast.error("Please select a project first");
      return;
    }

    const file = files[0];
    if (!file.type.startsWith('video/')) {
      toast.error("Please upload a video file");
      return;
    }

    const result = await uploadOperation.execute(
      () => uploadVideo(file),
      { context: 'EditVideoPage', toastTitle: 'Failed to upload video' }
    );
    if (result) {
      setSelectedMedia(result);
    }
  };

  const isEditingOnMobile = selectedMedia && isMobile;

  // Drag and drop handlers
  const handleDragOver = preventDefaultDragOver;

  const handleDrop = useMemo(() =>
    createSingleFileDropHandler({
      mimePrefix: 'video/',
      mimeErrorMessage: "Please drop a video file",
      resetDrag: resetDragState,
      getProjectId: () => selectedProjectId ?? undefined,
      upload: (file) => uploadVideo(file),
      onResult: (result) => setSelectedMedia(result as GenerationRow),
      context: 'EditVideoPage',
      toastTitle: 'Failed to upload video',
      uploadOperation: uploadOperation as any,
    }),
    [selectedProjectId, resetDragState, uploadOperation, uploadVideo, setSelectedMedia]
  );

  return (
    <div 
      className={cn(
        "w-full flex flex-col relative",
        isEditingOnMobile ? "min-h-[calc(100dvh-96px)]" : "h-[calc(100dvh-96px)]"
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="px-4 pt-6 pb-6 max-w-7xl mx-auto w-full">
        <h1 className="text-3xl font-light tracking-tight text-foreground">Edit Videos</h1>
      </div>
      
      {/* Show skeleton when loading settings, loading persisted media, OR we have a stored ID but no media yet (and user didn't just close it) */}
      {showSkeleton && (
        <div className="w-full px-4 overflow-y-auto" style={{ minHeight: 'calc(100dvh - 96px)' }}>
          <div className="max-w-7xl mx-auto relative">
            <div className={cn(
              "rounded-2xl overflow-hidden bg-black",
              isEditingOnMobile ? "flex flex-col min-h-[60vh]" : "h-[70vh]"
            )}>
              {isMobile ? (
                // Mobile: Match InlineEditVideoView mobile stacked layout
                <div className="w-full flex flex-col bg-transparent">
                  <div 
                    className="flex items-center justify-center relative bg-black w-full shrink-0 rounded-t-2xl overflow-hidden"
                    style={{ height: '35vh' }}
                  >
                    <Skeleton 
                      className="rounded-lg"
                      style={{ 
                        aspectRatio: aspectRatioValue,
                        maxWidth: '100%',
                        maxHeight: '100%',
                        width: aspectRatioValue >= 1 ? '90%' : 'auto',
                        height: aspectRatioValue >= 1 ? 'auto' : '90%'
                      }} 
                    />
                  </div>
                  {/* Timeline skeleton */}
                  <div className="p-4 bg-background">
                    <Skeleton className="h-16 w-full rounded-lg" />
                  </div>
                </div>
              ) : (
                // Desktop: Match InlineEditVideoView desktop layout (60% video + 40% settings)
                <div className="w-full h-full flex flex-row bg-transparent overflow-hidden">
                  {/* Left side: Video + Timeline stacked */}
                  <div className="flex-1 flex flex-col min-h-0 h-full">
                    {/* Video area */}
                    <div className="relative flex items-center justify-center bg-zinc-900 overflow-hidden flex-shrink rounded-t-lg p-4 pt-24">
                      <Skeleton 
                        className="rounded-lg"
                        style={{ 
                          aspectRatio: aspectRatioValue,
                          maxWidth: '90%',
                          maxHeight: '40vh',
                          width: aspectRatioValue >= 1 ? '80%' : 'auto',
                          height: aspectRatioValue >= 1 ? 'auto' : '80%'
                        }} 
                      />
                    </div>
                    {/* Spacer */}
                    <div className="h-4 bg-zinc-900" />
                    {/* Timeline skeleton */}
                    <div className="bg-zinc-900 px-4 pt-3 pb-4 rounded-b-lg flex-shrink-0">
                      <Skeleton className="h-16 w-full rounded-lg" />
                      <div className="flex justify-center mt-2">
                        <Skeleton className="h-8 w-32" />
                      </div>
                    </div>
                  </div>
                  {/* Right panel skeleton for controls - 40% width */}
                  <div className="w-[40%] bg-background border-l border-border p-4 overflow-y-auto">
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-24 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {!selectedMedia && !isUISettingsLoading && !isLoadingPersistedMedia && (!uiSettings?.lastEditedMediaId || userClosedEditor.current) && (
        <div className="w-full px-4 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row rounded-2xl overflow-hidden" style={{ height: isMobile ? '60vh' : '65vh' }}>
              {/* Left Panel - Placeholder */}
              <div 
                className="relative flex items-center justify-center bg-black w-full h-[30%] md:w-[60%] md:h-full md:flex-1"
              >
                {/* Drag overlay - positioned over left panel */}
                {isDraggingOver && (
                  <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed border-primary bg-primary/10">
                      <Film className="w-16 h-16 text-primary animate-bounce" />
                      <p className="text-xl font-medium text-primary">Drop video to upload</p>
                    </div>
                  </div>
                )}
                
                {/* Upload loading state */}
                {uploadOperation.isLoading && (
                  <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4 p-8">
                      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                      <p className="text-lg font-medium text-white">Uploading video...</p>
                    </div>
                  </div>
                )}
                
                {!uploadOperation.isLoading && !isDraggingOver && (
                 <div className="bg-background/90 backdrop-blur-sm rounded-lg border border-border/50 p-6 md:p-8 flex flex-col items-center justify-center gap-y-4 md:gap-y-6 max-w-md mx-4">
                  <div className="text-center space-y-1 md:space-y-2">
                    <p className="text-muted-foreground text-xs md:hidden">
                      Select or upload a video
                    </p>
                    <p className="text-muted-foreground text-base hidden md:block">
                      Select a video from the right or upload a new one to regenerate portions.
                    </p>
                  </div>

                  <div className="relative w-full max-w-xs">
                    <input
                      type="file"
                      accept="video/*"
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      onChange={handleFileUpload}
                      disabled={uploadOperation.isLoading}
                    />
                    <Button variant="outline" size="lg" className="w-full gap-2" disabled={uploadOperation.isLoading}>
                      <Upload className="w-4 h-4" />
                      Upload Video
                    </Button>
                  </div>
                 </div>
                )}
              </div>

              {/* Right Panel - Selection UI */}
              <div 
                className={cn(
                  "bg-background border-t md:border-t-0 md:border-l border-border overflow-hidden relative z-[60] flex flex-col w-full h-[70%] md:w-[40%] md:h-full"
                )}
              >
                 <VideoSelectionPanel
                   onSelect={(media) => {
                     // Preload the poster/thumbnail before showing edit view
                     preloadVideoPoster(media);
                     setSelectedMedia(media);
                   }}
                 />
              </div>
            </div>
            
            {/* Results Gallery - Initial View */}
            {allResults.length > 0 && (
              <div className="mt-6 pb-6">
                <button 
                  onClick={() => setShowResults(!showResults)}
                  className="flex items-center gap-2 text-lg font-medium mb-4 hover:text-primary transition-colors"
                >
                  Edited Videos
                  {showResults ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <span className="text-sm text-muted-foreground font-normal">
                    ({(resultsData as GenerationsPaginatedResponse | undefined)?.total || 0})
                  </span>
                </button>
                
                {showResults && (
                  <MediaGallery
                    images={allResults}
                    allShots={shots || []}
                    onImageClick={(media) => {
                      setLightboxOpen(true);
                      setLightboxVariantId(media.id);
                      setLightboxInitialMedia(transformVariantToGeneration(media));
                    }}
                    itemsPerPage={12}
                    offset={(resultsPage - 1) * 12}
                    totalCount={(resultsData as GenerationsPaginatedResponse | undefined)?.total || 0}
                    onServerPageChange={setResultsPage}
                    serverPage={resultsPage}
                    onDelete={handleDeleteVariant}
                    isDeleting={deleteVariantMutation.isPending ? deleteVariantMutation.variables as string : null}
                    config={{
                      showShare: false,
                      showEdit: false,
                      enableSingleClick: true,
                      hideMediaTypeFilter: true,
                      hideBottomPagination: true,
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      {selectedMedia && (
        <div className="w-full px-4 overflow-y-auto" style={{ minHeight: 'calc(100dvh - 96px)' }}>
          <div className="max-w-7xl mx-auto relative">
            <div className={cn(
              "rounded-2xl overflow-hidden",
              isEditingOnMobile ? "flex flex-col min-h-[60vh]" : "h-[70vh]"
            )}>
              <InlineEditVideoView
                key={selectedMedia.id} // Force remount when media changes
                media={selectedMedia}
                onClose={handleEditorClose}
                onVideoSaved={async (_newUrl) => {
                }}
                onNavigateToGeneration={async (generationId) => {
                  try {
                    const { data, error } = await supabase
                      .from('generations')
                      .select('*')
                      .eq('id', generationId)
                      .single();
                    
                    if (data && !error) {
                      setSelectedMedia(data as unknown as GenerationRow);
                      setSavedSegments(undefined); // Clear saved segments when navigating to new generation
                    }
                  } catch (e) {
                    handleError(e, { context: 'EditVideoPage', showToast: false });
                  }
                }}
                initialSegments={savedSegments}
                onSegmentsChange={handleSegmentsChange}
              />
            </div>
            
            {/* Results Gallery */}
            {allResults.length > 0 && (
              <div className="mt-6 pb-6">
                <button 
                  onClick={() => setShowResults(!showResults)}
                  className="flex items-center gap-2 text-lg font-medium mb-4 hover:text-primary transition-colors"
                >
                  Edited Videos
                  {showResults ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <span className="text-sm text-muted-foreground font-normal">
                    ({(resultsData as GenerationsPaginatedResponse | undefined)?.total || 0})
                  </span>
                </button>
                
                {showResults && (
                  <MediaGallery
                    images={allResults}
                    allShots={shots || []}
                    onImageClick={(media) => {
                      setLightboxOpen(true);
                      setLightboxVariantId(media.id);
                      setLightboxInitialMedia(transformVariantToGeneration(media));
                    }}
                    itemsPerPage={12}
                    offset={(resultsPage - 1) * 12}
                    totalCount={(resultsData as GenerationsPaginatedResponse | undefined)?.total || 0}
                    onServerPageChange={setResultsPage}
                    serverPage={resultsPage}
                    onDelete={handleDeleteVariant}
                    isDeleting={deleteVariantMutation.isPending ? deleteVariantMutation.variables as string : null}
                    config={{
                      showShare: false,
                      showEdit: false,
                      enableSingleClick: true,
                      hideMediaTypeFilter: true,
                      hideBottomPagination: true,
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Media Lightbox */}
      {isLightboxOpen && lightboxInitialMedia && (
        <MediaLightbox
          media={lightboxInitialMedia}
          onClose={() => {
            setLightboxOpen(false);
            setLightboxVariantId(null);
          }}
          onNext={allResults.length > 1 ? () => handleNavigateLightbox('next') : undefined}
          onPrevious={allResults.length > 1 ? () => handleNavigateLightbox('prev') : undefined}
          showNavigation={allResults.length > 1}
          showTaskDetails={true}
          initialVariantId={lightboxVariantId || undefined}
        />
      )}
    </div>
  );
}

function VideoSelectionPanel({ onSelect }: { onSelect: (media: GenerationRow) => void }) {
  return <MediaSelectionPanel onSelect={onSelect} mediaType="video" />;
}
