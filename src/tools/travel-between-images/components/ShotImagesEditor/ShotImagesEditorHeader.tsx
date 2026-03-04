import React from 'react';
import { CardHeader, CardTitle } from '@/shared/components/ui/card';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Download, Loader2, Play } from 'lucide-react';
import type { ShotImagesEditorResolvedProps } from './types';

export function EditorHeader(props: {
  settingsError?: string;
  readOnly: boolean;
  hasVideosToPreview: boolean;
  isDownloadingImages: boolean;
  hasImages: boolean;
  isMobile: boolean;
  generationMode: ShotImagesEditorResolvedProps['generationMode'];
  onGenerationModeChange: ShotImagesEditorResolvedProps['onGenerationModeChange'];
  onOpenPreview: () => void;
  onDownloadAll: () => void;
}) {
  const {
    settingsError,
    readOnly,
    hasVideosToPreview,
    isDownloadingImages,
    hasImages,
    isMobile,
    generationMode,
    onGenerationModeChange,
    onOpenPreview,
    onDownloadAll,
  } = props;

  return (
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base sm:text-lg font-light">
            Guidance
            {settingsError && <div className="text-sm text-destructive mt-1">{settingsError}</div>}
          </CardTitle>

          {!readOnly && hasVideosToPreview && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onOpenPreview}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  >
                    <Play className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Preview all segments</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {!readOnly && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDownloadAll}
                    disabled={isDownloadingImages || !hasImages}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  >
                    {isDownloadingImages
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Download className="h-3 w-3" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Download all images as zip</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {!isMobile && (
          <SegmentedControl
            value={generationMode}
            onValueChange={(value) => {
              if (!readOnly && (value === 'batch' || value === 'timeline' || value === 'by-pair')) {
                onGenerationModeChange(value);
              }
            }}
            disabled={readOnly}
          >
            <SegmentedControlItem value="timeline">Timeline</SegmentedControlItem>
            <SegmentedControlItem value="batch">Batch</SegmentedControlItem>
          </SegmentedControl>
        )}
      </div>
    </CardHeader>
  );
}
