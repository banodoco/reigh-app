import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/primitives/label';
import { FileInput } from '@/shared/components/FileInput';
import { Resource, PhaseConfigMetadata } from '@/shared/hooks/useResources';
import { MediaPreview } from '../MediaPreview';
import { UploadedSampleFileCard } from './UploadedSampleFileCard';

interface SampleGenerationsSectionEditStateProps {
  isEditMode: boolean;
  isOverwriting: boolean;
  editingPreset?: (Resource & { metadata: PhaseConfigMetadata }) | null;
  deletedExistingSampleUrls: string[];
  onDeleteExistingSample: (url: string) => void;
}

interface SampleGenerationsSectionInitialVideoProps {
  initialVideoSample: string | null;
  initialVideoDeleted: boolean;
  onDeleteInitialVideo: () => void;
}

interface SampleGenerationsSectionUploadProps {
  sampleFiles: File[];
  previewUrls: string[];
  mainGenerationIndex: number;
  fileInputKey: number;
  onFilesChange: (files: File[]) => void;
  onMainGenerationIndexChange: (index: number) => void;
  onDeleteFile: (index: number) => void;
}

interface SampleGenerationsSectionProps {
  editState: SampleGenerationsSectionEditStateProps;
  initialVideo: SampleGenerationsSectionInitialVideoProps;
  upload: SampleGenerationsSectionUploadProps;
}

export const SampleGenerationsSection: React.FC<SampleGenerationsSectionProps> = ({
  editState,
  initialVideo,
  upload,
}) => {
  const {
    isEditMode,
    isOverwriting,
    editingPreset,
    deletedExistingSampleUrls,
    onDeleteExistingSample,
  } = editState;
  const {
    initialVideoSample,
    initialVideoDeleted,
    onDeleteInitialVideo,
  } = initialVideo;
  const {
    sampleFiles,
    previewUrls,
    mainGenerationIndex,
    fileInputKey,
    onFilesChange,
    onMainGenerationIndexChange,
    onDeleteFile,
  } = upload;

  return (
    <div className="space-y-3 pt-2 border-t">
      <Label className="text-base font-semibold">Sample Generations</Label>
      <p className="text-sm text-muted-foreground">
        Add sample images or videos to showcase what this preset can generate.
      </p>

      {/* Display existing samples when editing */}
      {isEditMode && editingPreset?.metadata.sample_generations && editingPreset.metadata.sample_generations.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-light">Existing Samples: ({editingPreset.metadata.sample_generations.filter(s => !deletedExistingSampleUrls.includes(s.url)).length})</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {editingPreset.metadata.sample_generations
              .filter(sample => !deletedExistingSampleUrls.includes(sample.url))
              .map((sample, index) => {
                const isPrimary = sample.url === editingPreset.metadata.main_generation;
                return (
                  <div key={sample.url} className="relative group">
                    <div
                      className={`relative rounded-lg border-2 overflow-hidden ${
                        isPrimary
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                          : 'border-gray-200'
                      }`}
                    >
                      <MediaPreview
                        url={sample.url}
                        type={sample.type === 'video' ? 'video' : 'image'}
                        alt={sample.alt_text || 'Sample'}
                        height="h-24"
                        objectFit="cover"
                      />

                      {/* Primary indicator */}
                      {isPrimary && (
                        <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                          Primary
                        </div>
                      )}

                      {/* Delete button */}
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteExistingSample(sample.url);
                        }}
                        title="Delete sample"
                      >
                        ×
                      </Button>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                      {sample.alt_text || `Sample ${index + 1}`}
                    </p>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Display initial video sample from last generation (when not editing OR overwriting) */}
      {(!isEditMode || isOverwriting) && initialVideoSample && !initialVideoDeleted && (
        <div className="space-y-2">
          <Label className="text-sm font-light">Last Generated Video: (auto-included)</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="relative group">
              <div className="relative rounded-lg border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/30 overflow-hidden">
                <MediaPreview
                  url={initialVideoSample}
                  type="video"
                  height="h-24"
                  objectFit="cover"
                />

                {/* Primary indicator */}
                <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                  Primary
                </div>

                {/* Delete button */}
                <Button
                  size="sm"
                  variant="destructive"
                  className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteInitialVideo();
                  }}
                  title="Remove from preset"
                >
                  ×
                </Button>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                Latest video generation
              </p>
            </div>
          </div>
        </div>
      )}

      <FileInput
        key={fileInputKey}
        onFileChange={(newFiles) => {
          onFilesChange([...sampleFiles, ...newFiles]);
        }}
        acceptTypes={['image', 'video']}
        multiple={true}
        label={isEditMode ? "Add more sample images/videos" : "Upload sample images/videos"}
      />

      {/* Display uploaded files */}
      {sampleFiles.length > 0 && (
        <div className="space-y-2 mt-3">
          <Label className="text-sm font-light">Uploaded Files: ({sampleFiles.length})</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {sampleFiles.map((file, index) => (
              <UploadedSampleFileCard
                key={index}
                file={file}
                previewUrl={previewUrls[index] || ''}
                index={index}
                isPrimary={mainGenerationIndex === index}
                onSelect={() => onMainGenerationIndexChange(index)}
                onDelete={() => onDeleteFile(index)}
              />
            ))}
          </div>
          {sampleFiles.length > 1 && (
            <p className="text-xs text-gray-500">
              Click on any image/video to set it as the primary generation. Primary generation will be featured prominently.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
