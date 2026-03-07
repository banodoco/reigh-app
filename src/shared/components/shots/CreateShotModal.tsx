import React, { useState, useEffect } from 'react';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/primitives/label';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { FileInput } from '@/shared/components/FileInput';
import { parseRatio } from '@/shared/lib/media/aspectRatios';
import { cropImageToProjectAspectRatio } from '@/shared/lib/media/imageCropper';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { AspectRatioSelector } from '@/shared/components/GenerationControls/AspectRatioSelector';
import { useProject } from '@/shared/contexts/ProjectContext';
import { ModalContainer, ModalFooterButtons } from '@/shared/components/ModalContainer';

interface CreateShotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (shotName: string, files: File[], aspectRatio: string | null) => Promise<void>;
  isLoading?: boolean;
  defaultShotName?: string;
  projectAspectRatio?: string;
  initialAspectRatio?: string | null;
  projectId?: string;
  cropToProjectSize?: boolean; // Whether to crop uploaded images (from project settings)
}

const CreateShotModal: React.FC<CreateShotModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  defaultShotName,
  projectAspectRatio,
  initialAspectRatio,
  projectId,
  cropToProjectSize = true, // Default to true if not specified
}) => {
  const [shotName, setShotName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [aspectRatio, setAspectRatio] = useState<string>('');
  const [updateProjectAspectRatio, setUpdateProjectAspectRatio] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // Local state for cropping phase
  const { updateProject } = useProject();
  
  // Initialize aspect ratio from props when modal opens
  useEffect(() => {
    if (isOpen) {
      // Use initialAspectRatio if provided, otherwise fall back to projectAspectRatio, otherwise default to '3:2'
      setAspectRatio(initialAspectRatio || projectAspectRatio || '3:2');
      setUpdateProjectAspectRatio(false);
    }
  }, [isOpen, initialAspectRatio, projectAspectRatio]);

  // Reset checkbox when aspect ratio changes back to project aspect ratio
  useEffect(() => {
    if (aspectRatio === projectAspectRatio) {
      setUpdateProjectAspectRatio(false);
    }
  }, [aspectRatio, projectAspectRatio]);

  const handleSubmit = async () => {
    let finalShotName = shotName.trim();
    if (!finalShotName) {
      finalShotName = defaultShotName || 'Untitled Shot';
    }
    
    setIsProcessing(true);
    
    try {
      // Process files with cropping based on aspect ratio (if cropping is enabled)
      let processedFiles = files;
      
      if (cropToProjectSize && files.length > 0 && aspectRatio) {
        const targetAspectRatio = parseRatio(aspectRatio);
        
        if (!isNaN(targetAspectRatio)) {
          const cropPromises = files.map(async (file) => {
            try {
              const result = await cropImageToProjectAspectRatio(file, targetAspectRatio);
              if (result) {
                return result.croppedFile;
              }
              return file; // Return original if cropping fails
            } catch (error) {
              normalizeAndPresentError(error, { context: 'CreateShotModal', toastTitle: `Failed to crop ${file.name}` });
              return file; // Return original on error
            }
          });
          
          processedFiles = await Promise.all(cropPromises);
        }
      }
      
      // Update project aspect ratio if checkbox is checked (don't await - do in background)
      if (updateProjectAspectRatio && projectId && aspectRatio && aspectRatio !== projectAspectRatio) {
        updateProject(projectId, { aspectRatio });
      }
      
      // Start submission (don't await - parent handles async with skeleton)
      onSubmit(finalShotName, processedFiles, aspectRatio || null);
      
      // Clear form and close
      setShotName('');
      setFiles([]);
      setAspectRatio(projectAspectRatio || '3:2');
      setUpdateProjectAspectRatio(false);
      setIsProcessing(false);
      onClose();
    } catch (error) {
      // Cropping failed - show error but don't close
      normalizeAndPresentError(error, { context: 'CreateShotModal', toastTitle: 'Failed to process images' });
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setShotName('');
    setFiles([]);
    setAspectRatio(projectAspectRatio || '3:2');
    setUpdateProjectAspectRatio(false);
    onClose();
  };

  return (
    <ModalContainer
      open={isOpen}
      onOpenChange={handleClose}
      size="medium"
      title="New Shot"
      footer={
        <ModalFooterButtons
          onCancel={handleClose}
          onConfirm={handleSubmit}
          confirmText={isProcessing ? 'Processing...' : 'New Shot'}
          isLoading={isProcessing}
        />
      }
    >
      <div className="grid gap-3 py-3">
        <div className="space-y-2">
          <Label htmlFor="shot-name">
            Name:
          </Label>
          <Input
            id="shot-name"
            value={shotName}
            onChange={(e) => setShotName(e.target.value)}
            className="w-full"
            placeholder={defaultShotName || "e.g., My Awesome Shot"}
            maxLength={30}
          />
        </div>
        <FileInput
          onFileChange={setFiles}
          multiple
          acceptTypes={['image']}
          label="Starting Images: (Optional)"
        />

        {/* Aspect Ratio Selection */}
        <div className="space-y-2 pt-2 border-t">
          <Label htmlFor="shot-aspect-ratio" className="text-sm font-medium">What size would you like to use?</Label>
          <AspectRatioSelector
            value={aspectRatio}
            onValueChange={setAspectRatio}
            disabled={isProcessing}
            id="shot-aspect-ratio"
            showVisualizer={true}
          />

          {/* Show checkbox when selected aspect ratio differs from project aspect ratio */}
          {aspectRatio && projectAspectRatio && aspectRatio !== projectAspectRatio && (
            <div className="flex items-center gap-x-2 pt-2">
              <Checkbox
                id="update-project-aspect-ratio"
                checked={updateProjectAspectRatio}
                onCheckedChange={(checked) => setUpdateProjectAspectRatio(checked === true)}
                disabled={isProcessing}
              />
              <Label
                htmlFor="update-project-aspect-ratio"
                className="text-sm font-normal cursor-pointer"
              >
                Update project aspect ratio to {aspectRatio}
              </Label>
            </div>
          )}
        </div>
      </div>
    </ModalContainer>
  );
};

export { CreateShotModal };
