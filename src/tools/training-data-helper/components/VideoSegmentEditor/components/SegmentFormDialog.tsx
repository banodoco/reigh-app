import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Scissors, Trash2, Plus, Video } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';

interface SegmentFormDialogProps {
  segmentStartTime: number | null;
  segmentEndTime: number | null;
  currentTime: number;
  description: string;
  isCreating: boolean;
  startFrameImage: string | null;
  endFrameImage: string | null;
  formatTimeWithMs: (seconds: number) => string;
  onDescriptionChange: (value: string) => void;
  onStartSegment: () => void;
  onEndSegment: () => void;
  onCreateSegment: () => void;
  onCancelSegment: () => void;
  onJumpToTime: (time: number) => void;
  onClearStartTime: () => void;
  onClearEndTime: () => void;
}

export function SegmentFormDialog({
  segmentStartTime,
  segmentEndTime,
  currentTime,
  description,
  isCreating,
  startFrameImage,
  endFrameImage,
  formatTimeWithMs,
  onDescriptionChange,
  onStartSegment,
  onEndSegment,
  onCreateSegment,
  onCancelSegment,
  onJumpToTime,
  onClearStartTime,
  onClearEndTime,
}: SegmentFormDialogProps) {
  return (
    <div className="w-1/5 space-y-4">
      {/* Segment Creation Controls */}
      <div className="space-y-3 bg-muted p-3 rounded">
        {segmentStartTime === null ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                onClick={onStartSegment}
                className="flex items-center gap-1 w-full"
              >
                <Scissors className="h-4 w-4" />
                Start Segment
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Press 'S' or '5' to start segment</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="space-y-2">
            {/* Live preview when dragging */}
            {segmentEndTime === null && currentTime > segmentStartTime && (
              <div className="text-sm text-orange-600 bg-orange-50 p-2 rounded">
                <div className="font-light">Live Preview</div>
                <div className="text-xs">
                  Duration: {formatTimeWithMs(currentTime - segmentStartTime)}
                </div>
              </div>
            )}

            {/* Description and Create Button - only show when both start and end are set */}
            {segmentEndTime !== null && (
              <div className="space-y-2">
                <div>
                  <Label htmlFor="segment-description" className="text-sm">
                    Description (optional)
                  </Label>
                  <Textarea
                    id="segment-description"
                    value={description}
                    onChange={(e) => onDescriptionChange(e.target.value)}
                    placeholder="Describe this segment..."
                    rows={2}
                    className="mt-1"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={onCreateSegment}
                        disabled={isCreating}
                        className="flex items-center gap-1 w-full"
                      >
                        <Plus className="h-4 w-4" />
                        {isCreating ? 'Creating...' : 'Create Segment'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Press Enter to create segment</p>
                    </TooltipContent>
                  </Tooltip>
                  <Button
                    variant="outline"
                    onClick={onCancelSegment}
                    disabled={isCreating}
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Frame Previews */}
      {segmentStartTime !== null && (
        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm font-light text-green-700">
              {segmentEndTime !== null ? 'Segment Frames' : `Start Frame (${formatTimeWithMs(segmentStartTime)})`}
            </span>
          </div>

          <div className="space-y-4">
            {/* Start Frame */}
            <div className="text-center">
              <div className="text-xs text-green-700 mb-1 font-light">
                Start ({formatTimeWithMs(segmentStartTime)})
              </div>
              {startFrameImage ? (
                <img
                  src={startFrameImage}
                  alt="Start frame"
                  className="w-full h-20 object-cover rounded border shadow-sm"
                />
              ) : (
                <div className="w-full h-20 bg-gray-100 rounded border shadow-sm flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <Video className="h-4 w-4 mx-auto mb-1" />
                    <div className="text-xs">Unavailable</div>
                  </div>
                </div>
              )}
              <div className="flex gap-1 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onJumpToTime(segmentStartTime)}
                  className="text-xs px-2 py-1 h-6 flex-1"
                >
                  Jump to here
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onClearStartTime}
                      className="text-xs px-1 py-1 h-6 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Remove start time (Press 'D' to remove last mark)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* End Here Controls - show when start is set but end is not */}
            {segmentEndTime === null && (
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <div className="text-center">
                  <div className="text-xs text-red-700 mb-1 font-light">
                    End at ({formatTimeWithMs(currentTime)})
                  </div>
                  <div className="text-xs text-red-600 mb-2 font-medium">
                    {Math.round((currentTime - segmentStartTime) * 30)} frames
                  </div>
                  <div className="flex gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={onEndSegment}
                          className="flex items-center gap-1 flex-1"
                        >
                          <Scissors className="h-4 w-4" />
                          End Here
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Press 'S' or '5' to end segment</p>
                      </TooltipContent>
                    </Tooltip>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onCancelSegment}
                      className="text-xs px-2"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* End Frame */}
            {segmentEndTime !== null && (
              <div className="text-center">
                <div className="text-xs text-red-700 mb-1 font-light">
                  End ({formatTimeWithMs(segmentEndTime)})
                </div>
                {endFrameImage ? (
                  <img
                    src={endFrameImage}
                    alt="End frame"
                    className="w-full h-20 object-cover rounded border shadow-sm"
                  />
                ) : (
                  <div className="w-full h-20 bg-gray-100 rounded border shadow-sm flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <Video className="h-4 w-4 mx-auto mb-1" />
                      <div className="text-xs">Unavailable</div>
                    </div>
                  </div>
                )}
                <div className="flex gap-1 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onJumpToTime(segmentEndTime)}
                    className="text-xs px-2 py-1 h-6 flex-1"
                  >
                    Jump to here
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClearEndTime}
                        className="text-xs px-1 py-1 h-6 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Remove end time (Press 'D' to remove last mark)</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            )}
          </div>

          {/* Duration Info */}
          {segmentEndTime !== null && (
            <div className="mt-3 text-center">
              <div className="text-sm text-green-700 font-light">
                Duration: {formatTimeWithMs(segmentEndTime - segmentStartTime)}
                <span className="ml-2 text-xs">
                  (~{Math.round((segmentEndTime - segmentStartTime) * 30)} frames @ 30fps)
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
