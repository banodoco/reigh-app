import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Film, GripVertical, Trash2 } from 'lucide-react';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import { cn } from '@/shared/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { VideoClip, TransitionPrompt } from '../types';

// Video container skeleton loader
const VideoContainerSkeleton: React.FC = () => (
  <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-muted animate-pulse">
    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-400"></div>
  </div>
);

// Upload loading state
const UploadingVideoState: React.FC = () => (
  <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-muted/50 backdrop-blur-sm">
    <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mb-3"></div>
    <p className="text-sm font-medium text-foreground">Uploading video...</p>
  </div>
);

interface SortableClipProps {
  clip: VideoClip;
  index: number;
  clips: VideoClip[];
  uploadingClipId: string | null;
  draggingOverClipId: string | null;
  isScrolling: boolean;
  settingsLoaded: boolean;
  videoRefs: React.MutableRefObject<{ [clipId: string]: HTMLVideoElement | null }>;
  fileInputRefs: React.MutableRefObject<{ [clipId: string]: HTMLInputElement | null }>;
  transitionPrompts: TransitionPrompt[];
  useIndividualPrompts: boolean;
  loopFirstClip: boolean;
  firstClipFinalFrameUrl?: string;
  onLoopFirstClipChange: (checked: boolean) => void;
  onRemoveClip: (clipId: string) => void;
  onClearVideo: (clipId: string) => void;
  onVideoUpload: (e: React.ChangeEvent<HTMLInputElement>, clipId: string) => void;
  onDragOver: (e: React.DragEvent, clipId: string) => void;
  onDragEnter: (e: React.DragEvent, clipId: string) => void;
  onDragLeave: (e: React.DragEvent, clipId: string) => void;
  onDrop: (e: React.DragEvent, clipId: string) => void;
  onPromptChange: (clipId: string, prompt: string) => void;
  setClips: React.Dispatch<React.SetStateAction<VideoClip[]>>;
  onOpenInLightbox: (clip: VideoClip) => void;
}

export const SortableClip: React.FC<SortableClipProps> = ({
  clip,
  index,
  clips,
  uploadingClipId,
  draggingOverClipId,
  isScrolling,
  settingsLoaded,
  fileInputRefs,
  transitionPrompts,
  useIndividualPrompts,
  loopFirstClip,
  firstClipFinalFrameUrl,
  onLoopFirstClipChange,
  onRemoveClip,
  onClearVideo,
  onVideoUpload,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onPromptChange,
  setClips,
  onOpenInLightbox,
}) => {
  // Check if this is the last clip and it's empty
  const isLastClip = index === clips.length - 1;
  const isEmptyClip = !clip.url;
  const isLoopedSecondClip = loopFirstClip && index === 1 && isEmptyClip;
  const isAddAnotherClip = isLastClip && isEmptyClip && !isLoopedSecondClip;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: clip.id,
    disabled: isAddAnotherClip, // Disable dragging for the "Add another clip" slot
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="space-y-3">
      {/* Clip Card */}
      <div className="relative border rounded-lg p-3 space-y-3 bg-card">
        {/* Header with number/title, drag handle, and remove button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!isAddAnotherClip && (
              <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing touch-none p-1 hover:bg-muted rounded transition-colors"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div className="text-sm font-medium text-muted-foreground">
              {isAddAnotherClip ? 'Add clip' : isLoopedSecondClip ? 'Clip #2 (Looped)' : `Clip #${index + 1}`}
            </div>
          </div>
          {clip.url && !isAddAnotherClip && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (clips.length > 2) {
                  onRemoveClip(clip.id);
                } else {
                  onClearVideo(clip.id);
                }
              }}
              className="h-6 w-6 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          {/* Loop First Clip Checkbox - show on second slot when first clip has video */}
          {index === 1 && clips[0]?.url && !clip.url && (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`loop-first-clip-${clip.id}`}
                checked={loopFirstClip}
                onCheckedChange={(checked) => onLoopFirstClipChange(checked === true)}
              />
              <label
                htmlFor={`loop-first-clip-${clip.id}`}
                className="text-xs text-muted-foreground cursor-pointer select-none"
              >
                Loop first clip
              </label>
            </div>
          )}
        </div>

        {/* Video Container */}
        <div className="space-y-2">
          <div
            className={cn(
              "aspect-video bg-muted rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors relative",
              draggingOverClipId === clip.id
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50',
              !clip.url && uploadingClipId !== clip.id && !(loopFirstClip && index === 1) ? 'cursor-pointer' : ''
            )}
            onDragOver={(e) => !(loopFirstClip && index === 1) && onDragOver(e, clip.id)}
            onDragEnter={(e) => !(loopFirstClip && index === 1) && onDragEnter(e, clip.id)}
            onDragLeave={(e) => !(loopFirstClip && index === 1) && onDragLeave(e, clip.id)}
            onDrop={(e) => {
              if (loopFirstClip && index === 1) {
                e.preventDefault();
                return;
              }
              onDrop(e, clip.id);
            }}
            onClick={() => {
              // Don't allow upload on second clip when loop mode is enabled
              const isLoopingSecondSlot = loopFirstClip && index === 1;
              if (!clip.url && uploadingClipId !== clip.id && !isLoopingSecondSlot) {
                fileInputRefs.current[clip.id]?.click();
              }
            }}
            onDoubleClick={() => {
              // Open in lightbox on double-click if clip has video
              if (clip.url) {
                onOpenInLightbox(clip);
              }
            }}
          >
            {uploadingClipId === clip.id ? (
              <UploadingVideoState />
            ) : clip.url ? (
              <>
                <HoverScrubVideo
                  src={clip.url}
                  poster={clip.posterUrl}
                  className="absolute inset-0 w-full h-full"
                  videoClassName="object-contain"
                  onDoubleClick={() => onOpenInLightbox(clip)}
                  preload="metadata"
                  onLoadedData={() => {
                    setClips(prev => prev.map(c =>
                      c.id === clip.id ? { ...c, loaded: true } : c
                    ));
                  }}
                />
                {/* Final frame thumbnail in bottom right corner */}
                {clip.finalFrameUrl && (
                  <div className="absolute bottom-2 right-2 w-16 h-10 rounded border-2 border-white shadow-lg overflow-hidden z-10 pointer-events-none">
                    <img
                      src={clip.finalFrameUrl}
                      alt="Final frame"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                {draggingOverClipId === clip.id && !isScrolling && (
                  <div className="absolute inset-0 bg-primary/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                    <p className="text-sm font-medium text-foreground">Drop to replace</p>
                  </div>
                )}
              </>
            ) : !settingsLoaded ? (
              <VideoContainerSkeleton />
            ) : loopFirstClip && index === 1 && firstClipFinalFrameUrl ? (
              // Show first clip's final frame when looping
              <img
                src={firstClipFinalFrameUrl}
                alt="First clip final frame (looping)"
                className="absolute inset-0 w-full h-full object-contain"
              />
            ) : (
              <div className="text-center p-4 pointer-events-none">
                <Film className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground mb-1">
                  {draggingOverClipId === clip.id ? 'Drop video here' : 'Click or drop to upload'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {draggingOverClipId === clip.id ? '' : 'MP4, WebM, MOV'}
                </p>
              </div>
            )}
          </div>
          <input
            ref={el => { fileInputRefs.current[clip.id] = el; }}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => onVideoUpload(e, clip.id)}
          />
        </div>

        {/* Transition Prompt (if not last clip and individual prompts enabled) */}
        {index < clips.length - 1 && useIndividualPrompts && (
          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor={`prompt-${clips[index + 1].id}`} className="text-xs text-muted-foreground">
              Transition to Clip #{index + 2}
            </Label>
            <Textarea
              id={`prompt-${clips[index + 1].id}`}
              value={transitionPrompts.find(p => p.id === clips[index + 1].id)?.prompt || ''}
              onChange={(e) => onPromptChange(clips[index + 1].id, e.target.value)}
              placeholder="Additional details for this transition (optional)"
              rows={2}
              className="resize-none text-sm"
              clearable
              onClear={() => onPromptChange(clips[index + 1].id, '')}
              voiceInput
              voiceContext={`This is a prompt for the transition between Clip #${index + 1} and Clip #${index + 2}. Describe the specific motion or visual transformation you want for this particular transition between clips.`}
              onVoiceResult={(result) => {
                onPromptChange(clips[index + 1].id, result.prompt || result.transcription);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
