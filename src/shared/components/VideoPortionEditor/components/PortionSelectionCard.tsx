import { Trash2 } from 'lucide-react';
import { Input } from '@/shared/components/ui/input';
import { Slider } from '@/shared/components/ui/slider';
import { Textarea } from '@/shared/components/ui/textarea';
import { cn } from '@/shared/components/ui/contracts/cn';
import { SegmentThumbnail } from '@/shared/components/VideoPortionEditor/components/SegmentThumbnail';
import {
  formatDuration,
  getMaxGapFrames,
} from '@/shared/components/VideoPortionEditor/lib/videoPortionEditorUtils';
import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';
import type { UpdatePortionSelectionSettings } from '@/shared/components/VideoPortionEditor/types';
import { formatTime } from '@/shared/lib/timeFormatting';
import { getQuantizedGap } from '@/shared/components/JoinClipsSettingsForm/utils';
import { getSegmentFormColor } from '@/shared/lib/segmentColors';

interface PortionSelectionCardProps {
  selection: PortionSelection;
  index: number;
  totalSelections: number;
  gapFrames: number;
  contextFrames: number;
  videoUrl?: string;
  fps?: number | null;
  onUpdateSelectionSettings: UpdatePortionSelectionSettings;
  onRemoveSelection?: (id: string) => void;
}

export function PortionSelectionCard({
  selection,
  index,
  totalSelections,
  gapFrames,
  contextFrames,
  videoUrl,
  fps,
  onUpdateSelectionSettings,
  onRemoveSelection,
}: PortionSelectionCardProps) {
  const segmentColor = getSegmentFormColor(index);
  const segmentFrameCount = selection.gapFrameCount ?? gapFrames;
  const segmentDuration = formatDuration(segmentFrameCount, fps);

  return (
    <div className={cn('border rounded-lg p-3 bg-muted/20 space-y-3', segmentColor.border)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0',
              segmentColor.bgMuted,
              segmentColor.text
            )}
          >
            {index + 1}
          </div>
          <Input
            value={selection.name || ''}
            onChange={(event) =>
              onUpdateSelectionSettings(selection.id, { name: event.target.value })
            }
            placeholder={`Segment ${index + 1}`}
            className="h-6 text-xs font-medium border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-foreground"
          />
        </div>

        <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap flex-shrink-0">
          {formatTime(selection.start)} → {formatTime(selection.end)}
        </span>

        {totalSelections > 1 && onRemoveSelection && (
          <button
            onClick={() => onRemoveSelection(selection.id)}
            className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-stretch gap-3">
        {videoUrl && (
          <div className="w-[30%] flex-shrink-0">
            <SegmentThumbnail videoUrl={videoUrl} time={selection.start} size="large" />
          </div>
        )}

        <div className="flex-1 flex flex-col justify-center items-center min-w-0">
          <span className="text-sm font-mono font-medium">{segmentFrameCount}</span>
          <span className="text-[10px] text-muted-foreground mb-1">
            Frames in-between
          </span>

          <Slider
            min={1}
            max={getMaxGapFrames(contextFrames)}
            step={4}
            value={Math.max(1, segmentFrameCount)}
            onValueChange={(value) => {
              const sliderValue = Array.isArray(value) ? value[0] : value;
              const quantizedGap = getQuantizedGap(sliderValue, contextFrames);
              onUpdateSelectionSettings(selection.id, { gapFrameCount: quantizedGap });
            }}
            className="w-full"
          />

          {fps && segmentDuration && (
            <span className="text-[10px] text-muted-foreground mt-1">
              = {segmentDuration} @ {fps}fps
            </span>
          )}
        </div>

        {videoUrl && (
          <div className="w-[30%] flex-shrink-0">
            <SegmentThumbnail videoUrl={videoUrl} time={selection.end} size="large" />
          </div>
        )}
      </div>

      <div>
        <Textarea
          value={selection.prompt || ''}
          onChange={(event) =>
            onUpdateSelectionSettings(selection.id, { prompt: event.target.value })
          }
          placeholder="Describe what should happen in this segment..."
          className="min-h-0 h-16 resize-none"
          clearable
          onClear={() => onUpdateSelectionSettings(selection.id, { prompt: '' })}
          voiceInput
          voiceContext="This is a video segment regeneration prompt. Describe what should happen in this specific portion of the video - the motion, action, or visual content you want to generate."
          onVoiceResult={(result) => {
            onUpdateSelectionSettings(selection.id, {
              prompt: result.prompt || result.transcription,
            });
          }}
        />
      </div>
    </div>
  );
}
