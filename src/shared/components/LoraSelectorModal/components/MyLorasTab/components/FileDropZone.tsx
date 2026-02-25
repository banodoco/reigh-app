import React from 'react';
import { Label } from "@/shared/components/ui/primitives/label";
import { Button } from "@/shared/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { Info, X, Upload } from 'lucide-react';

interface FileDropZoneProps {
  id: string;
  label: string;
  tooltipContent: React.ReactNode;
  file?: File;
  onFileChange: (file: File) => void;
  onClear: () => void;
  placeholder: string;
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({
  id,
  label,
  tooltipContent,
  file,
  onFileChange,
  onClear,
  placeholder,
}) => (
  <div className="space-y-2">
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
              <Info className="h-4 w-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-md">
            <div className="text-xs space-y-1">
              {tooltipContent}
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
    <div
      className={`relative border-2 border-dashed rounded-lg p-3 transition-colors ${
        file
          ? 'border-green-500 bg-green-50 dark:bg-green-950/30'
          : 'border-muted-foreground/30 hover:border-muted-foreground/50'
      }`}
    >
      <input
        id={id}
        type="file"
        accept=".safetensors"
        onChange={(e) => {
          const selectedFile = e.target.files?.[0];
          if (selectedFile) onFileChange(selectedFile);
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <div className="flex items-center gap-3 pointer-events-none">
        <Upload className="h-6 w-6 text-muted-foreground flex-shrink-0" />
        <div className="text-sm flex-1 min-w-0">
          {file ? (
            <div className="flex items-center gap-2">
              <span className="font-medium text-green-700 dark:text-green-300 truncate preserve-case">{file.name}</span>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                ({(file.size / 1024 / 1024).toFixed(1)} MB)
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </div>
        {file && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="pointer-events-auto h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  </div>
);
