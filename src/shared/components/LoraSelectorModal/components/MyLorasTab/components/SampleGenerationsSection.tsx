import React from 'react';
import { Label } from "@/shared/components/ui/primitives/label";
import { Button } from "@/shared/components/ui/button";

import FileInput from "@/shared/components/FileInput";
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';

import type { Resource } from '@/shared/hooks/useResources';
import { LoraModel } from '../../../types';

interface SampleGenerationsSectionProps {
  isEditMode: boolean;
  editingLora?: (Resource & { metadata: LoraModel }) | null;
  deletedExistingSampleUrls: string[];
  setDeletedExistingSampleUrls: React.Dispatch<React.SetStateAction<string[]>>;
  sampleFiles: File[];
  setSampleFiles: React.Dispatch<React.SetStateAction<File[]>>;
  previewUrls: string[];
  mainGenerationIndex: number;
  setMainGenerationIndex: React.Dispatch<React.SetStateAction<number>>;
  fileInputKey: number;
  setFileInputKey: React.Dispatch<React.SetStateAction<number>>;
}

export const SampleGenerationsSection: React.FC<SampleGenerationsSectionProps> = ({
  isEditMode,
  editingLora,
  deletedExistingSampleUrls,
  setDeletedExistingSampleUrls,
  sampleFiles,
  setSampleFiles,
  previewUrls,
  mainGenerationIndex,
  setMainGenerationIndex,
  fileInputKey,
  setFileInputKey,
}) => (
  <div className="space-y-2">
    {/* Display existing samples when editing */}
    {isEditMode && editingLora?.metadata.sample_generations && editingLora.metadata.sample_generations.length > 0 && (
      <div className="space-y-2 mb-3">
        <Label className="text-sm font-light">
          Existing Samples: ({editingLora.metadata.sample_generations.filter((s: { url: string }) => !deletedExistingSampleUrls.includes(s.url)).length})
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {editingLora.metadata.sample_generations
            .filter((sample: { url: string; type?: string; alt_text?: string }) => !deletedExistingSampleUrls.includes(sample.url))
            .map((sample: { url: string; type?: string; alt_text?: string }, index: number) => {
              const isPrimary = sample.url === editingLora.metadata.main_generation;
              return (
                <div key={sample.url} className="relative group">
                  <div
                    className={`relative rounded-lg border-2 overflow-hidden ${
                      isPrimary
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                        : 'border-gray-200'
                    }`}
                  >
                    {sample.type === 'image' ? (
                      <img
                        src={sample.url}
                        alt={sample.alt_text || 'Sample'}
                        className="w-full h-24 object-cover"
                      />
                    ) : (
                      <div className="relative h-24 w-full">
                        <HoverScrubVideo
                          src={sample.url}
                          className="h-full w-full"
                          videoClassName="object-cover"
                          autoplayOnHover={false}
                          preload="metadata"
                          loop
                          muted
                        />
                      </div>
                    )}

                    {isPrimary && (
                      <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                        Primary
                      </div>
                    )}

                    <Button
                      size="sm"
                      variant="destructive"
                      className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletedExistingSampleUrls(prev => [...prev, sample.url]);
                      }}
                      title="Delete sample"
                    >
                      x
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

    <FileInput
      key={fileInputKey}
      onFileChange={(newFiles) => {
        setSampleFiles(prevFiles => [...prevFiles, ...newFiles]);
        setFileInputKey(prev => prev + 1);
      }}
      acceptTypes={['image', 'video']}
      multiple={true}
      label={isEditMode ? "Add more sample images/videos (optional)" : "Upload sample images/videos (optional)"}
    />

    {/* Display uploaded files */}
    {sampleFiles.length > 0 && (
      <div className="space-y-2 mt-3">
        <Label className="text-sm font-light">Uploaded Files: ({sampleFiles.length})</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {sampleFiles.map((file, index) => (
            <div key={index} className="relative group">
              <div
                className={`relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${
                  mainGenerationIndex === index
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setMainGenerationIndex(index)}
                title={mainGenerationIndex === index ? "Primary generation" : "Click to set as primary"}
              >
                {file.type.startsWith('image/') ? (
                  <img
                    src={previewUrls[index] || ''}
                    alt={file.name}
                    className="w-full h-24 object-cover"
                  />
                ) : (
                  <video
                    src={previewUrls[index] || ''}
                    className="w-full h-24 object-cover"
                    muted
                  />
                )}

                {mainGenerationIndex === index && (
                  <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                    Primary
                  </div>
                )}

                <Button
                  size="sm"
                  variant="destructive"
                  className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newFiles = sampleFiles.filter((_, i) => i !== index);
                    setSampleFiles(newFiles);
                    if (mainGenerationIndex === index) {
                      setMainGenerationIndex(0);
                    } else if (mainGenerationIndex > index) {
                      setMainGenerationIndex(mainGenerationIndex - 1);
                    }
                  }}
                  title="Delete file"
                >
                  x
                </Button>
              </div>
              <p className="text-xs text-gray-600 mt-1 truncate preserve-case" title={file.name}>
                {file.name}
              </p>
            </div>
          ))}
        </div>
        {sampleFiles.length > 1 && (
          <p className="text-xs text-gray-500">
            Click on any image to set it as the primary generation. Primary generation will be featured prominently.
          </p>
        )}
      </div>
    )}
  </div>
);
