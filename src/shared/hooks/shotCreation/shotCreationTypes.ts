import type { Shot } from '@/domains/generation/types';
import type { Dispatch, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { UploadedGenerationMetadata } from '@/shared/hooks/shots/externalImageDrop';

export interface ShotCreationResult {
  shotId: string;
  shotName: string;
  shot?: Shot;
  generationIds?: string[];
}

export interface CreateShotOptions {
  name?: string;
  generationId?: string;
  generationIds?: string[];
  generationPreview?: {
    imageUrl?: string;
    thumbUrl?: string;
    type?: string | null;
    location?: string | null;
  };
  files?: File[];
  aspectRatio?: string;
  inheritSettings?: boolean;
  updateLastAffected?: boolean;
  dispatchSkeletonEvents?: boolean;
  switchToNewestSort?: boolean;
  onProgress?: (fileIndex: number, fileProgress: number, overallProgress: number) => void;
  onSuccess?: (result: ShotCreationResult) => void;
}

export interface UseShotCreationReturn {
  createShot: (options?: CreateShotOptions) => Promise<ShotCreationResult | null>;
  isCreating: boolean;
  lastCreatedShot: { id: string; name: string } | null;
  clearLastCreated: () => void;
}

export interface GenerationPreviewInput {
  imageUrl?: string;
  thumbUrl?: string;
  type?: string | null;
  location?: string | null;
}

interface CreateShotMutationResult {
  shot?: Shot;
}

interface ExternalDropResult {
  shotId: string;
  generationIds?: string[];
  generationMetadata?: UploadedGenerationMetadata[];
}

export interface CreateShotWithGenerationsRpcShotGeneration {
  id: string;
  generation_id: string;
  timeline_frame: number;
  location: string | null;
  thumbnail_url: string | null;
  type: string | null;
  created_at: string;
  starred: boolean | null;
  name: string | null;
  based_on: string | null;
  params: unknown;
  primary_variant_id: string | null;
}

export interface CreateShotWithGenerationsRpcResult {
  shot_id: string;
  shot_name: string;
  shot_position: number;
  shot_generations: CreateShotWithGenerationsRpcShotGeneration[];
  success: boolean;
}

export interface CreateShotWithGenerationPathInput {
  selectedProjectId: string;
  shotName: string;
  generationId: string;
  queryClient: QueryClient;
  createShotWithGenerations: (input: {
    projectId: string;
    shotName: string;
    generationIds: string[];
  }) => Promise<CreateShotWithGenerationsRpcResult>;
}

export interface CreateShotWithGenerationsPathInput {
  selectedProjectId: string;
  shotName: string;
  generationIds: string[];
  queryClient: QueryClient;
  createShotWithGenerations: (input: {
    projectId: string;
    shotName: string;
    generationIds: string[];
  }) => Promise<CreateShotWithGenerationsRpcResult>;
}

export interface CreateShotWithFilesPathInput {
  selectedProjectId: string;
  shotName: string;
  files: File[];
  aspectRatio?: string;
  shots: Shot[] | undefined;
  queryClient: QueryClient;
  onProgress?: (fileIndex: number, fileProgress: number, overallProgress: number) => void;
  createShot: (input: {
    name: string;
    projectId: string;
    aspectRatio?: string;
    shouldSelectAfterCreation: boolean;
  }) => Promise<CreateShotMutationResult>;
  uploadToShot: (input: {
    imageFiles: File[];
    targetShotId: string | null;
    currentProjectQueryKey: string;
    currentShotCount: number;
    onProgress?: (fileIndex: number, fileProgress: number, overallProgress: number) => void;
  }) => Promise<ExternalDropResult | null>;
}

export interface CreateEmptyShotPathInput {
  selectedProjectId: string;
  shotName: string;
  aspectRatio?: string;
  createShot: (input: {
    name: string;
    projectId: string;
    aspectRatio?: string;
    shouldSelectAfterCreation: boolean;
  }) => Promise<CreateShotMutationResult>;
}

export interface PostCreationEffectsInput {
  result: ShotCreationResult;
  options: CreateShotOptions;
  selectedProjectId: string | null;
  shots: Shot[] | undefined;
  setLastAffectedShotId: (shotId: string) => void;
  setLastCreatedShot: Dispatch<SetStateAction<{ id: string; name: string } | null>>;
}

export interface CreateShotActionInput {
  selectedProjectId: string | null;
  shots: Shot[] | undefined;
  queryClient: QueryClient;
  setIsCreating: Dispatch<SetStateAction<boolean>>;
  generateShotName: () => string;
  applyPostCreationEffects: (result: ShotCreationResult, options: CreateShotOptions) => void;
  createShotMutation: CreateShotWithFilesPathInput['createShot'];
  createShotWithGenerationsMutation: CreateShotWithGenerationsPathInput['createShotWithGenerations'];
  handleExternalImageDropMutation: CreateShotWithFilesPathInput['uploadToShot'];
}
