import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { SortableClip } from '@/tools/join-clips/components/SortableClip';
import type {
  ClipManagerState,
  JoinSettingsState,
} from '@/tools/join-clips/pages/hooks/useJoinClipsPageHelpers';

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

export function JoinClipsGrid({ joinSettings, clipManager, settingsLoaded }: JoinClipsGridProps) {
  const showSkeleton =
    joinSettings.status === 'loading' ||
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
      <SortableContext items={clipManager.clips.map((clip) => clip.id)} strategy={rectSortingStrategy}>
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
