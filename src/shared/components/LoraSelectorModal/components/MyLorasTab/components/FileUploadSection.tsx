import React from 'react';
import { Label } from "@/shared/components/ui/primitives/label";
import { Button } from "@/shared/components/ui/button";
import { Progress } from '@/shared/components/ui/progress';
import { X, Upload } from 'lucide-react';

import { HuggingFaceTokenSetup } from '@/shared/components/HuggingFaceTokenSetup';
import type { LoraFiles } from '@/features/lora/hooks/useHuggingFaceUpload';
import { FileDropZone } from './FileDropZone';

interface UploadProgressIndicatorProps {
  uploadProgress: { stage: string; message: string; progress?: number };
}

const UploadProgressIndicator: React.FC<UploadProgressIndicatorProps> = ({ uploadProgress }) => {
  if (uploadProgress.stage === 'idle') return null;

  return (
    <div className="space-y-2 mt-2">
      <div className="flex items-center gap-2 text-sm">
        {uploadProgress.stage === 'error' ? (
          <span className="text-red-600">{uploadProgress.message}</span>
        ) : uploadProgress.stage === 'complete' ? (
          <span className="text-green-600">{uploadProgress.message}</span>
        ) : (
          <span className="text-muted-foreground">{uploadProgress.message}</span>
        )}
      </div>
      {uploadProgress.progress !== undefined && uploadProgress.stage !== 'error' && uploadProgress.stage !== 'complete' && (
        <Progress value={uploadProgress.progress} className="h-2" />
      )}
    </div>
  );
};

interface FileUploadSectionProps {
  isLoadingHfToken: boolean;
  hasHfToken: boolean;
  isMultiStageModel: boolean;
  loraFiles: LoraFiles;
  setLoraFiles: React.Dispatch<React.SetStateAction<LoraFiles>>;
  uploadProgress: { stage: string; message: string; progress?: number };
}

export const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  isLoadingHfToken,
  hasHfToken,
  isMultiStageModel,
  loraFiles,
  setLoraFiles,
  uploadProgress,
}) => {
  if (isLoadingHfToken) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!hasHfToken) {
    return (
      <div className="border rounded-lg p-4 bg-muted/30">
        <HuggingFaceTokenSetup onSuccess={() => {}} />
      </div>
    );
  }

  if (isMultiStageModel) {
    return (
      <div className="space-y-4">
        <FileDropZone
          id="lora-high-noise-file"
          label="High Noise LoRA File:"
          tooltipContent={
            <>
              <p><strong>High Noise LoRA:</strong> Applied during early generation phases (high noise levels).</p>
              <p>This is typically the <code>high_noise_model.safetensors</code> file.</p>
            </>
          }
          file={loraFiles.highNoise}
          onFileChange={(file) => setLoraFiles(prev => ({ ...prev, highNoise: file }))}
          onClear={() => setLoraFiles(prev => ({ ...prev, highNoise: undefined }))}
          placeholder="Select high noise .safetensors file"
        />
        <FileDropZone
          id="lora-low-noise-file"
          label="Low Noise LoRA File:"
          tooltipContent={
            <>
              <p><strong>Low Noise LoRA:</strong> Applied during the final generation phase (low noise level).</p>
              <p>This is typically the <code>low_noise_model.safetensors</code> file.</p>
            </>
          }
          file={loraFiles.lowNoise}
          onFileChange={(file) => setLoraFiles(prev => ({ ...prev, lowNoise: file }))}
          onClear={() => setLoraFiles(prev => ({ ...prev, lowNoise: undefined }))}
          placeholder="Select low noise .safetensors file"
        />
        <UploadProgressIndicator uploadProgress={uploadProgress} />
        <p className="text-xs text-muted-foreground">
          At least one file is required. Files will be uploaded to your HuggingFace account.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="lora-file-input">LoRA File (.safetensors): *</Label>
      <div className="flex flex-col gap-2">
        <div
          className={`relative border-2 border-dashed rounded-lg p-4 transition-colors ${
            loraFiles.single
              ? 'border-green-500 bg-green-50 dark:bg-green-950/30'
              : 'border-muted-foreground/30 hover:border-muted-foreground/50'
          }`}
        >
          <input
            id="lora-file-input"
            type="file"
            accept=".safetensors"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setLoraFiles({ single: file });
              }
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center gap-2 text-center pointer-events-none">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm">
              {loraFiles.single ? (
                <span className="font-medium text-green-700 dark:text-green-300 preserve-case">{loraFiles.single.name}</span>
              ) : (
                <span className="text-muted-foreground">
                  Drop or click to select a <code>.safetensors</code> file
                </span>
              )}
            </div>
            {loraFiles.single && (
              <span className="text-xs text-muted-foreground">
                {(loraFiles.single.size / 1024 / 1024).toFixed(1)} MB
              </span>
            )}
          </div>
        </div>
        {loraFiles.single && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLoraFiles({})}
            className="self-start"
          >
            <X className="h-4 w-4 mr-1" />
            Clear file
          </Button>
        )}
      </div>
      <UploadProgressIndicator uploadProgress={uploadProgress} />
      <p className="text-xs text-muted-foreground">
        Your file will be uploaded to your HuggingFace account. The LoRA will be stored in a new repository.
      </p>
    </div>
  );
};
