import React, {
  useState,
  useMemo,
  useCallback
} from 'react';
import { useFileDragTracking, preventDefaultDragOver, createSingleFileDropHandler } from '@/shared/hooks/useFileDragTracking';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Button } from '@/shared/components/ui/button';
import {
  Upload,
  ChevronDown,
  ChevronUp,
  ImageIcon
} from 'lucide-react';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { GenerationRow } from '@/types/shots';
import { toast } from '@/shared/components/ui/sonner';
import { useAsyncOperation } from '@/shared/hooks/useAsyncOperation';
import { supabase } from '@/integrations/supabase/client';
import { InlineEditView } from '../components/InlineEditView';
import { useProjectGenerations, type GenerationsPaginatedResponse } from '@/shared/hooks/useProjectGenerations';
import { useDeleteVariant } from '@/shared/hooks/useGenerationMutations';
import type { GeneratedImageWithMetadata } from '@/shared/components/MediaGallery';
import MediaGallery from '@/shared/components/MediaGallery';
import { useListShots } from '@/shared/hooks/useShots';
import { cn } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { generateClientThumbnail, uploadImageWithThumbnail } from '@/shared/lib/clientThumbnailGenerator';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { useGetTask } from '@/shared/hooks/useTasks';
import { VARIANT_TYPE } from '@/shared/constants/variantTypes';
import { deriveInputImages } from '@/shared/components/MediaGallery/utils';
import { parseRatio } from '@/shared/lib/aspectRatios';
import { variantToGenerationRow } from '@/shared/lib/mediaTypeHelpers';
import { MediaSelectionPanel } from '@/shared/components/MediaSelectionPanel';
import { useEditToolMediaPersistence } from '@/shared/hooks/useEditToolMediaPersistence';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { TOOL_IDS } from '@/shared/lib/toolConstants';

const TOOL_TYPE = TOOL_IDS.EDIT_IMAGES;

// Preload image helper - warm up the browser cache
const preloadedImageRef = { current: null as string | null };
const preloadImage = (gen: GenerationRow) => {
  const imageUrl = gen.location || gen.thumbnail_url;
  if (!imageUrl || preloadedImageRef.current === imageUrl) return;
  const img = new Image();
  img.src = imageUrl;
  preloadedImageRef.current = imageUrl;
};

export default function EditImagesPage() {
  const { selectedProjectId, projects } = useProject();

  // Get project aspect ratio for skeleton sizing
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = selectedProject?.aspectRatio || '16:9';
  const aspectRatioValue = parseRatio(projectAspectRatio);
  const [lightboxMedia, setLightboxMedia] = useState<GenerationRow | null>(null); // For viewing results in lightbox
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

  // Persisted media selection (load/save last-edited media ID to project settings)
  const {
    selectedMedia,
    setSelectedMedia,
    handleEditorClose,
    showSkeleton,
  } = useEditToolMediaPersistence({
    settingsToolId: 'edit-images-ui',
    projectId: selectedProjectId ?? undefined,
    preloadMedia: preloadImage,
  });
  
  // Fetch edit variants created by this tool
  const {
    data: resultsData,
  } = useProjectGenerations(
    selectedProjectId || null,
    resultsPage,
    12,
    true,
    {
      variantsOnly: true, // Fetch edit variants from generation_variants table
      toolType: TOOL_TYPE, // Filter to only show variants created by edit-images tool
    }
  );

  // Shared upload logic for both file input and drag-drop
  const uploadImage = useCallback(async (file: File): Promise<GenerationRow> => {
    if (!selectedProjectId) {
      throw new Error('No project selected');
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      throw new Error('User not authenticated');
    }
    const userId = session.user.id;

    let publicUrl = '';
    let thumbnailUrl = '';

    try {
      const thumbnailResult = await generateClientThumbnail(file, 300, 0.8);
      const uploadResult = await uploadImageWithThumbnail(file, thumbnailResult.thumbnailBlob, userId);
      publicUrl = uploadResult.imageUrl;
      thumbnailUrl = uploadResult.thumbnailUrl;
    } catch {
      publicUrl = await uploadImageToStorage(file, 3);
      thumbnailUrl = publicUrl;
    }

    const generationParams = {
      prompt: 'Uploaded image',
      status: 'completed',
      is_uploaded: true,
      width: 1024,
      height: 1024,
      model: 'upload'
    };

    const { data: generation, error: dbError } = await supabase
      .from('generations')
      .insert({
        project_id: selectedProjectId,
        location: publicUrl,
        thumbnail_url: thumbnailUrl,
        type: 'image',
        params: generationParams
      })
      .select()
      .single();

    if (dbError) throw dbError;

    await supabase.from('generation_variants').insert({
      generation_id: generation.id,
      location: publicUrl,
      thumbnail_url: thumbnailUrl,
      is_primary: true,
      variant_type: VARIANT_TYPE.ORIGINAL,
      name: 'Original',
      params: generationParams,
    });

    return generation as GenerationRow;
  }, [selectedProjectId]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    if (!selectedProjectId) {
      toast.error("Please select a project first");
      return;
    }

    const result = await uploadOperation.execute(
      () => uploadImage(files[0]),
      { context: 'EditImagesPage', toastTitle: 'Failed to upload image' }
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
      mimePrefix: 'image/',
      mimeErrorMessage: "Please drop an image file",
      resetDrag: resetDragState,
      getProjectId: () => selectedProjectId ?? undefined,
      upload: (file) => uploadImage(file),
      onResult: (result) => setSelectedMedia(result as GenerationRow),
      context: 'EditImagesPage',
      toastTitle: 'Failed to upload image',
      uploadOperation: uploadOperation as any,
    }),
    [selectedProjectId, resetDragState, uploadOperation, uploadImage, setSelectedMedia]
  );

  // Get results items for navigation
  const resultsItems = useMemo(
    () => (resultsData as GenerationsPaginatedResponse | undefined)?.items ?? [],
    [resultsData]
  );
  const [lightboxIndex, setLightboxIndex] = useState<number>(-1);

  // Store the variant ID separately for lightbox
  const [lightboxVariantId, setLightboxVariantId] = useState<string | null>(null);

  // Transform variant data to GenerationRow format for lightbox
  const transformVariantToGeneration = (media: GeneratedImageWithMetadata): GenerationRow =>
    variantToGenerationRow(media, 'image', selectedProjectId || '') as unknown as GenerationRow;

  const handleResultClick = (media: GeneratedImageWithMetadata) => {
    const index = resultsItems.findIndex((item) => item.id === media.id);
    setLightboxIndex(index);
    setLightboxVariantId(media.id); // Store the variant ID to pre-select it
    setLightboxMedia(transformVariantToGeneration(media));
  };

  const handleLightboxNext = () => {
    if (lightboxIndex < resultsItems.length - 1) {
      const nextIndex = lightboxIndex + 1;
      const nextItem = resultsItems[nextIndex];
      setLightboxIndex(nextIndex);
      setLightboxVariantId(nextItem.id);
      setLightboxMedia(transformVariantToGeneration(nextItem));
    }
  };

  const handleLightboxPrevious = () => {
    if (lightboxIndex > 0) {
      const prevIndex = lightboxIndex - 1;
      const prevItem = resultsItems[prevIndex];
      setLightboxIndex(prevIndex);
      setLightboxVariantId(prevItem.id);
      setLightboxMedia(transformVariantToGeneration(prevItem));
    }
  };

  const handleLightboxClose = () => {
    setLightboxMedia(null);
    setLightboxIndex(-1);
    setLightboxVariantId(null);
  };

  // Get task ID from current lightbox variant for task details
  const currentTaskId = useMemo<string | null>(() => {
    if (lightboxIndex >= 0 && resultsItems[lightboxIndex]) {
      const item = resultsItems[lightboxIndex];
      // Task ID is stored in metadata.source_task_id (from variant params)
      const sourceTaskId = item.metadata?.source_task_id;
      return typeof sourceTaskId === 'string' ? sourceTaskId : null;
    }
    return null;
  }, [lightboxIndex, resultsItems]);

  // Fetch task data for the current lightbox item
  const { data: taskData, isLoading: isLoadingTask, error: taskError } = useGetTask(currentTaskId ?? '');

  // Derive input images from task params
  const inputImages = useMemo(() => {
    if (!taskData?.params) return [];
    return deriveInputImages(taskData.params as Record<string, unknown>);
  }, [taskData]);

  // Helper to render the results gallery (used in both views)
  const renderResultsGallery = () => {
    if (!(resultsData as GenerationsPaginatedResponse | undefined)?.items?.length) return null;
    
    return (
      <div className="mt-6 pb-6">
        <button 
          onClick={() => setShowResults(!showResults)}
          className="flex items-center gap-2 text-lg font-medium mb-4 hover:text-primary transition-colors"
        >
          Edited Images
          {showResults ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <span className="text-sm text-muted-foreground font-normal">
            ({(resultsData as GenerationsPaginatedResponse | undefined)?.total || 0})
          </span>
        </button>
        
        {showResults && (
          <MediaGallery
            images={(resultsData as GenerationsPaginatedResponse | undefined)?.items || []}
            allShots={shots || []}
            onImageClick={handleResultClick}
            itemsPerPage={12}
            offset={(resultsPage - 1) * 12}
            totalCount={(resultsData as GenerationsPaginatedResponse | undefined)?.total || 0}
            onServerPageChange={setResultsPage}
            serverPage={resultsPage}
            onDelete={handleDeleteVariant}
            isDeleting={deleteVariantMutation.isPending ? deleteVariantMutation.variables as string : null}
            defaultFilters={{ toolTypeFilter: false }}
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
    );
  };

  return (
    <div 
      className={cn(
        "w-full flex flex-col relative",
        isEditingOnMobile ? "min-h-[calc(100dvh-96px)]" : "min-h-[calc(100dvh-96px)]"
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="px-4 pt-6 pb-6 max-w-7xl mx-auto w-full">
        <h1 className="text-3xl font-light tracking-tight text-foreground">Edit Images</h1>
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
                // Mobile: Match InlineEditView mobile layout (45dvh height)
                <div 
                  className="flex items-center justify-center relative bg-black w-full shrink-0 rounded-t-2xl overflow-hidden"
                  style={{ height: '45dvh' }}
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
              ) : (
                // Desktop: Match InlineEditView desktop layout (60% width, 100% height)
                <div className="w-full h-full flex bg-transparent overflow-hidden">
                  <div 
                    className="flex-1 flex items-center justify-center relative bg-black rounded-l-xl overflow-hidden"
                    style={{ width: '60%', height: '100%' }}
                  >
                    <Skeleton 
                      className="rounded-lg"
                      style={{ 
                        aspectRatio: aspectRatioValue,
                        maxWidth: '90%',
                        maxHeight: '90%',
                        width: aspectRatioValue >= 1 ? '80%' : 'auto',
                        height: aspectRatioValue >= 1 ? 'auto' : '80%'
                      }} 
                    />
                  </div>
                  {/* Right panel skeleton for controls */}
                  <div className="w-[40%] bg-background border-l border-border p-4">
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-full" />
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
      
      {!selectedMedia && !showSkeleton && (
        <div className="w-full px-4 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {/* Selection UI - reduced height */}
            <div className="flex flex-col md:flex-row rounded-2xl overflow-hidden" style={{ height: isMobile ? '60vh' : '65vh' }}>
              {/* Left Panel - Placeholder */}
              <div 
                className="relative flex items-center justify-center bg-black w-full h-[30%] md:w-[60%] md:h-full md:flex-1"
              >
                {/* Drag overlay - positioned over left panel */}
                {isDraggingOver && (
                  <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed border-primary bg-primary/10">
                      <ImageIcon className="w-16 h-16 text-primary animate-bounce" />
                      <p className="text-xl font-medium text-primary">Drop image to upload</p>
                    </div>
                  </div>
                )}
                
                {/* Upload loading state */}
                {uploadOperation.isLoading && (
                  <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4 p-8">
                      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                      <p className="text-lg font-medium text-white">Uploading image...</p>
                    </div>
                  </div>
                )}
                
                {!uploadOperation.isLoading && !isDraggingOver && (
                 <div className="bg-background/90 backdrop-blur-sm rounded-lg border border-border/50 p-6 md:p-8 flex flex-col items-center justify-center gap-y-4 md:gap-y-6 max-w-md mx-4">
                  <div className="text-center space-y-1 md:space-y-2">
                    <p className="text-muted-foreground text-xs md:hidden">
                      Select or upload an image
                    </p>
                    <p className="text-muted-foreground text-base hidden md:block">
                      Select an image from the right or upload a new one to start editing.
                    </p>
                  </div>

                  <div className="relative w-full max-w-xs">
                    <input
                      type="file"
                      accept="image/*"
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      onChange={handleFileUpload}
                      disabled={uploadOperation.isLoading}
                    />
                    <Button variant="outline" size="lg" className="w-full gap-2" disabled={uploadOperation.isLoading}>
                      <Upload className="w-4 h-4" />
                      Upload Image
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
               <ImageSelectionModal
                 onSelect={(media) => {
                   // Preload the image before showing edit view to prevent flash
                   preloadImage(media);
                   setSelectedMedia(media);
                 }}
               />
              </div>
            </div>
            
            {/* Results Gallery - visible in main view */}
            {renderResultsGallery()}
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
              <InlineEditView
                media={selectedMedia}
                onClose={handleEditorClose}
                onNavigateToGeneration={async (generationId) => {
                  try {
                    const { data, error } = await supabase
                      .from('generations')
                      .select('*')
                      .eq('id', generationId)
                      .single();
                    
                    if (data && !error) {
                      setSelectedMedia(data as unknown as GenerationRow);
                    }
                  } catch (e) {
                    handleError(e, { context: 'EditImagesPage', showToast: false });
                  }
                }}
              />
            </div>
            
            {/* Results Gallery - also visible when editing */}
            {renderResultsGallery()}
          </div>
        </div>
      )}
      
      {/* MediaLightbox for viewing results */}
      {lightboxMedia && (
        <MediaLightbox
          media={lightboxMedia}
          onClose={handleLightboxClose}
          toolTypeOverride={TOOL_IDS.EDIT_IMAGES}
          starred={lightboxMedia.starred ?? false}
          showMagicEdit={true}
          showNavigation={true}
          allShots={shots || []}
          onNext={lightboxIndex < resultsItems.length - 1 ? handleLightboxNext : undefined}
          onPrevious={lightboxIndex > 0 ? handleLightboxPrevious : undefined}
          hasNext={lightboxIndex < resultsItems.length - 1}
          hasPrevious={lightboxIndex > 0}
          showTaskDetails={true}
          taskDetailsData={{
            task: taskData ?? null,
            isLoading: isLoadingTask,
            error: taskError,
            inputImages,
            taskId: currentTaskId ?? null,
          }}
          initialVariantId={lightboxVariantId || undefined}
        />
      )}
    </div>
  );
}

function ImageSelectionModal({ onSelect }: { onSelect: (media: GenerationRow) => void }) {
  return <MediaSelectionPanel onSelect={onSelect} mediaType="image" />;
}
