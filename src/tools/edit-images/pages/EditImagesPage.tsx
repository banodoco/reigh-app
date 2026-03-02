import React, {
  useMemo,
  useCallback
} from 'react';
import { useFileDragTracking } from '@/shared/hooks/useFileDragTracking';
import { preventDefaultDragOver, createSingleFileDropHandler } from '@/shared/lib/dnd/dragDropUpload';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Button } from '@/shared/components/ui/button';
import {
  Upload,
  ImageIcon
} from 'lucide-react';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { GenerationRow } from '@/domains/generation/types';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { useAsyncOperation } from '@/shared/hooks/async/useAsyncOperation';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { InlineEditView } from '../components/InlineEditView';
import { cn } from '@/shared/components/ui/contracts/cn';
import { useIsMobile } from '@/shared/hooks/mobile';
import { uploadImageToStorage } from '@/shared/lib/media/imageUploader';
import { generateClientThumbnail, uploadImageWithThumbnail } from '@/shared/media/clientThumbnailGenerator';
import { VARIANT_TYPE } from '@/shared/constants/variantTypes';
import { parseRatio } from '@/shared/lib/media/aspectRatios';
import { MediaSelectionPanel } from '@/shared/components/MediaSelectionPanel';
import { useEditToolMediaPersistence } from '@/shared/hooks/media/useEditToolMediaPersistence';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

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

  // Upload operation with automatic loading state
  const uploadOperation = useAsyncOperation<GenerationRow>();
  const { isDraggingOver, handleDragEnter, handleDragLeave, resetDrag: resetDragState } = useFileDragTracking();
  const isMobile = useIsMobile();

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
  // Shared upload logic for both file input and drag-drop
  const uploadImage = useCallback(async (file: File): Promise<GenerationRow> => {
    if (!selectedProjectId) {
      throw new Error('No project selected');
    }
    const { data: { session } } = await supabase().auth.getSession();
    if (!session?.user?.id) {
      throw new Error('User not authenticated');
    }

    let publicUrl = '';
    let thumbnailUrl = '';

    try {
      const thumbnailResult = await generateClientThumbnail(file, 300, 0.8);
      const uploadResult = await uploadImageWithThumbnail(file, thumbnailResult.thumbnailBlob);
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

    const { data: generation, error: dbError } = await supabase().from('generations')
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

    await supabase().from('generation_variants').insert({
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
      onResult: (result) => setSelectedMedia(result),
      context: 'EditImagesPage',
      toastTitle: 'Failed to upload image',
      uploadOperation,
    }),
    [selectedProjectId, resetDragState, uploadOperation, uploadImage, setSelectedMedia]
  );

  return (
    <div 
      className={cn(
        "w-full flex flex-col relative",
        "min-h-[calc(100dvh-96px)]"
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
              isEditingOnMobile ? "flex flex-col min-h-[72vh]" : "h-[calc(100dvh-190px)]"
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
          </div>
        </div>
      )}
      
      {selectedMedia && (
        <div className="w-full px-4 pb-6 overflow-y-auto" style={{ minHeight: 'calc(100dvh - 96px)' }}>
          <div className="max-w-7xl mx-auto relative">
            <div className={cn(
              "rounded-2xl overflow-hidden",
              isEditingOnMobile ? "flex flex-col min-h-[72vh]" : "h-[calc(100dvh-190px)]"
            )}>
              <InlineEditView
                media={selectedMedia}
                onClose={handleEditorClose}
                onNavigateToGeneration={async (generationId) => {
                  try {
                    const { data, error } = await supabase().from('generations')
                      .select('*')
                      .eq('id', generationId)
                      .single();
                    
                    if (data && !error) {
                      setSelectedMedia(data as unknown as GenerationRow);
                    }
                  } catch (e) {
                    normalizeAndPresentError(e, { context: 'EditImagesPage', showToast: false });
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageSelectionModal({ onSelect }: { onSelect: (media: GenerationRow) => void }) {
  return <MediaSelectionPanel onSelect={onSelect} mediaType="image" />;
}
