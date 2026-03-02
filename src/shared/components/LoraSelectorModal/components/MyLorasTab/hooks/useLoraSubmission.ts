import type { UseMutationResult } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { uploadImageToStorage } from '@/shared/lib/media/imageUploader';
import type { Resource, CreateResourceArgs, UpdateResourceArgs } from '@/shared/hooks/useResources';
import type { LoraFiles } from '@/features/lora/hooks/useHuggingFaceUpload';
import { type LoraFormState, type LoraModel } from '../../../types';
import { generateUniqueLoraFilename, validateHuggingFaceUrl } from '../../../utils/validation-utils';

type EditableLora = Resource & { metadata: LoraModel };

interface UseLoraSubmissionArgs {
  addForm: LoraFormState;
  isEditMode: boolean;
  editingLora?: EditableLora | null;
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

interface SubmissionMode {
  isSingleStageFileMode: boolean;
  isMultiStageFileMode: boolean;
  isMultiStageUrlMode: boolean;
  isSingleStageUrlMode: boolean;
}

interface SubmissionUrls {
  finalHuggingfaceUrl: string;
  finalHighNoiseUrl: string;
  finalLowNoiseUrl: string;
}

interface UploadedSample {
  url: string;
  type: 'image' | 'video';
  alt_text?: string;
}

function getSubmissionMode(
  uploadMode: 'url' | 'file',
  isMultiStageModel: boolean,
  isEditMode: boolean
): SubmissionMode {
  return {
    isSingleStageFileMode: uploadMode === 'file' && !isMultiStageModel && !isEditMode,
    isMultiStageFileMode: uploadMode === 'file' && isMultiStageModel && !isEditMode,
    isMultiStageUrlMode: (uploadMode === 'url' || isEditMode) && isMultiStageModel,
    isSingleStageUrlMode: (uploadMode === 'url' || isEditMode) && !isMultiStageModel,
  };
}

function getCreatorName(addForm: LoraFormState, userName: string): string {
  return addForm.created_by_is_you ? (userName || 'You') : addForm.created_by_username;
}

function getSampleVideos(sampleFiles: File[]): File[] {
  return sampleFiles.filter((file) => file.type.startsWith('video/'));
}

function getValidationError(addForm: LoraFormState, loraFiles: LoraFiles, mode: SubmissionMode): string | null {
  if (!addForm.name.trim()) {
    return 'Name is required';
  }

  if (mode.isSingleStageFileMode && !loraFiles.single) {
    return 'Please select a LoRA file to upload';
  }

  if (mode.isMultiStageFileMode && !loraFiles.highNoise && !loraFiles.lowNoise) {
    return 'Please select at least one LoRA file (High Noise or Low Noise)';
  }

  if (mode.isMultiStageUrlMode) {
    const hasHighNoise = addForm.high_noise_url.trim().length > 0;
    const hasLowNoise = addForm.low_noise_url.trim().length > 0;

    if (!hasHighNoise && !hasLowNoise) {
      return 'Please provide at least one LoRA URL (High Noise or Low Noise)';
    }

    if (hasHighNoise) {
      const highNoiseValidation = validateHuggingFaceUrl(addForm.high_noise_url);
      if (!highNoiseValidation.isValid) {
        return `Invalid High Noise URL: ${highNoiseValidation.message}`;
      }
    }

    if (hasLowNoise) {
      const lowNoiseValidation = validateHuggingFaceUrl(addForm.low_noise_url);
      if (!lowNoiseValidation.isValid) {
        return `Invalid Low Noise URL: ${lowNoiseValidation.message}`;
      }
    }
  }

  if (mode.isSingleStageUrlMode) {
    const urlValidation = validateHuggingFaceUrl(addForm.huggingface_url);
    if (!urlValidation.isValid) {
      return `Invalid HuggingFace URL: ${urlValidation.message}`;
    }
  }

  return null;
}

function uploadToHuggingFaceIfNeeded(
  mode: SubmissionMode,
  input: {
    addForm: LoraFormState;
    userName: string;
    loraFiles: LoraFiles;
    sampleFiles: File[];
    uploadToHuggingFace: UseLoraSubmissionArgs['uploadToHuggingFace'];
    urls: SubmissionUrls;
  }
): Promise<SubmissionUrls> {
  const uploadDetails = {
    name: input.addForm.name,
    description: input.addForm.description,
    baseModel: input.addForm.base_model,
    triggerWord: input.addForm.trigger_word,
    creatorName: getCreatorName(input.addForm, input.userName),
  };

  if (mode.isSingleStageFileMode && input.loraFiles.single) {
    return input.uploadToHuggingFace(
      input.loraFiles,
      uploadDetails,
      getSampleVideos(input.sampleFiles),
      { isPrivate: !input.addForm.is_public }
    ).then((uploadResult) => {
      if (!uploadResult.success) {
        throw new Error(`Failed to upload to HuggingFace: ${uploadResult.error || 'Unknown error'}`);
      }

      toast.success(`Uploaded to HuggingFace: ${uploadResult.repoUrl}`);
      return {
        ...input.urls,
        finalHuggingfaceUrl: uploadResult.loraUrl || input.urls.finalHuggingfaceUrl,
      };
    });
  }

  if (mode.isMultiStageFileMode && (input.loraFiles.highNoise || input.loraFiles.lowNoise)) {
    return input.uploadToHuggingFace(
      input.loraFiles,
      uploadDetails,
      getSampleVideos(input.sampleFiles),
      { isPrivate: !input.addForm.is_public }
    ).then((uploadResult) => {
      if (!uploadResult.success) {
        throw new Error(`Failed to upload to HuggingFace: ${uploadResult.error || 'Unknown error'}`);
      }

      toast.success(`Uploaded to HuggingFace: ${uploadResult.repoUrl}`);
      return {
        ...input.urls,
        finalHighNoiseUrl: uploadResult.highNoiseUrl || input.urls.finalHighNoiseUrl,
        finalLowNoiseUrl: uploadResult.lowNoiseUrl || input.urls.finalLowNoiseUrl,
      };
    });
  }

  return Promise.resolve(input.urls);
}

async function uploadSampleFiles(sampleFiles: File[]): Promise<UploadedSample[]> {
  const uploadedSamples: UploadedSample[] = [];

  for (const file of sampleFiles) {
    const uploadedUrl = await uploadImageToStorage(file);
    uploadedSamples.push({
      url: uploadedUrl,
      type: file.type.startsWith('video/') ? 'video' : 'image',
      alt_text: file.name,
    });
  }

  return uploadedSamples;
}

function buildFinalSamplesAndImages(input: {
  isEditMode: boolean;
  editingLora?: EditableLora | null;
  deletedExistingSampleUrls: string[];
  uploadedSamples: UploadedSample[];
}) {
  const existingSamples = input.isEditMode
    ? (input.editingLora?.metadata.sample_generations || []).filter(
        (sample) => !input.deletedExistingSampleUrls.includes(sample.url)
      )
    : [];

  const existingImages = input.isEditMode
    ? (input.editingLora?.metadata.Images || [])
        .filter((image) => !input.deletedExistingSampleUrls.includes(image.url))
        .map((image) => ({
          url: image.url,
          alt_text: image.alt_text || '',
          type: image.type?.startsWith('video') ? ('video' as const) : ('image' as const),
        }))
    : [];

  const finalSamples = [...existingSamples, ...input.uploadedSamples];
  const finalImages = [
    ...existingImages,
    ...input.uploadedSamples.map((sample) => ({
      url: sample.url,
      alt_text: sample.alt_text || '',
      type: sample.type,
    })),
  ];

  return { finalSamples, finalImages };
}

function resolveMainGeneration(input: {
  uploadedSamples: UploadedSample[];
  mainGenerationIndex: number;
  isEditMode: boolean;
  editingLora?: EditableLora | null;
  deletedExistingSampleUrls: string[];
  finalSamples: UploadedSample[];
}): string | undefined {
  if (input.uploadedSamples.length > 0 && input.uploadedSamples[input.mainGenerationIndex]) {
    return input.uploadedSamples[input.mainGenerationIndex].url;
  }

  if (
    input.isEditMode &&
    input.editingLora?.metadata.main_generation &&
    !input.deletedExistingSampleUrls.includes(input.editingLora.metadata.main_generation)
  ) {
    return input.editingLora.metadata.main_generation;
  }

  return input.finalSamples.length > 0 ? input.finalSamples[0].url : undefined;
}

function resolveUniqueFilename(input: {
  isEditMode: boolean;
  editingLora?: EditableLora | null;
  addForm: LoraFormState;
  finalHuggingfaceUrl: string;
  existingFilenames: string[];
}): string {
  if (input.isEditMode) {
    return (
      input.editingLora?.metadata['Model ID'] ||
      input.editingLora?.metadata.filename ||
      generateUniqueLoraFilename(
        input.addForm.name,
        input.addForm.base_model,
        input.finalHuggingfaceUrl,
        input.existingFilenames
      )
    );
  }

  return generateUniqueLoraFilename(
    input.addForm.name,
    input.addForm.base_model,
    input.finalHuggingfaceUrl,
    input.existingFilenames
  );
}

function buildLoraMetadata(input: {
  addForm: LoraFormState;
  userName: string;
  uniqueFilename: string;
  isMultiStageModel: boolean;
  finalHuggingfaceUrl: string;
  finalHighNoiseUrl: string;
  finalLowNoiseUrl: string;
  finalSamples: UploadedSample[];
  finalImages: Array<{ url: string; alt_text: string; type: 'image' | 'video' }>;
  mainGeneration?: string;
}): LoraModel {
  const primaryUrl = input.isMultiStageModel
    ? (input.finalHighNoiseUrl.trim() || input.finalLowNoiseUrl.trim())
    : input.finalHuggingfaceUrl;

  return {
    'Model ID': input.uniqueFilename,
    Name: input.addForm.name,
    Author: input.addForm.created_by_is_you
      ? (input.userName || 'You')
      : (input.addForm.created_by_username || 'Unknown'),
    Description: input.addForm.description || undefined,
    Images: input.finalImages,
    'Model Files': [{ path: input.uniqueFilename, url: primaryUrl }],
    lora_type: 'Wan 2.1 14b',
    created_by: {
      is_you: input.addForm.created_by_is_you,
      username: input.addForm.created_by_is_you ? undefined : input.addForm.created_by_username,
    },
    huggingface_url: input.isMultiStageModel ? undefined : input.finalHuggingfaceUrl,
    filename: input.uniqueFilename,
    base_model: input.addForm.base_model,
    sample_generations: input.finalSamples,
    main_generation: input.mainGeneration,
    is_public: input.addForm.is_public,
    'Last Modified': new Date().toISOString(),
    trigger_word: input.addForm.trigger_word,
    ...(input.isMultiStageModel && input.finalHighNoiseUrl.trim()
      ? { high_noise_url: input.finalHighNoiseUrl.trim() }
      : {}),
    ...(input.isMultiStageModel && input.finalLowNoiseUrl.trim()
      ? { low_noise_url: input.finalLowNoiseUrl.trim() }
      : {}),
  };
}

function isButtonDisabled(args: UseLoraSubmissionArgs): boolean {
  const { isSubmitting, isUploading, addForm, uploadMode, isEditMode, hasHfToken, isMultiStageModel, loraFiles } = args;
  if (isSubmitting || isUploading) {
    return true;
  }

  if (uploadMode === 'file' && !isEditMode && !hasHfToken) {
    return true;
  }

  const mode = getSubmissionMode(uploadMode, isMultiStageModel, isEditMode);
  return getValidationError(addForm, loraFiles, mode) !== null;
}

export function useLoraSubmission(args: UseLoraSubmissionArgs) {
  const handleAddLoraFromForm = async () => {
    const mode = getSubmissionMode(args.uploadMode, args.isMultiStageModel, args.isEditMode);
    const validationError = getValidationError(args.addForm, args.loraFiles, mode);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    args.setIsSubmitting(true);

    try {
      const initialUrls: SubmissionUrls = {
        finalHuggingfaceUrl: args.addForm.huggingface_url,
        finalHighNoiseUrl: args.addForm.high_noise_url,
        finalLowNoiseUrl: args.addForm.low_noise_url,
      };

      const resolvedUrls = await uploadToHuggingFaceIfNeeded(mode, {
        addForm: args.addForm,
        userName: args.userName,
        loraFiles: args.loraFiles,
        sampleFiles: args.sampleFiles,
        uploadToHuggingFace: args.uploadToHuggingFace,
        urls: initialUrls,
      });

      const uploadedSamples = await uploadSampleFiles(args.sampleFiles);
      const { finalSamples, finalImages } = buildFinalSamplesAndImages({
        isEditMode: args.isEditMode,
        editingLora: args.editingLora,
        deletedExistingSampleUrls: args.deletedExistingSampleUrls,
        uploadedSamples,
      });

      const mainGeneration = resolveMainGeneration({
        uploadedSamples,
        mainGenerationIndex: args.mainGenerationIndex,
        isEditMode: args.isEditMode,
        editingLora: args.editingLora,
        deletedExistingSampleUrls: args.deletedExistingSampleUrls,
        finalSamples,
      });

      const uniqueFilename = resolveUniqueFilename({
        isEditMode: args.isEditMode,
        editingLora: args.editingLora,
        addForm: args.addForm,
        finalHuggingfaceUrl: resolvedUrls.finalHuggingfaceUrl,
        existingFilenames: args.getExistingFilenames(),
      });

      const loraMetadata = buildLoraMetadata({
        addForm: args.addForm,
        userName: args.userName,
        uniqueFilename,
        isMultiStageModel: args.isMultiStageModel,
        finalHuggingfaceUrl: resolvedUrls.finalHuggingfaceUrl,
        finalHighNoiseUrl: resolvedUrls.finalHighNoiseUrl,
        finalLowNoiseUrl: resolvedUrls.finalLowNoiseUrl,
        finalSamples,
        finalImages,
        mainGeneration,
      });

      if (args.isEditMode && args.editingLora) {
        await args.updateResource.mutateAsync({
          id: args.editingLora.id,
          type: 'lora',
          metadata: loraMetadata,
        });
        args.onClearEdit();
      } else {
        await args.createResource.mutateAsync({
          type: 'lora',
          metadata: loraMetadata,
        });
      }

      args.resetForm();
      args.onSwitchToBrowse();
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'MyLorasTab',
        toastTitle: `Failed to ${args.isEditMode ? 'update' : 'add'} LoRA`,
      });
    } finally {
      args.setIsSubmitting(false);
    }
  };

  return {
    handleAddLoraFromForm,
    isButtonDisabled: () => isButtonDisabled(args),
  };
}
