import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { useProjectGenerations, type GenerationsPaginatedResponse } from '@/shared/hooks/useProjectGenerations';
import { useDeleteGeneration, useCreateGeneration } from '@/shared/hooks/useGenerationMutations';
import { MediaGallery } from '@/shared/components/MediaGallery';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { SKELETON_COLUMNS } from '@/shared/components/MediaGallery/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { Card } from '@/shared/components/ui/card';
import { PageFadeIn } from '@/shared/components/transitions';
import {
  DndContext,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import {
  validateClipsForJoin,
  calculateEffectiveFrameCount,
  type ClipFrameInfo,
  type ValidationResult,
} from '../utils/validation';
import { useJoinClipsSettings } from '../hooks/useJoinClipsSettings';
import { useClipManager } from '../hooks/useClipManager';
import { useJoinClipsGenerate } from '../hooks/useJoinClipsGenerate';
import { JoinClipsSettingsForm, type ClipPairInfo, DEFAULT_JOIN_CLIPS_PHASE_CONFIG } from '../components/JoinClipsSettingsForm';
import { SortableClip } from '../components/SortableClip';

const JoinClipsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { selectedProjectId, projects } = useProject();
  const isMobile = useIsMobile();

  // Get current project for aspect ratio
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;

  // Settings hook
  const joinSettings = useJoinClipsSettings(selectedProjectId);
  const {
    prompt: globalPrompt,
    negativePrompt,
    contextFrameCount,
    gapFrameCount,
    replaceMode,
    keepBridgingImages,
    useIndividualPrompts,
    enhancePrompt,
    useInputVideoResolution,
    useInputVideoFps,
    noisedInputVideo,
    loopFirstClip,
    motionMode,
    phaseConfig,
    randomSeed,
    selectedPhasePresetId,
  } = joinSettings.settings;

  const settingsLoaded = joinSettings.status !== 'idle' && joinSettings.status !== 'loading';

  // Fetch available LoRAs
  const { data: availableLoras } = usePublicLoras();

  // Initialize LoRA manager
  const loraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId || undefined,
    persistenceScope: 'project',
    enableProjectPersistence: true,
    persistenceKey: 'join-clips',
  });

  // Sync loraManager.selectedLoras → joinSettings.loras for persistence
  const lorasSyncStateRef = useRef<{ lastSyncedKey: string }>({ lastSyncedKey: '' });
  useEffect(() => {
    if (!settingsLoaded) return;

    const lorasKey = loraManager.selectedLoras.map(l => `${l.id}:${l.strength}`).sort().join(',');
    if (lorasKey === lorasSyncStateRef.current.lastSyncedKey) return;

    lorasSyncStateRef.current.lastSyncedKey = lorasKey;
    joinSettings.updateField('loras', loraManager.selectedLoras.map(l => ({
      id: l.id,
      strength: l.strength,
    })));
  }, [loraManager.selectedLoras, joinSettings, settingsLoaded]);

  // Create mutation for uploaded clips (passed to useClipManager)
  const createGenerationMutation = useCreateGeneration();

  // Clip management hook
  const clipManager = useClipManager({
    selectedProjectId,
    joinSettings,
    settingsLoaded,
    loopFirstClip,
    createGenerationMutation,
  });

  const {
    clips,
    setClips,
    transitionPrompts,
    uploadingClipId,
    draggingOverClipId,
    isScrolling,
    lightboxClip,
    setLightboxClip,
    isLoadingPersistedMedia,
    cachedClipsCount,
    videoRefs,
    fileInputRefs,
    handleRemoveClip,
    handleClearVideo,
    handleVideoUpload,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handlePromptChange,
    sensors,
    handleDragEnd,
  } = clipManager;

  // Initialize keepBridgingImages to false if undefined (new field for existing projects)
  useEffect(() => {
    if (keepBridgingImages === undefined && settingsLoaded) {
      joinSettings.updateField('keepBridgingImages', false);
    }
  }, [keepBridgingImages, settingsLoaded, joinSettings]);

  // Calculate validation result based on current settings and clip durations
  const validationResult = useMemo((): ValidationResult | null => {
    const validClips = clips.filter(c => c.url);
    if (validClips.length < 2) return null;

    const stillLoading = validClips.some(c => c.metadataLoading || c.durationSeconds === undefined);
    if (stillLoading) return null;

    const clipFrameInfos: ClipFrameInfo[] = validClips.map((clip, index) => {
      const frameCount = clip.durationSeconds
        ? calculateEffectiveFrameCount(clip.durationSeconds, useInputVideoFps)
        : 0;

      return {
        index,
        name: `Clip #${index + 1}`,
        frameCount,
        durationSeconds: clip.durationSeconds,
        source: clip.durationSeconds ? 'estimated' : 'unknown',
      };
    });

    return validateClipsForJoin(
      clipFrameInfos,
      contextFrameCount,
      gapFrameCount,
      replaceMode
    );
  }, [clips, contextFrameCount, gapFrameCount, replaceMode, useInputVideoFps]);

  // Build clip pairs for visualization
  const clipPairs = useMemo((): ClipPairInfo[] => {
    const validClips = clips.filter(c => c.url);
    if (validClips.length < 2) return [];

    const pairs: ClipPairInfo[] = [];
    for (let i = 0; i < validClips.length - 1; i++) {
      const clipA = validClips[i];
      const clipB = validClips[i + 1];

      const clipAFrameCount = clipA.durationSeconds
        ? calculateEffectiveFrameCount(clipA.durationSeconds, useInputVideoFps)
        : 0;
      const clipBFrameCount = clipB.durationSeconds
        ? calculateEffectiveFrameCount(clipB.durationSeconds, useInputVideoFps)
        : 0;

      pairs.push({
        pairIndex: i,
        clipA: {
          name: `Clip ${i + 1}`,
          frameCount: clipAFrameCount,
          finalFrameUrl: clipA.finalFrameUrl,
        },
        clipB: {
          name: `Clip ${i + 2}`,
          frameCount: clipBFrameCount,
          posterUrl: clipB.posterUrl,
        },
      });
    }
    return pairs;
  }, [clips, useInputVideoFps]);

  // Generate hook
  const {
    generateJoinClipsMutation,
    handleGenerate,
    showSuccessState,
    generateButtonText,
    isGenerateDisabled,
    handleRestoreDefaults,
  } = useJoinClipsGenerate({
    selectedProjectId,
    clips,
    transitionPrompts,
    joinSettings,
    loraManager,
    projectAspectRatio,
    validationResult,
  });

  // Fetch all videos - only parent generations created from Join Clips page
  const generationsQuery = useProjectGenerations(
    selectedProjectId,
    1,
    100,
    !!selectedProjectId,
    {
      toolType: 'join-clips',
      mediaType: 'video',
    },
    {
      disablePolling: true
    }
  );

  const videosData = generationsQuery.data as GenerationsPaginatedResponse | undefined;
  const videosLoading = generationsQuery.isLoading;
  const videosFetching = generationsQuery.isFetching;

  // Delete mutation for gallery items
  const deleteGenerationMutation = useDeleteGeneration();
  const handleDeleteGeneration = useCallback((id: string) => {
    deleteGenerationMutation.mutate(id);
  }, [deleteGenerationMutation]);

  // Refresh gallery when returning to the page
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-light tracking-tight text-foreground">Join Clips</h1>
        </div>

        {/* Clips Grid */}
        {(joinSettings.status === 'loading' || isLoadingPersistedMedia || (settingsLoaded && joinSettings.settings?.clips?.length > 0 && clips.length === 0)) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: Math.max(2, cachedClipsCount) + 1 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="relative border rounded-lg p-3 space-y-3 bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-16" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="aspect-video bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center">
                      <div className="text-center space-y-2">
                        <Skeleton className="h-8 w-8 rounded-full mx-auto" />
                        <Skeleton className="h-4 w-32 mx-auto" />
                        <Skeleton className="h-3 w-24 mx-auto" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={clips.map(c => c.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {clips.map((clip, index) => (
                  <SortableClip
                    key={clip.id}
                    clip={clip}
                    index={index}
                    clips={clips}
                    uploadingClipId={uploadingClipId}
                    draggingOverClipId={draggingOverClipId}
                    isScrolling={isScrolling}
                    settingsLoaded={settingsLoaded}
                    videoRefs={videoRefs}
                    fileInputRefs={fileInputRefs}
                    transitionPrompts={transitionPrompts}
                    useIndividualPrompts={useIndividualPrompts}
                    loopFirstClip={loopFirstClip}
                    firstClipFinalFrameUrl={clips[0]?.finalFrameUrl}
                    onLoopFirstClipChange={(checked) => joinSettings.updateField('loopFirstClip', checked)}
                    onRemoveClip={handleRemoveClip}
                    onClearVideo={handleClearVideo}
                    onVideoUpload={handleVideoUpload}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onPromptChange={handlePromptChange}
                    setClips={setClips}
                    onOpenInLightbox={setLightboxClip}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Global Settings using JoinClipsSettingsForm */}
        <Card className="p-6 sm:p-8 shadow-sm border">
                          <JoinClipsSettingsForm
                            gapFrames={gapFrameCount}
                            setGapFrames={(val) => joinSettings.updateField('gapFrameCount', val)}
                            contextFrames={contextFrameCount}
                            setContextFrames={(val) => joinSettings.updateField('contextFrameCount', val)}
                            replaceMode={replaceMode}
                            setReplaceMode={(val) => joinSettings.updateField('replaceMode', val)}
                            keepBridgingImages={keepBridgingImages}
                            setKeepBridgingImages={(val) => joinSettings.updateField('keepBridgingImages', val)}
                            prompt={globalPrompt}
                            setPrompt={(val) => joinSettings.updateField('prompt', val)}
                            negativePrompt={negativePrompt}
                            setNegativePrompt={(val) => joinSettings.updateField('negativePrompt', val)}
                            useIndividualPrompts={useIndividualPrompts}
                            setUseIndividualPrompts={(val) => joinSettings.updateField('useIndividualPrompts', val)}
                            clipCount={clips.filter(c => c.url).length}
                            enhancePrompt={enhancePrompt}
                            setEnhancePrompt={(val) => joinSettings.updateField('enhancePrompt', val)}
                            useInputVideoResolution={useInputVideoResolution}
                            setUseInputVideoResolution={(val) => joinSettings.updateField('useInputVideoResolution', val)}
                            showResolutionToggle={true}
                            useInputVideoFps={useInputVideoFps}
                            setUseInputVideoFps={(val) => joinSettings.updateField('useInputVideoFps', val)}
                            showFpsToggle={true}
                            noisedInputVideo={noisedInputVideo}
                            setNoisedInputVideo={(val) => joinSettings.updateField('noisedInputVideo', val)}
                            availableLoras={availableLoras}
                            projectId={selectedProjectId}
                            loraPersistenceKey="join-clips"
                            loraManager={loraManager}
                            onGenerate={handleGenerate}
                            isGenerating={generateJoinClipsMutation.isPending}
                            generateSuccess={showSuccessState}
                            generateButtonText={generateButtonText}
                            isGenerateDisabled={isGenerateDisabled}
                            onRestoreDefaults={handleRestoreDefaults}
                            shortestClipFrames={validationResult?.shortestClipFrames}
                            clipPairs={clipPairs}
                            motionMode={motionMode as 'basic' | 'advanced'}
                            onMotionModeChange={(mode) => joinSettings.updateField('motionMode', mode)}
                            phaseConfig={phaseConfig ?? DEFAULT_JOIN_CLIPS_PHASE_CONFIG}
                            onPhaseConfigChange={(config) => joinSettings.updateField('phaseConfig', config)}
                            randomSeed={randomSeed}
                            onRandomSeedChange={(val) => joinSettings.updateField('randomSeed', val)}
                            selectedPhasePresetId={selectedPhasePresetId}
                            onPhasePresetSelect={(presetId, config, _metadata) => {
                              joinSettings.updateFields({
                                selectedPhasePresetId: presetId,
                                phaseConfig: config,
                              });
                            }}
                            onPhasePresetRemove={() => {
                              joinSettings.updateField('selectedPhasePresetId', null);
                            }}
                          />
        </Card>

        {/* Results Gallery */}
        {(() => {
          const hasValidData = videosData?.items && videosData.items.length > 0;
          const isLoadingOrFetching = videosLoading || videosFetching;
          const shouldShowSkeleton = isLoadingOrFetching && !hasValidData;

          if (shouldShowSkeleton) {
            const skeletonCount = videosData?.items?.length || 6;
            return (
              <div className="space-y-4 pt-4 border-t">
                <h2 className="text-xl font-medium">
                  {hasValidData ? `Previous Results (${videosData.items.length})` : 'Loading Results...'}
                </h2>
                <SkeletonGallery
                  count={skeletonCount}
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
                  onAddToLastShot={async () => false}
                  onAddToLastShotWithoutPosition={async () => false}
                  onDelete={handleDeleteGeneration}
                  isDeleting={deleteGenerationMutation.isPending ? deleteGenerationMutation.variables as string : null}
                  currentToolType="join-clips"
                  initialMediaTypeFilter="video"
                  initialToolTypeFilter={true}
                  showShotFilter={false}
                  initialShotFilter="all"
                  columnsPerRow={3}
                  itemsPerPage={isMobile ? 20 : 12}
                  reducedSpacing={true}
                  hidePagination={videosData.items.length <= (isMobile ? 20 : 12)}
                  hideBottomPagination={true}
                  hideMediaTypeFilter={true}
                  showShare={false}
                />
              </div>
            );
          }

          if (!isLoadingOrFetching) {
            return (
              <div className="text-sm text-muted-foreground text-center pt-4 border-t">
                No joined clips yet. Create your first one above!
              </div>
            );
          }

          return null;
        })()}
      </div>

      {/* Lightbox for viewing clips */}
      {lightboxClip && (
        <MediaLightbox
          media={{
            id: lightboxClip.id,
            imageUrl: lightboxClip.url,
            location: lightboxClip.url,
            thumbUrl: lightboxClip.posterUrl,
            type: 'video',
          }}
          onClose={() => setLightboxClip(null)}
          showNavigation={false}
          showDownload
        />
      )}
    </PageFadeIn>
  );
};

export default JoinClipsPage;
