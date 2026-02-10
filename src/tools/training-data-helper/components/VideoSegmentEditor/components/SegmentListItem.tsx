import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/shared/components/ui/alert-dialog';
import { TrainingDataSegment } from '../../../hooks/useTrainingData';
import { SegmentFramePreview } from './SegmentFramePreview';

interface SegmentColor {
  bg: string;
  border: string;
}

interface SegmentListItemProps {
  segment: TrainingDataSegment;
  color: SegmentColor;
  isCurrentSegment: boolean;
  formatDuration: (ms: number) => string;
  jumpToTime: (time: number) => void;
  onEdit: (segment: TrainingDataSegment) => void;
  onPreview: (segment: TrainingDataSegment) => void;
  onDelete: (segmentId: string) => void;
  captureFrameAtTime: (timeInSeconds: number) => Promise<string | null>;
  videoReady: boolean;
}

export function SegmentListItem({
  segment,
  color,
  isCurrentSegment,
  formatDuration,
  jumpToTime,
  onEdit,
  onPreview,
  onDelete,
  captureFrameAtTime,
  videoReady,
}: SegmentListItemProps) {
  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg border-2 ${color.border} ${
        isCurrentSegment
          ? 'bg-yellow-50 border-yellow-400 shadow-md ring-2 ring-yellow-200'
          : 'bg-opacity-5'
      } transition-all duration-200`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {/* Start time */}
          <div className="flex items-center gap-1">
            <Badge variant="outline" className={`${color.border} text-current`}>
              Start: {formatDuration(segment.startTime)}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => jumpToTime(segment.startTime / 1000)}
              className="h-6 px-2 text-xs"
            >
              Jump to
            </Button>
          </div>

          {/* End time */}
          <div className="flex items-center gap-1">
            <Badge variant="outline" className={`${color.border} text-current`}>
              End: {formatDuration(segment.endTime)}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => jumpToTime(segment.endTime / 1000)}
              className="h-6 px-2 text-xs"
            >
              Jump to
            </Button>
          </div>

          {/* Duration */}
          <Badge variant="secondary">
            Duration: {formatDuration(segment.endTime - segment.startTime)}
          </Badge>

          {/* Frame count */}
          <Badge variant="outline" className="text-muted-foreground">
            {Math.round((segment.endTime - segment.startTime) / 1000 * 30)} frames
          </Badge>

          {/* Current segment indicator */}
          {isCurrentSegment && (
            <Badge variant="default" className="bg-yellow-500 text-yellow-900">
              Currently Playing
            </Badge>
          )}
        </div>
        {segment.description && (
          <p className="text-sm text-muted-foreground">
            {segment.description}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Created: {new Date(segment.createdAt).toLocaleString()}
        </p>

        {/* Frame Preview */}
        <SegmentFramePreview
          segment={segment}
          captureFrameAtTime={captureFrameAtTime}
          videoReady={videoReady}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(segment)}
        >
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPreview(segment)}
        >
          Preview
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Segment</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this segment? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(segment.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
