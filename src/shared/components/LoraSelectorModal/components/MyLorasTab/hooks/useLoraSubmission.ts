import { toast } from '@/shared/components/ui/sonner';
import { UseMutationResult } from '@tanstack/react-query';
import { handleError } from '@/shared/lib/errorHandler';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';

import type { Resource, CreateResourceArgs, UpdateResourceArgs } from '@/shared/hooks/useResources';
import type { LoraFiles } from '@/shared/hooks/useHuggingFaceUpload';
import { LoraModel, LoraFormState } from '../../../types';
import { validateHuggingFaceUrl, generateUniqueFilename } from '../../../utils/validation-utils';

interface UseLoraSubmissionArgs {
  addForm: LoraFormState;
  isEditMode: boolean;
  editingLora?: (Resource & { metadata: LoraModel }) | null;
  isMultiStageModel: boolean;
  uploadMode: 'url' | 'file';
  loraFiles: LoraFiles;
  sampleFiles: File[];
  deletedExistingSampleUrls: string[];
  mainGenerationIndex: number;
  userName: string;
  hasHfToken: boolean;
  isSubmitting: boolean;
  isUploading: boolean;
  setIsSubmitting: (v: boolean) => void;
  uploadToHuggingFace: (
    files: LoraFiles,
    details: { name: string; description?: string; baseModel: string; triggerWord?: string; creatorName?: string },
    sampleVideos: File[],
    options?: { isPrivate?: boolean }
  ) => Promise<{
    success: boolean;
    error?: string;
    repoUrl?: string;
    loraUrl?: string;
    highNoiseUrl?: string;
    lowNoiseUrl?: string;
  }>;
  createResource: UseMutationResult<Resource, Error, CreateResourceArgs, unknown>;
  updateResource: UseMutationResult<Resource, Error, UpdateResourceArgs, unknown>;
  onClearEdit: () => void;
  onSwitchToBrowse: () => void;
  resetForm: () => void;
  getExistingFilenames: () => string[];
}

export function useLoraSubmission({
  addForm,
  isEditMode,
  editingLora,
  isMultiStageModel,
  uploadMode,
  loraFiles,
  sampleFiles,
  deletedExistingSampleUrls,
  mainGenerationIndex,
  userName,
  hasHfToken,
  isSubmitting,
  isUploading,
  setIsSubmitting,
  uploadToHuggingFace,
  createResource,
  updateResource,
  onClearEdit,
  onSwitchToBrowse,
  resetForm,
  getExistingFilenames,
}: UseLoraSubmissionArgs) {

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
          metadata: loraMetadata,
        });
        onClearEdit();
      } else {
        await createResource.mutateAsync({ type: 'lora', metadata: loraMetadata });
      }

      resetForm();
      onSwitchToBrowse();
    } catch (error) {
      handleError(error, { context: 'MyLorasTab', toastTitle: `Failed to ${isEditMode ? 'update' : 'add'} LoRA` });
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

  return {
    handleAddLoraFromForm,
    isButtonDisabled,
  };
}
