import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { useProjectGenerations, type GenerationsPaginatedResponse } from '@/shared/hooks/projects/useProjectGenerations';
import { useCreateGeneration, useToggleGenerationStar } from '@/domains/generation/hooks/useGenerationMutations';
import { useDeleteGenerationWithConfirm } from '@/domains/generation/hooks/useDeleteGenerationWithConfirm';
import { DeleteGenerationConfirmDialog } from '@/shared/components/dialogs/DeleteGenerationConfirmDialog';
import { MediaGallery } from '@/shared/components/MediaGallery';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { SKELETON_COLUMNS } from '@/shared/components/MediaGallery/utils';
import { useIsMobile } from '@/shared/hooks/mobile';
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
import { JoinClipsSettingsForm, type ClipPairInfo, DEFAULT_JOIN_CLIPS_PHASE_CONFIG } from '@/shared/components/JoinClipsSettingsForm';
import { SortableClip } from '../components/SortableClip';

type JoinSettingsState = ReturnType<typeof useJoinClipsSettings>;
type ClipManagerState = ReturnType<typeof useClipManager>;
type JoinGenerateState = ReturnType<typeof useJoinClipsGenerate>;
type LoraManagerState = ReturnType<typeof useLoraManager>;

function useSyncJoinClipsLoras(
  settingsLoaded: boolean,
  selectedLoras: LoraManagerState['selectedLoras'],
  joinSettings: JoinSettingsState,
) {
  const lorasSyncStateRef = useRef<{ lastSyncedKey: string }>({ lastSyncedKey: '' });

  useEffect(() => {
    if (!settingsLoaded) return;

    const lorasKey = selectedLoras
      .map(lora => `${lora.id}:${lora.strength}`)
      .sort((a, b) => a.localeCompare(b))
      .join(',');

    if (lorasKey === lorasSyncStateRef.current.lastSyncedKey) return;

    lorasSyncStateRef.current.lastSyncedKey = lorasKey;
    joinSettings.updateField('loras', selectedLoras.map(lora => ({
      id: lora.id,
      strength: lora.strength,
    })));
  }, [settingsLoaded, selectedLoras, joinSettings]);
}

function useEnsureKeepBridgingImages(
  keepBridgingImages: boolean | undefined,
  settingsLoaded: boolean,
  joinSettings: JoinSettingsState,
) {
  useEffect(() => {
    if (keepBridgingImages === undefined && settingsLoaded) {
      joinSettings.updateField('keepBridgingImages', false);
    }
  }, [keepBridgingImages, settingsLoaded, joinSettings]);
}

function useJoinValidationResult(
  clips: ClipManagerState['clips'],
  contextFrameCount: number,
  gapFrameCount: number,
  replaceMode: boolean,
  useInputVideoFps: boolean,
): ValidationResult | null {
  return useMemo(() => {
    const validClips = clips.filter(clip => clip.url);
    if (validClips.length < 2) return null;

    const stillLoading = validClips.some(clip => clip.metadataLoading || clip.durationSeconds === undefined);
    if (stillLoading) return null;

    const clipFrameInfos: ClipFrameInfo[] = validClips.map((clip, index) => ({
      index,
      name: `Clip #${index + 1}`,
      frameCount: clip.durationSeconds
        ? calculateEffectiveFrameCount(clip.durationSeconds, useInputVideoFps)
        : 0,
      durationSeconds: clip.durationSeconds,
      source: clip.durationSeconds ? 'estimated' : 'unknown',
    }));

    return validateClipsForJoin(
      clipFrameInfos,
      contextFrameCount,
      gapFrameCount,
      replaceMode,
    );
  }, [clips, contextFrameCount, gapFrameCount, replaceMode, useInputVideoFps]);
}

function useJoinClipPairs(
  clips: ClipManagerState['clips'],
  useInputVideoFps: boolean,
): ClipPairInfo[] {
  return useMemo(() => {
    const validClips = clips.filter(clip => clip.url);
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
}

function useRefreshOnVisibility(
  selectedProjectId: string | null,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && selectedProjectId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.unified.projectPrefix(selectedProjectId),
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [selectedProjectId, queryClient]);
}

function JoinClipsSkeletonGrid({ cachedClipsCount }: { cachedClipsCount: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: cachedClipsCount >= 2 ? cachedClipsCount + 1 : 2 }).map((_, index) => (
        <div key={index} className="space-y-3">
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
  );
}

interface JoinClipsGridProps {
  joinSettings: JoinSettingsState;
  clipManager: ClipManagerState;
  settingsLoaded: boolean;
}

function JoinClipsGrid({ joinSettings, clipManager, settingsLoaded }: JoinClipsGridProps) {
  const showSkeleton = joinSettings.status === 'loading' ||
    clipManager.isLoadingPersistedMedia ||
    (settingsLoaded && joinSettings.settings?.clips?.length > 0 && clipManager.clips.length === 0);

  if (showSkeleton) {
    return <JoinClipsSkeletonGrid cachedClipsCount={clipManager.cachedClipsCount} />;
  }

  return (
    <DndContext
      sensors={clipManager.sensors}
      collisionDetection={closestCenter}
      onDragEnd={clipManager.handleDragEnd}
    >
      <SortableContext
        items={clipManager.clips.map(clip => clip.id)}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clipManager.clips.map((clip, index) => (
            <SortableClip
              key={clip.id}
              clip={clip}
              index={index}
              clips={clipManager.clips}
              uploadingClipId={clipManager.uploadingClipId}
              draggingOverClipId={clipManager.draggingOverClipId}
              isScrolling={clipManager.isScrolling}
              settingsLoaded={settingsLoaded}
              videoRefs={clipManager.videoRefs}
              fileInputRefs={clipManager.fileInputRefs}
              transitionPrompts={clipManager.transitionPrompts}
              useIndividualPrompts={joinSettings.settings.useIndividualPrompts}
              loopFirstClip={joinSettings.settings.loopFirstClip}
              firstClipFinalFrameUrl={clipManager.clips[0]?.finalFrameUrl}
              onLoopFirstClipChange={(checked) => joinSettings.updateField('loopFirstClip', checked)}
              onRemoveClip={clipManager.handleRemoveClip}
              onClearVideo={clipManager.handleClearVideo}
              onVideoUpload={clipManager.handleVideoUpload}
              onDragOver={clipManager.handleDragOver}
              onDragEnter={clipManager.handleDragEnter}
              onDragLeave={clipManager.handleDragLeave}
              onDrop={clipManager.handleDrop}
              onPromptChange={clipManager.handlePromptChange}
              setClips={clipManager.setClips}
              onOpenInLightbox={clipManager.setLightboxClip}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface JoinClipsResultsProps {
  videosData: GenerationsPaginatedResponse | undefined;
  videosLoading: boolean;
  videosFetching: boolean;
  projectAspectRatio: string | undefined;
  isMobile: boolean;
  deletingId: string | null;
  handleDeleteGeneration: (id: string) => void;
  onToggleStar: (id: string, starred: boolean) => void;
}

function JoinClipsResults({
  videosData,
  videosLoading,
  videosFetching,
  projectAspectRatio,
  isMobile,
  deletingId,
  handleDeleteGeneration,
  onToggleStar,
}: JoinClipsResultsProps) {
  const hasValidData = videosData?.items && videosData.items.length > 0;
  const isLoadingOrFetching = videosLoading || videosFetching;
  const shouldShowSkeleton = isLoadingOrFetching && !hasValidData;

  if (shouldShowSkeleton) {
    const skeletonCount = videosData?.items?.length || 6;
    return (
      <div className="space-y-4 pt-4 border-t">
        <h2 className="text-xl font-medium">
          Loading Results...
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
        <h2 className="text-xl font-medium">Previous Results ({videosData.items.length})</h2>
        <MediaGallery
          images={videosData.items || []}
          allShots={[]}
          onAddToLastShot={async () => false}
          onAddToLastShotWithoutPosition={async () => false}
          onDelete={handleDeleteGeneration}
          onToggleStar={onToggleStar}
          isDeleting={deletingId}
          currentToolType={TOOL_IDS.JOIN_CLIPS}
          defaultFilters={{ mediaType: 'video', toolTypeFilter: true, shotFilter: 'all' }}
          columnsPerRow={3}
          itemsPerPage={isMobile ? 20 : 12}
          config={{
            reducedSpacing: true,
            hidePagination: videosData.items.length <= (isMobile ? 20 : 12),
            hideBottomPagination: true,
            hideMediaTypeFilter: true,
            showShare: false,
          }}
        />
      </div>
    );
  }

  return null;
}

interface JoinClipsPageLayoutProps {
  selectedProjectId: string;
  projectAspectRatio: string | undefined;
  isMobile: boolean;
  joinSettings: JoinSettingsState;
  settingsLoaded: boolean;
  availableLoras: ReturnType<typeof usePublicLoras>['data'];
  loraManager: LoraManagerState;
  clipManager: ClipManagerState;
  validationResult: ValidationResult | null;
  clipPairs: ClipPairInfo[];
  generateState: JoinGenerateState;
  videosData: GenerationsPaginatedResponse | undefined;
  videosLoading: boolean;
  videosFetching: boolean;
  deletingId: string | null;
  handleDeleteGeneration: (id: string) => void;
  onToggleStar: (id: string, starred: boolean) => void;
  confirmDialogProps: ReturnType<typeof useDeleteGenerationWithConfirm>['confirmDialogProps'];
}

interface JoinClipsSettingsFormAdapterInput {
  settings: JoinSettingsState['settings'];
  joinSettings: JoinSettingsState;
  clipManager: ClipManagerState;
  validationResult: ValidationResult | null;
  clipPairs: ClipPairInfo[];
  availableLoras: ReturnType<typeof usePublicLoras>['data'];
  selectedProjectId: string;
  loraManager: LoraManagerState;
  generateState: JoinGenerateState;
}

function buildJoinClipsSettingsFormProps({
  settings,
  joinSettings,
  clipManager,
  validationResult,
  clipPairs,
  availableLoras,
  selectedProjectId,
  loraManager,
  generateState,
}: JoinClipsSettingsFormAdapterInput): React.ComponentProps<typeof JoinClipsSettingsForm> {
  return {
    clipSettings: {
      gapFrames: settings.gapFrameCount,
      setGapFrames: (value) => joinSettings.updateField('gapFrameCount', value),
      contextFrames: settings.contextFrameCount,
      setContextFrames: (value) => joinSettings.updateField('contextFrameCount', value),
      replaceMode: settings.replaceMode,
      setReplaceMode: (value) => joinSettings.updateField('replaceMode', value),
      keepBridgingImages: settings.keepBridgingImages,
      setKeepBridgingImages: (value) => joinSettings.updateField('keepBridgingImages', value),
      prompt: settings.prompt,
      setPrompt: (value) => joinSettings.updateField('prompt', value),
      negativePrompt: settings.negativePrompt,
      setNegativePrompt: (value) => joinSettings.updateField('negativePrompt', value),
      useIndividualPrompts: settings.useIndividualPrompts,
      setUseIndividualPrompts: (value) => joinSettings.updateField('useIndividualPrompts', value),
      clipCount: clipManager.clips.filter(clip => clip.url).length,
      enhancePrompt: settings.enhancePrompt,
      setEnhancePrompt: (value) => joinSettings.updateField('enhancePrompt', value),
      useInputVideoResolution: settings.useInputVideoResolution,
      setUseInputVideoResolution: (value) => joinSettings.updateField('useInputVideoResolution', value),
      showResolutionToggle: true,
      useInputVideoFps: settings.useInputVideoFps,
      setUseInputVideoFps: (value) => joinSettings.updateField('useInputVideoFps', value),
      showFpsToggle: true,
      noisedInputVideo: settings.noisedInputVideo,
      setNoisedInputVideo: (value) => joinSettings.updateField('noisedInputVideo', value),
      shortestClipFrames: validationResult?.shortestClipFrames,
      clipPairs,
    },
    motionConfig: {
      availableLoras,
      projectId: selectedProjectId,
      loraPersistenceKey: TOOL_IDS.JOIN_CLIPS,
      loraManager,
      motionMode: settings.motionMode as 'basic' | 'advanced',
      onMotionModeChange: (mode) => joinSettings.updateField('motionMode', mode),
      phaseConfig: settings.phaseConfig ?? DEFAULT_JOIN_CLIPS_PHASE_CONFIG,
      onPhaseConfigChange: (config) => joinSettings.updateField('phaseConfig', config),
      randomSeed: settings.randomSeed,
      onRandomSeedChange: (value) => joinSettings.updateField('randomSeed', value),
      selectedPhasePresetId: settings.selectedPhasePresetId,
      onPhasePresetSelect: (presetId, config) => {
        joinSettings.updateFields({
          selectedPhasePresetId: presetId,
          phaseConfig: config,
        });
      },
      onPhasePresetRemove: () => {
        joinSettings.updateField('selectedPhasePresetId', null);
      },
    },
    uiState: {
      onGenerate: generateState.handleGenerate,
      isGenerating: generateState.isGenerating,
      generateSuccess: generateState.showSuccessState,
      generateButtonText: generateState.generateButtonText,
      isGenerateDisabled: generateState.isGenerateDisabled,
      onRestoreDefaults: generateState.handleRestoreDefaults,
    },
  };
}

function JoinClipsPageLayout({
  selectedProjectId,
  projectAspectRatio,
  isMobile,
  joinSettings,
  settingsLoaded,
  availableLoras,
  loraManager,
  clipManager,
  validationResult,
  clipPairs,
  generateState,
  videosData,
  videosLoading,
  videosFetching,
  deletingId,
  handleDeleteGeneration,
  onToggleStar,
  confirmDialogProps,
}: JoinClipsPageLayoutProps) {
  const settings = joinSettings.settings;
  const settingsFormProps = useMemo(() => buildJoinClipsSettingsFormProps({
    settings,
    joinSettings,
    clipManager,
    validationResult,
    clipPairs,
    availableLoras,
    selectedProjectId,
    loraManager,
    generateState,
  }), [
    settings,
    joinSettings,
    clipManager,
    validationResult,
    clipPairs,
    availableLoras,
    selectedProjectId,
    loraManager,
    generateState,
  ]);

  return (
    <PageFadeIn>
      <div className="flex flex-col gap-y-6 pb-6 px-4 max-w-7xl mx-auto pt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-light tracking-tight text-foreground">Join Clips</h1>
        </div>

        <JoinClipsGrid
          joinSettings={joinSettings}
          clipManager={clipManager}
          settingsLoaded={settingsLoaded}
        />

        <Card className="p-6 sm:p-8 shadow-sm border">
          <JoinClipsSettingsForm {...settingsFormProps} />
        </Card>

        <JoinClipsResults
          videosData={videosData}
          videosLoading={videosLoading}
          videosFetching={videosFetching}
          projectAspectRatio={projectAspectRatio}
          isMobile={isMobile}
          deletingId={deletingId}
          handleDeleteGeneration={handleDeleteGeneration}
          onToggleStar={onToggleStar}
        />
      </div>

      {clipManager.lightboxClip && (
        <MediaLightbox
          media={{
            id: clipManager.lightboxClip.id,
            imageUrl: clipManager.lightboxClip.url,
            location: clipManager.lightboxClip.url,
            thumbUrl: clipManager.lightboxClip.posterUrl,
            type: 'video',
          }}
          onClose={() => clipManager.setLightboxClip(null)}
          showNavigation={false}
          showDownload
        />
      )}

      <DeleteGenerationConfirmDialog {...confirmDialogProps} />
    </PageFadeIn>
  );
}

const JoinClipsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { selectedProjectId, projects } = useProject();
  const isMobile = useIsMobile();

  const currentProject = projects.find(project => project.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;

  const joinSettings = useJoinClipsSettings(selectedProjectId);
  const settings = joinSettings.settings;
  const settingsLoaded = joinSettings.status !== 'idle' && joinSettings.status !== 'loading';

  const { data: availableLoras } = usePublicLoras();
  const loraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId || undefined,
    persistenceScope: 'project',
    enableProjectPersistence: true,
    persistenceKey: TOOL_IDS.JOIN_CLIPS,
  });

  useSyncJoinClipsLoras(settingsLoaded, loraManager.selectedLoras, joinSettings);
  useEnsureKeepBridgingImages(settings.keepBridgingImages, settingsLoaded, joinSettings);

  const createGenerationMutation = useCreateGeneration();
  const clipManager = useClipManager({
    selectedProjectId,
    joinSettings,
    settingsLoaded,
    loopFirstClip: settings.loopFirstClip,
    createGenerationMutation,
  });

  const validationResult = useJoinValidationResult(
    clipManager.clips,
    settings.contextFrameCount,
    settings.gapFrameCount,
    settings.replaceMode,
    settings.useInputVideoFps,
  );

  const clipPairs = useJoinClipPairs(clipManager.clips, settings.useInputVideoFps);

  const generateState = useJoinClipsGenerate({
    selectedProjectId,
    clips: clipManager.clips,
    transitionPrompts: clipManager.transitionPrompts,
    joinSettings,
    loraManager,
    projectAspectRatio,
    validationResult,
  });

  const generationsQuery = useProjectGenerations(
    selectedProjectId,
    1,
    100,
    !!selectedProjectId,
    {
      toolType: TOOL_IDS.JOIN_CLIPS,
      mediaType: 'video',
    },
    {
      disablePolling: true,
    }
  );

  const videosData = generationsQuery.data as GenerationsPaginatedResponse | undefined;
  const videosLoading = generationsQuery.isLoading;
  const videosFetching = generationsQuery.isFetching;

  const { requestDelete: requestDeleteGeneration, confirmDialogProps, deletingId } = useDeleteGenerationWithConfirm({ projectId: selectedProjectId });
  const toggleStarMutation = useToggleGenerationStar();
  const handleDeleteGeneration = useCallback((id: string) => {
    requestDeleteGeneration(id);
  }, [requestDeleteGeneration]);
  const handleToggleStar = useCallback((id: string, starred: boolean) => {
    if (!selectedProjectId) {
      return;
    }
    toggleStarMutation.mutate({ id, starred, projectId: selectedProjectId });
  }, [selectedProjectId, toggleStarMutation]);

  useEffect(() => {
    if (generateState.videosViewJustEnabled && videosData?.items) {
      generateState.setVideosViewJustEnabled(false);
    }
  }, [generateState, videosData?.items]);

  useRefreshOnVisibility(selectedProjectId, queryClient);

  if (!selectedProjectId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select a project first.</p>
      </div>
    );
  }

  return (
    <JoinClipsPageLayout
      selectedProjectId={selectedProjectId}
      projectAspectRatio={projectAspectRatio}
      isMobile={isMobile}
      joinSettings={joinSettings}
      settingsLoaded={settingsLoaded}
      availableLoras={availableLoras}
      loraManager={loraManager}
      clipManager={clipManager}
      validationResult={validationResult}
      clipPairs={clipPairs}
      generateState={generateState}
      videosData={videosData}
      videosLoading={videosLoading}
      videosFetching={videosFetching}
      deletingId={deletingId}
      handleDeleteGeneration={handleDeleteGeneration}
      onToggleStar={handleToggleStar}
      confirmDialogProps={confirmDialogProps}
    />
  );
};

export default JoinClipsPage;
