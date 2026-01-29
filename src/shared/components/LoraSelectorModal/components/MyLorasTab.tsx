import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter as ItemCardFooter, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { Progress } from '@/shared/components/ui/progress';
import { Info, X, Pencil, Upload, Link } from 'lucide-react';
import { toast } from "sonner";

import FileInput from "@/shared/components/FileInput";
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import HuggingFaceTokenSetup from '@/shared/components/HuggingFaceTokenSetup';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { supabase } from '@/integrations/supabase/client';
import { useHuggingFaceToken } from '@/shared/hooks/useExternalApiKeys';
import { useHuggingFaceUpload, LoraFiles } from '@/shared/hooks/useHuggingFaceUpload';

import { MyLorasTabProps, LoraModel, LoraFormState } from '../types';
import { validateHuggingFaceUrl, generateUniqueFilename } from '../utils/validation-utils';
import { DEFAULT_FORM_STATE, BASE_MODEL_OPTIONS } from '../constants';

export const MyLorasTab: React.FC<MyLorasTabProps> = ({
  myLorasResource,
  deleteResource,
  createResource,
  updateResource,
  onSwitchToBrowse,
  editingLora,
  onClearEdit,
  defaultIsPublic
}) => {
  const isEditMode = !!editingLora;
  const [addForm, setAddForm] = useState<LoraFormState>({
    ...DEFAULT_FORM_STATE,
    is_public: defaultIsPublic,
  });

  // Upload mode: 'url' = paste HuggingFace URL, 'file' = upload file to HuggingFace
  const [uploadMode, setUploadMode] = useState<'url' | 'file'>('url');
  // LoRA files: supports single-stage (single) and multi-stage (highNoise + lowNoise)
  const [loraFiles, setLoraFiles] = useState<LoraFiles>({});

  // HuggingFace token and upload hooks
  const { hasToken: hasHfToken, isLoading: isLoadingHfToken } = useHuggingFaceToken();
  const { uploadToHuggingFace, uploadProgress, resetProgress, isUploading } = useHuggingFaceUpload();

  // Check if current base_model supports multi-stage URLs (Wan 2.2 I2V and T2V)
  const supportsMultiStage = addForm.base_model === 'Wan 2.2 I2V' || addForm.base_model === 'Wan 2.2 T2V';

  // Track whether user wants single or multi-stage mode for Wan 2.2 models
  const [loraMode, setLoraMode] = useState<'single' | 'multi'>('multi');

  // Actual multi-stage mode: only if model supports it AND user selected multi mode
  const isMultiStageModel = supportsMultiStage && loraMode === 'multi';

  const [sampleFiles, setSampleFiles] = useState<File[]>([]);
  const [deletedExistingSampleUrls, setDeletedExistingSampleUrls] = useState<string[]>([]);
  const [mainGenerationIndex, setMainGenerationIndex] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [fileInputKey, setFileInputKey] = useState<number>(0);
  const [userName, setUserName] = useState<string>('');

  // Manage preview URLs for sample files
  useEffect(() => {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    const newUrls = sampleFiles.map(file => URL.createObjectURL(file));
    setPreviewUrls(newUrls);

    if (mainGenerationIndex >= sampleFiles.length) {
      setMainGenerationIndex(0);
    }

    return () => {
      newUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [sampleFiles]);

  // Pre-populate form when editing
  useEffect(() => {
    if (editingLora && editingLora.metadata) {
      const metadata = editingLora.metadata;
      setAddForm({
        name: metadata.Name || '',
        description: metadata.Description || '',
        created_by_is_you: metadata.created_by?.is_you ?? false,
        created_by_username: metadata.created_by?.username || '',
        huggingface_url: metadata["Model Files"]?.[0]?.url || '',
        base_model: metadata.base_model || 'Wan 2.1 T2V',
        is_public: metadata.is_public ?? true,
        trigger_word: metadata.trigger_word || '',
        high_noise_url: metadata.high_noise_url || '',
        low_noise_url: metadata.low_noise_url || '',
      });

      const hasMultiStageUrls = !!(metadata.high_noise_url && metadata.low_noise_url);
      setLoraMode(hasMultiStageUrls ? 'multi' : 'single');

      setSampleFiles([]);
      setDeletedExistingSampleUrls([]);
      setMainGenerationIndex(0);
      setFileInputKey(prev => prev + 1);
    }
  }, [editingLora]);

  // Fetch current user's name
  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('users')
          .select('name')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching user name:', error);
          return;
        }

        setUserName(data?.name || '');
      } catch (error) {
        console.error('Error in fetchUserName:', error);
      }
    };

    fetchUserName();
  }, []);

  // Get existing filenames from saved LoRAs
  const getExistingFilenames = () => {
    const savedFilenames = myLorasResource.data?.map(r => (r.metadata as LoraModel).filename || (r.metadata as LoraModel)["Model ID"]) || [];
    return savedFilenames;
  };

  const handleFormChange = (field: string, value: any) => {
    setAddForm(prev => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setAddForm({
      ...DEFAULT_FORM_STATE,
      is_public: defaultIsPublic,
    });
    setLoraMode('multi');
    setUploadMode('url');
    setLoraFiles({});
    resetProgress();
    setSampleFiles([]);
    setDeletedExistingSampleUrls([]);
    setMainGenerationIndex(0);
    setFileInputKey(prev => prev + 1);
  };

  const handleAddLoraFromForm = async () => {
    if (!addForm.name.trim()) {
      toast.error("Name is required");
      return;
    }

    // Determine which mode we're in
    const isSingleStageFileMode = uploadMode === 'file' && !isMultiStageModel && !isEditMode;
    const isMultiStageFileMode = uploadMode === 'file' && isMultiStageModel && !isEditMode;
    const isMultiStageUrlMode = (uploadMode === 'url' || isEditMode) && isMultiStageModel;
    const isSingleStageUrlMode = (uploadMode === 'url' || isEditMode) && !isMultiStageModel;

    // Validate based on mode
    if (isSingleStageFileMode) {
      if (!loraFiles.single) {
        toast.error("Please select a LoRA file to upload");
        return;
      }
    } else if (isMultiStageFileMode) {
      if (!loraFiles.highNoise && !loraFiles.lowNoise) {
        toast.error("Please select at least one LoRA file (High Noise or Low Noise)");
        return;
      }
    } else if (isMultiStageUrlMode) {
      const hasHighNoise = addForm.high_noise_url.trim().length > 0;
      const hasLowNoise = addForm.low_noise_url.trim().length > 0;

      if (!hasHighNoise && !hasLowNoise) {
        toast.error("Please provide at least one LoRA URL (High Noise or Low Noise)");
        return;
      }

      if (hasHighNoise) {
        const highNoiseValidation = validateHuggingFaceUrl(addForm.high_noise_url);
        if (!highNoiseValidation.isValid) {
          toast.error(`Invalid High Noise URL: ${highNoiseValidation.message}`);
          return;
        }
      }
      if (hasLowNoise) {
        const lowNoiseValidation = validateHuggingFaceUrl(addForm.low_noise_url);
        if (!lowNoiseValidation.isValid) {
          toast.error(`Invalid Low Noise URL: ${lowNoiseValidation.message}`);
          return;
        }
      }
    } else if (isSingleStageUrlMode) {
      const urlValidation = validateHuggingFaceUrl(addForm.huggingface_url);
      if (!urlValidation.isValid) {
        toast.error(`Invalid HuggingFace URL: ${urlValidation.message}`);
        return;
      }
    }

    setIsSubmitting(true);

    let finalHuggingfaceUrl = addForm.huggingface_url;
    let finalHighNoiseUrl = addForm.high_noise_url;
    let finalLowNoiseUrl = addForm.low_noise_url;

    // Handle file uploads to HuggingFace
    if (isSingleStageFileMode && loraFiles.single) {
      const uploadResult = await uploadToHuggingFace(
        loraFiles,
        {
          name: addForm.name,
          description: addForm.description,
          baseModel: addForm.base_model,
          triggerWord: addForm.trigger_word,
          creatorName: addForm.created_by_is_you ? (userName || 'You') : addForm.created_by_username,
        },
        sampleFiles.filter(f => f.type.startsWith('video/')),
        { isPrivate: !addForm.is_public }
      );

      if (!uploadResult.success) {
        toast.error(`Failed to upload to HuggingFace: ${uploadResult.error}`);
        setIsSubmitting(false);
        return;
      }

      finalHuggingfaceUrl = uploadResult.loraUrl!;
      toast.success(`Uploaded to HuggingFace: ${uploadResult.repoUrl}`);
    } else if (isMultiStageFileMode && (loraFiles.highNoise || loraFiles.lowNoise)) {
      const uploadResult = await uploadToHuggingFace(
        loraFiles,
        {
          name: addForm.name,
          description: addForm.description,
          baseModel: addForm.base_model,
          triggerWord: addForm.trigger_word,
          creatorName: addForm.created_by_is_you ? (userName || 'You') : addForm.created_by_username,
        },
        sampleFiles.filter(f => f.type.startsWith('video/')),
        { isPrivate: !addForm.is_public }
      );

      if (!uploadResult.success) {
        toast.error(`Failed to upload to HuggingFace: ${uploadResult.error}`);
        setIsSubmitting(false);
        return;
      }

      if (uploadResult.highNoiseUrl) finalHighNoiseUrl = uploadResult.highNoiseUrl;
      if (uploadResult.lowNoiseUrl) finalLowNoiseUrl = uploadResult.lowNoiseUrl;
      toast.success(`Uploaded to HuggingFace: ${uploadResult.repoUrl}`);
    }

    try {
      // Upload sample generations
      const uploadedSamples: { url: string; type: 'image' | 'video'; alt_text?: string; }[] = [];

      for (const file of sampleFiles) {
        const uploadedUrl = await uploadImageToStorage(file);
        uploadedSamples.push({
          url: uploadedUrl,
          type: file.type.startsWith('video/') ? 'video' : 'image',
          alt_text: file.name,
        });
      }

      // Combine existing samples (minus deleted ones) with new uploads
      const existingSamples = isEditMode
        ? (editingLora?.metadata.sample_generations || []).filter(s => !deletedExistingSampleUrls.includes(s.url))
        : [];
      const existingImages = isEditMode
        ? (editingLora?.metadata.Images || []).filter(img => !deletedExistingSampleUrls.includes(img.url))
        : [];

      const finalSamples = [...existingSamples, ...uploadedSamples];
      const finalImages = [
        ...existingImages,
        ...uploadedSamples.map(sample => ({
          url: sample.url,
          alt_text: sample.alt_text || '',
          type: sample.type,
        }))
      ];

      // Determine main generation
      let mainGeneration: string | undefined;
      if (uploadedSamples.length > 0 && uploadedSamples[mainGenerationIndex]) {
        mainGeneration = uploadedSamples[mainGenerationIndex].url;
      } else if (isEditMode && editingLora?.metadata.main_generation && !deletedExistingSampleUrls.includes(editingLora.metadata.main_generation)) {
        mainGeneration = editingLora.metadata.main_generation;
      } else if (finalSamples.length > 0) {
        mainGeneration = finalSamples[0].url;
      }

      // Generate unique filename
      const existingFilenames = getExistingFilenames();
      const uniqueFilename = isEditMode
        ? (editingLora?.metadata["Model ID"] || editingLora?.metadata.filename || generateUniqueFilename(addForm.name, addForm.base_model, finalHuggingfaceUrl, existingFilenames))
        : generateUniqueFilename(addForm.name, addForm.base_model, finalHuggingfaceUrl, existingFilenames);

      // Determine the primary URL for Model Files
      const primaryUrl = isMultiStageModel
        ? (finalHighNoiseUrl.trim() || finalLowNoiseUrl.trim())
        : finalHuggingfaceUrl;

      // Create/Update the LoRA model
      const loraMetadata: LoraModel = {
        "Model ID": uniqueFilename,
        Name: addForm.name,
        Author: addForm.created_by_is_you ? (userName || 'You') : (addForm.created_by_username || 'Unknown'),
        Description: addForm.description || undefined,
        Images: finalImages,
        "Model Files": [{
          path: uniqueFilename,
          url: primaryUrl,
        }],
        lora_type: 'Wan 2.1 14b',
        created_by: {
          is_you: addForm.created_by_is_you,
          username: addForm.created_by_is_you ? undefined : addForm.created_by_username,
        },
        huggingface_url: isMultiStageModel ? undefined : finalHuggingfaceUrl,
        filename: uniqueFilename,
        base_model: addForm.base_model,
        sample_generations: finalSamples,
        main_generation: mainGeneration,
        is_public: addForm.is_public,
        "Last Modified": new Date().toISOString(),
        trigger_word: addForm.trigger_word,
        ...(isMultiStageModel && finalHighNoiseUrl.trim() ? { high_noise_url: finalHighNoiseUrl.trim() } : {}),
        ...(isMultiStageModel && finalLowNoiseUrl.trim() ? { low_noise_url: finalLowNoiseUrl.trim() } : {}),
      };

      if (isEditMode && editingLora) {
        await updateResource.mutateAsync({
          id: editingLora.id,
          type: 'lora',
          metadata: loraMetadata as any
        });
        onClearEdit();
      } else {
        await createResource.mutateAsync({ type: 'lora', metadata: loraMetadata as any });
      }

      resetForm();
      onSwitchToBrowse();
    } catch (error) {
      console.error(`Error ${isEditMode ? 'updating' : 'adding'} LoRA:`, error);
      toast.error(`Failed to ${isEditMode ? 'update' : 'add'} LoRA: ` + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check button disabled state
  const isButtonDisabled = () => {
    if (isSubmitting || isUploading || !addForm.name.trim()) return true;

    if (uploadMode === 'file' && !isEditMode) {
      if (!hasHfToken) return true;
      if (isMultiStageModel) {
        return !(loraFiles.highNoise || loraFiles.lowNoise);
      }
      return !loraFiles.single;
    }

    if (isMultiStageModel) {
      return !(
        (addForm.high_noise_url.trim() && validateHuggingFaceUrl(addForm.high_noise_url).isValid) ||
        (addForm.low_noise_url.trim() && validateHuggingFaceUrl(addForm.low_noise_url).isValid)
      );
    }

    return !validateHuggingFaceUrl(addForm.huggingface_url).isValid;
  };

  return (
    <div className="space-y-4">
      {isEditMode && (
        <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Editing: {editingLora?.metadata.Name}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onClearEdit();
              resetForm();
            }}
          >
            Cancel Edit
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isEditMode ? 'Edit LoRA' : 'Add a New LoRA'}</CardTitle>
          <CardDescription>
            {isEditMode ? 'Update your LoRA details.' : 'Create and save a new LoRA to your collection.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Name and Trigger Word */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="lora-name">Name: *</Label>
              <Input
                id="lora-name"
                placeholder="My Awesome LoRA"
                value={addForm.name}
                onChange={e => handleFormChange('name', e.target.value)}
                maxLength={30}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="lora-trigger-word">Trigger Word:</Label>
              <Input
                id="lora-trigger-word"
                placeholder="e.g., ohwx, sks, xyz style"
                value={addForm.trigger_word}
                onChange={e => handleFormChange('trigger_word', e.target.value)}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label htmlFor="lora-description">Description: (optional)</Label>
            <Textarea
              id="lora-description"
              placeholder="Describe what this LoRA does..."
              value={addForm.description}
              onChange={e => handleFormChange('description', e.target.value)}
              rows={2}
              clearable
              onClear={() => handleFormChange('description', '')}
              voiceInput
              voiceContext="This is a description for a LoRA model. Describe what the LoRA does - what style, character, or effect it adds to AI-generated images or videos. Keep it concise and informative."
              onVoiceResult={(result) => {
                handleFormChange('description', result.prompt || result.transcription);
              }}
            />
          </div>

          {/* Base Model */}
          <div className="space-y-1">
            <Label>Base Model:</Label>
            <div className="flex gap-2">
              <Select
                value={addForm.base_model}
                onValueChange={(value) => handleFormChange('base_model', value)}
              >
                <SelectTrigger variant="retro" className={supportsMultiStage ? "flex-1" : "w-full"}>
                  <SelectValue placeholder="Select Base Model" />
                </SelectTrigger>
                <SelectContent variant="retro">
                  {BASE_MODEL_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} variant="retro" value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {supportsMultiStage && (
                <Select
                  value={loraMode}
                  onValueChange={(value: 'single' | 'multi') => setLoraMode(value)}
                >
                  <SelectTrigger variant="retro" className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent variant="retro">
                    <SelectItem variant="retro" value="single">Single LoRA</SelectItem>
                    <SelectItem variant="retro" value="multi">High + Low Noise</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Upload Mode Toggle */}
          {!isEditMode && (
            <div className="space-y-2">
              <Label>How do you want to add this LoRA?</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={uploadMode === 'url' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setUploadMode('url');
                    setLoraFiles({});
                    resetProgress();
                  }}
                  className="flex items-center gap-2"
                >
                  <Link className="h-4 w-4" />
                  Paste URL
                </Button>
                <Button
                  type="button"
                  variant={uploadMode === 'file' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setUploadMode('file');
                    handleFormChange('huggingface_url', '');
                    handleFormChange('high_noise_url', '');
                    handleFormChange('low_noise_url', '');
                  }}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Upload File
                </Button>
              </div>
            </div>
          )}

          {/* URL or File Input Section */}
          {uploadMode === 'url' || isEditMode ? (
            <UrlInputSection
              addForm={addForm}
              handleFormChange={handleFormChange}
              isMultiStageModel={isMultiStageModel}
            />
          ) : (
            <FileUploadSection
              isLoadingHfToken={isLoadingHfToken}
              hasHfToken={hasHfToken}
              isMultiStageModel={isMultiStageModel}
              loraFiles={loraFiles}
              setLoraFiles={setLoraFiles}
              uploadProgress={uploadProgress}
            />
          )}

          {/* Created By */}
          <div className="space-y-1">
            <Label>Created By:</Label>
            <div className="flex items-center space-x-2 mb-2">
              <Checkbox
                id="created-by-you"
                checked={addForm.created_by_is_you}
                onCheckedChange={(checked) => handleFormChange('created_by_is_you', checked)}
              />
              <Label htmlFor="created-by-you" className="font-normal">This is my creation</Label>
            </div>
            {!addForm.created_by_is_you && (
              <Input
                placeholder="Creator's username"
                value={addForm.created_by_username}
                onChange={e => handleFormChange('created_by_username', e.target.value)}
                maxLength={30}
              />
            )}
          </div>

          {/* Sample Generations */}
          <SampleGenerationsSection
            isEditMode={isEditMode}
            editingLora={editingLora}
            deletedExistingSampleUrls={deletedExistingSampleUrls}
            setDeletedExistingSampleUrls={setDeletedExistingSampleUrls}
            sampleFiles={sampleFiles}
            setSampleFiles={setSampleFiles}
            previewUrls={previewUrls}
            mainGenerationIndex={mainGenerationIndex}
            setMainGenerationIndex={setMainGenerationIndex}
            fileInputKey={fileInputKey}
            setFileInputKey={setFileInputKey}
          />

          {/* Public Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is-public"
              checked={addForm.is_public}
              onCheckedChange={(checked) => handleFormChange('is_public', checked)}
            />
            <Label htmlFor="is-public">Available to others</Label>
          </div>
        </CardContent>
        <ItemCardFooter>
          <Button
            onClick={handleAddLoraFromForm}
            disabled={isButtonDisabled()}
          >
            {isUploading
              ? 'Uploading to HuggingFace...'
              : isSubmitting
                ? (isEditMode ? 'Saving Changes...' : 'Adding LoRA...')
                : (isEditMode ? 'Save Changes' : (uploadMode === 'file' && !isEditMode ? 'Upload & Add LoRA' : 'Add LoRA'))
            }
          </Button>
        </ItemCardFooter>
      </Card>
    </div>
  );
};

// Sub-components for cleaner organization

interface UrlInputSectionProps {
  addForm: LoraFormState;
  handleFormChange: (field: string, value: any) => void;
  isMultiStageModel: boolean;
}

const UrlInputSection: React.FC<UrlInputSectionProps> = ({ addForm, handleFormChange, isMultiStageModel }) => {
  if (isMultiStageModel) {
    return (
      <div className="space-y-3">
        <div className="space-y-1">
          <TooltipProvider>
            <div className="flex items-center gap-2">
              <Label htmlFor="lora-high-noise-url">High Noise LoRA URL: *</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  <div className="text-xs space-y-1">
                    <p><strong>High Noise LoRA:</strong> Applied during early generation phases (high noise levels).</p>
                    <p>This is typically the <code>high_noise_model.safetensors</code> file.</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
          <Input
            id="lora-high-noise-url"
            placeholder="https://huggingface.co/.../high_noise_model.safetensors"
            value={addForm.high_noise_url}
            onChange={e => handleFormChange('high_noise_url', e.target.value)}
            className={!validateHuggingFaceUrl(addForm.high_noise_url).isValid && addForm.high_noise_url ? 'border-red-500' : ''}
          />
          {!validateHuggingFaceUrl(addForm.high_noise_url).isValid && addForm.high_noise_url && (
            <p className="text-xs text-red-600">
              {validateHuggingFaceUrl(addForm.high_noise_url).message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <TooltipProvider>
            <div className="flex items-center gap-2">
              <Label htmlFor="lora-low-noise-url">Low Noise LoRA URL: *</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  <div className="text-xs space-y-1">
                    <p><strong>Low Noise LoRA:</strong> Applied during the final generation phase (low noise level).</p>
                    <p>This is typically the <code>low_noise_model.safetensors</code> file.</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
          <Input
            id="lora-low-noise-url"
            placeholder="https://huggingface.co/.../low_noise_model.safetensors"
            value={addForm.low_noise_url}
            onChange={e => handleFormChange('low_noise_url', e.target.value)}
            className={!validateHuggingFaceUrl(addForm.low_noise_url).isValid && addForm.low_noise_url ? 'border-red-500' : ''}
          />
          {!validateHuggingFaceUrl(addForm.low_noise_url).isValid && addForm.low_noise_url && (
            <p className="text-xs text-red-600">
              {validateHuggingFaceUrl(addForm.low_noise_url).message}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <TooltipProvider>
        <div className="flex items-center gap-2">
          <Label htmlFor="lora-url">HuggingFace Direct Download URL: *</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
                <Info className="h-4 w-4" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-md">
              <div className="text-xs space-y-1">
                <p><strong>How to get the correct URL:</strong></p>
                <ol className="list-decimal list-inside space-y-1 pl-2">
                  <li>Go to the HuggingFace model page</li>
                  <li>Click on "Files" tab</li>
                  <li>Find the .safetensors file you want</li>
                  <li>Right-click the download button and copy link</li>
                  <li>The URL should contain "/resolve/" and end with the filename</li>
                </ol>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      <Input
        id="lora-url"
        placeholder="https://huggingface.co/username/model/resolve/main/filename.safetensors"
        value={addForm.huggingface_url}
        onChange={e => handleFormChange('huggingface_url', e.target.value)}
        className={!validateHuggingFaceUrl(addForm.huggingface_url).isValid && addForm.huggingface_url ? 'border-red-500' : ''}
      />
      {!validateHuggingFaceUrl(addForm.huggingface_url).isValid && addForm.huggingface_url && (
        <p className="text-xs text-red-600">
          {validateHuggingFaceUrl(addForm.huggingface_url).message}
        </p>
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

const FileUploadSection: React.FC<FileUploadSectionProps> = ({
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

interface FileDropZoneProps {
  id: string;
  label: string;
  tooltipContent: React.ReactNode;
  file?: File;
  onFileChange: (file: File) => void;
  onClear: () => void;
  placeholder: string;
}

const FileDropZone: React.FC<FileDropZoneProps> = ({
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
          const f = e.target.files?.[0];
          if (f) onFileChange(f);
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

interface SampleGenerationsSectionProps {
  isEditMode: boolean;
  editingLora: any;
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

const SampleGenerationsSection: React.FC<SampleGenerationsSectionProps> = ({
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
          Existing Samples: ({editingLora.metadata.sample_generations.filter((s: any) => !deletedExistingSampleUrls.includes(s.url)).length})
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {editingLora.metadata.sample_generations
            .filter((sample: any) => !deletedExistingSampleUrls.includes(sample.url))
            .map((sample: any, index: number) => {
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
