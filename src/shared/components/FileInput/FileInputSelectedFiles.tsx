import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { cropFilename } from '@/shared/lib/stringFormatting';
import { FileText, ImagePlus, Trash2, VideoIcon, X } from 'lucide-react';

interface DisplayFile {
  name: string;
  type: string;
}

interface FileInputSelectedFilesProps {
  displayFiles: DisplayFile[];
  displayPreviewUrls: string[];
  multiple: boolean;
  disabled: boolean;
  suppressSelectionSummary: boolean;
  suppressRemoveAll: boolean;
  onRemoveAll: () => void;
  onRemoveFile: (index: number) => void;
}

export function FileInputSelectedFiles({
  displayFiles,
  displayPreviewUrls,
  multiple,
  disabled,
  suppressSelectionSummary,
  suppressRemoveAll,
  onRemoveAll,
  onRemoveFile,
}: FileInputSelectedFilesProps) {
  return (
    <div className="space-y-2">
      {!suppressSelectionSummary && (
        <div className="text-sm text-muted-foreground p-2 border rounded-md bg-background flex items-center justify-between">
          <div className="flex-1 text-center">
            {displayFiles.length} file{displayFiles.length === 1 ? '' : 's'} selected
            {multiple && !disabled && (
              <span className="block text-xs mt-1 text-primary">
                <ImagePlus className="inline h-3 w-3 mr-1" />
                Click or drag to add more
              </span>
            )}
          </div>
          {!suppressRemoveAll && !disabled && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveAll();
                    }}
                    className="h-6 w-6 text-muted-foreground hover:text-destructive flex-shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Remove all files</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-32 sm:max-h-24 overflow-y-auto">
        {displayFiles.map((file, index) => (
          <div key={index} className="relative group">
            {file.type.startsWith('image/') && displayPreviewUrls[index] ? (
              <img
                src={displayPreviewUrls[index]}
                alt={file.name || `Preview ${index + 1}`}
                className="w-full h-16 object-cover rounded border"
              />
            ) : file.type.startsWith('video/') && displayPreviewUrls[index] ? (
              <div className="w-full h-16 bg-gray-200 rounded border flex items-center justify-center">
                <VideoIcon className="h-6 w-6 text-gray-500" />
              </div>
            ) : (
              <div className="w-full h-16 bg-gray-200 rounded border flex items-center justify-center">
                <FileText className="h-6 w-6 text-gray-500" />
              </div>
            )}

            {!disabled && (
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveFile(index);
                }}
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-3 w-3" />
              </Button>
            )}

            <p className="text-xs text-muted-foreground mt-1 truncate text-center preserve-case" title={file.name}>
              {cropFilename(file.name)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
