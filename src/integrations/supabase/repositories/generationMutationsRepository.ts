import { getSupabaseClient } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/jsonTypes';
import type { PersistedGenerationParams } from '@/domains/generation/types/generationParams';
import { VARIANT_TYPE } from '@/shared/constants/variantTypes';

interface ProjectScopedGenerationInput {
  id: string;
  projectId: string;
}

interface GenerationScopedVariantInput {
  id: string;
  generationId: string;
}

export interface ExternalUploadGenerationParams extends PersistedGenerationParams {
  prompt: string;
  extra: {
    source: 'external_upload';
    original_filename: string;
    file_type: string;
    file_size: number;
  };
}

interface CreateGenerationRecordInput {
  imageUrl: string;
  thumbnailUrl: string;
  fileType: string;
  projectId: string;
  generationParams: ExternalUploadGenerationParams;
}

interface CreatePrimaryVariantInput {
  generationId: string;
  imageUrl: string;
  thumbnailUrl: string;
  generationParams: ExternalUploadGenerationParams;
  variantType: typeof VARIANT_TYPE[keyof typeof VARIANT_TYPE];
}

export function updateGenerationLocationInProject(
  params: ProjectScopedGenerationInput & { location: string; thumbnailUrl?: string },
) {
  return getSupabaseClient()
    .from('generations')
    .update({
      location: params.location,
      ...(params.thumbnailUrl ? { thumbnail_url: params.thumbnailUrl } : {}),
    })
    .eq('id', params.id)
    .eq('project_id', params.projectId)
    .select('id');
}

export function createGenerationRecord(params: CreateGenerationRecordInput) {
  return getSupabaseClient()
    .from('generations')
    .insert({
      location: params.imageUrl,
      thumbnail_url: params.thumbnailUrl,
      type: params.fileType,
      project_id: params.projectId,
      params: params.generationParams as unknown as Json,
    })
    .select()
    .single();
}

export function createGenerationPrimaryVariant(params: CreatePrimaryVariantInput) {
  return getSupabaseClient()
    .from('generation_variants')
    .insert({
      generation_id: params.generationId,
      location: params.imageUrl,
      thumbnail_url: params.thumbnailUrl,
      is_primary: true,
      variant_type: params.variantType,
      name: 'Original',
      params: params.generationParams as unknown as Json,
    });
}

export function updateGenerationStarInProject(
  params: ProjectScopedGenerationInput & { starred: boolean },
) {
  return getSupabaseClient()
    .from('generations')
    .update({ starred: params.starred })
    .eq('id', params.id)
    .eq('project_id', params.projectId)
    .select('id, starred');
}

export function deleteGenerationInProject(params: ProjectScopedGenerationInput) {
  return getSupabaseClient()
    .from('generations')
    .delete()
    .eq('id', params.id)
    .eq('project_id', params.projectId)
    .select('id');
}

export function deleteVariantInGeneration(params: GenerationScopedVariantInput) {
  return getSupabaseClient()
    .from('generation_variants')
    .delete()
    .eq('id', params.id)
    .eq('generation_id', params.generationId)
    .select('id');
}
