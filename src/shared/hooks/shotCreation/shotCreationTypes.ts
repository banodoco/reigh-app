import type { Shot, GenerationRow } from '@/domains/generation/types';
import type { Dispatch, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';

export interface ShotCreationResult {
  shotId: string;
  shotName: string;
  shot?: Shot;
  generationIds?: string[];
}

export interface CreateShotOptions {
  name?: string;
  generationId?: string;
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

interface AtomicCreateResult {
  shotId: string;
  shotName: string;
  shotGenerationId: string;
}

interface CreateShotMutationResult {
  shot?: Shot;
}

interface ExternalDropResult {
  shotId: string;
  generationIds?: string[];
}

export interface CreateShotWithGenerationPathInput {
  selectedProjectId: string;
  shotName: string;
  generationId: string;
  generationPreview?: GenerationPreviewInput;
  shots: Shot[] | undefined;
  queryClient: QueryClient;
  createShotWithImage: (input: {
    projectId: string;
    shotName: string;
    generationId: string;
  }) => Promise<AtomicCreateResult>;
}

export interface CreateShotWithFilesPathInput {
  selectedProjectId: string;
  shotName: string;
  files: File[];
  aspectRatio?: string;
  shots: Shot[] | undefined;
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
  createShotWithImageMutation: CreateShotWithGenerationPathInput['createShotWithImage'];
  handleExternalImageDropMutation: CreateShotWithFilesPathInput['uploadToShot'];
}

type ShotGenerationPreview = GenerationPreviewInput;
type ShotGenerationRow = GenerationRow;
