import { useState } from 'react';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import {
  operationFailure,
  operationSuccess,
  type OperationResult,
} from '@/shared/lib/operationResult';

interface LoraDetails {
  name: string;
  description?: string;
  baseModel: string;
  triggerWord?: string;
  creatorName?: string;
}

/**
 * LoRA files structure supporting both single-stage and multi-stage uploads
 */
export interface LoraFiles {
  single?: File;
  highNoise?: File;
  lowNoise?: File;
}

interface UploadProgress {
  stage:
    | 'idle'
    | 'uploading-lora'
    | 'uploading-high-noise'
    | 'uploading-low-noise'
    | 'uploading-samples'
    | 'processing'
    | 'complete'
    | 'error';
  message: string;
  progress?: number;
}

export interface HuggingFaceUploadSuccess {
  repoId?: string;
  repoUrl?: string;
  loraUrl?: string;
  highNoiseUrl?: string;
  lowNoiseUrl?: string;
  videoUrls?: string[];
}

type UploadResult = OperationResult<HuggingFaceUploadSuccess>;

interface TempStoragePaths {
  single?: string;
  highNoise?: string;
  lowNoise?: string;
}

interface SampleVideoMeta {
  storagePath: string;
  originalFileName: string;
}

interface HuggingFaceUploadResponse {
  success: boolean;
  error?: string;
  repoId?: string;
  repoUrl?: string;
  loraUrl?: string;
  highNoiseUrl?: string;
  lowNoiseUrl?: string;
  videoUrls?: string[];
}

function uploadStages(): UploadProgress['stage'][] {
  return [
    'uploading-lora',
    'uploading-high-noise',
    'uploading-low-noise',
    'uploading-samples',
    'processing',
  ];
}

async function uploadLoraFilesToTempStorage(input: {
  loraFiles: LoraFiles;
  userId: string;
  setUploadProgress: (progress: UploadProgress) => void;
  uploadToTempStorage: (file: File, userId: string) => Promise<string>;
}): Promise<TempStoragePaths | null> {
  const { loraFiles, userId, setUploadProgress, uploadToTempStorage } = input;
  const isMultiStage = !!(loraFiles.highNoise || loraFiles.lowNoise);
  const storagePaths: TempStoragePaths = {};

  if (isMultiStage) {
    if (loraFiles.highNoise) {
      setUploadProgress({
        stage: 'uploading-high-noise',
        message: 'Uploading high noise LoRA file...',
        progress: 10,
      });
      storagePaths.highNoise = await uploadToTempStorage(loraFiles.highNoise, userId);
    }

    if (loraFiles.lowNoise) {
      setUploadProgress({
        stage: 'uploading-low-noise',
        message: 'Uploading low noise LoRA file...',
        progress: loraFiles.highNoise ? 20 : 10,
      });
      storagePaths.lowNoise = await uploadToTempStorage(loraFiles.lowNoise, userId);
    }

    return storagePaths;
  }

  if (loraFiles.single) {
    setUploadProgress({
      stage: 'uploading-lora',
      message: 'Uploading LoRA file...',
      progress: 10,
    });
    storagePaths.single = await uploadToTempStorage(loraFiles.single, userId);
    return storagePaths;
  }

  return null;
}

async function uploadSampleVideosToTempStorage(input: {
  sampleVideos: File[];
  userId: string;
  setUploadProgress: (progress: UploadProgress) => void;
  uploadToTempStorage: (file: File, userId: string) => Promise<string>;
}): Promise<SampleVideoMeta[]> {
  const { sampleVideos, userId, setUploadProgress, uploadToTempStorage } = input;
  const sampleVideoMeta: SampleVideoMeta[] = [];

  if (sampleVideos.length === 0) {
    return sampleVideoMeta;
  }

  setUploadProgress({
    stage: 'uploading-samples',
    message: `Uploading sample videos (0/${sampleVideos.length})...`,
    progress: 30,
  });

  for (let i = 0; i < sampleVideos.length; i++) {
    const video = sampleVideos[i];
    setUploadProgress({
      stage: 'uploading-samples',
      message: `Uploading sample videos (${i + 1}/${sampleVideos.length})...`,
      progress: 30 + (i / sampleVideos.length) * 20,
    });

    const storagePath = await uploadToTempStorage(video, userId);
    sampleVideoMeta.push({
      storagePath,
      originalFileName: video.name,
    });
  }

  return sampleVideoMeta;
}

async function invokeHuggingFaceUpload(input: {
  storagePaths: TempStoragePaths;
  loraDetails: LoraDetails;
  sampleVideoMeta: SampleVideoMeta[];
  options: { isPrivate?: boolean; repoName?: string };
}): Promise<HuggingFaceUploadResponse> {
  const formData = new FormData();
  formData.append('loraStoragePaths', JSON.stringify(input.storagePaths));
  formData.append('loraDetails', JSON.stringify(input.loraDetails));
  formData.append('sampleVideos', JSON.stringify(input.sampleVideoMeta));

  if (input.options.isPrivate !== undefined) {
    formData.append('isPrivate', String(input.options.isPrivate));
  }
  if (input.options.repoName) {
    formData.append('repoName', input.options.repoName);
  }

  const { data, error } = await supabase().functions.invoke('huggingface-upload', {
    body: formData,
  });

  if (error) {
    throw new Error(error.message || 'Edge function error');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Upload failed');
  }

  return data;
}

function mapUploadSuccess(data: HuggingFaceUploadResponse): HuggingFaceUploadSuccess {
  return {
    repoId: data.repoId,
    repoUrl: data.repoUrl,
    loraUrl: data.loraUrl,
    highNoiseUrl: data.highNoiseUrl,
    lowNoiseUrl: data.lowNoiseUrl,
    videoUrls: data.videoUrls,
  };
}

/**
 * Hook to handle uploading LoRA files to HuggingFace via our Edge Function
 */
export function useHuggingFaceUpload() {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    stage: 'idle',
    message: '',
  });

  /**
   * Upload a file to the temporary storage bucket
   */
  const uploadToTempStorage = async (file: File, userId: string): Promise<string> => {
    const fileName = `${crypto.randomUUID()}-${file.name}`;
    const filePath = `${userId}/${fileName}`;
    const { error } = await supabase().storage
      .from('temporary')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload file: ${error.message}`);
    }

    return filePath;
  };

  /**
   * Upload LoRA file(s) and optionally sample videos to HuggingFace.
   * Supports both single-stage (one file) and multi-stage (high_noise + low_noise) LoRAs.
   */
  const uploadToHuggingFace = async (
    loraFiles: LoraFiles,
    loraDetails: LoraDetails,
    sampleVideos: File[] = [],
    options: {
      isPrivate?: boolean;
      repoName?: string;
    } = {}
  ): Promise<UploadResult> => {
    try {
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) {
        return operationFailure(new Error('Not authenticated'), {
          errorCode: 'huggingface_upload_not_authenticated',
          recoverable: false,
          policy: 'fail_closed',
        });
      }

      const storagePaths = await uploadLoraFilesToTempStorage({
        loraFiles,
        userId: user.id,
        setUploadProgress,
        uploadToTempStorage,
      });

      if (!storagePaths) {
        return operationFailure(new Error('No LoRA file provided'), {
          errorCode: 'huggingface_upload_missing_file',
          recoverable: false,
          policy: 'fail_closed',
        });
      }

      const sampleVideoMeta = await uploadSampleVideosToTempStorage({
        sampleVideos,
        userId: user.id,
        setUploadProgress,
        uploadToTempStorage,
      });

      setUploadProgress({
        stage: 'processing',
        message: 'Uploading to HuggingFace...',
        progress: 60,
      });

      const response = await invokeHuggingFaceUpload({
        storagePaths,
        loraDetails,
        sampleVideoMeta,
        options,
      });

      setUploadProgress({
        stage: 'complete',
        message: 'Upload complete!',
        progress: 100,
      });

      return operationSuccess(mapUploadSuccess(response));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setUploadProgress({
        stage: 'error',
        message: errorMessage,
      });
      return operationFailure(err, {
        errorCode: 'huggingface_upload_failed',
        message: errorMessage,
      });
    }
  };

  const resetProgress = () => {
    setUploadProgress({ stage: 'idle', message: '' });
  };

  return {
    uploadToHuggingFace,
    uploadProgress,
    resetProgress,
    isUploading: uploadStages().includes(uploadProgress.stage),
  };
}
