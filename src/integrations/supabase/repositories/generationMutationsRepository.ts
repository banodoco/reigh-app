import { getSupabaseClient } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

interface GenerationSettingsInput {
  id: string;
  projectId: string;
}

interface DeleteGenerationVariantInput {
  id: string;
  generationId: string;
}

interface CreateGenerationRecordInput {
  imageUrl: string;
  thumbnailUrl: string;
  fileType: string;
  projectId: string;
  generationParams: Record<string, Json | undefined>;
}

interface CreatePrimaryVariantInput {
  generationId: string;
  imageUrl: string;
  thumbnailUrl: string;
  generationParams: Record<string, Json | undefined>;
  variantType: string;
}

export async function updateGenerationLocationByScope(
  params: GenerationSettingsInput & { location: string; thumbnailUrl?: string },
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

export async function createGenerationRecord(params: CreateGenerationRecordInput) {
  return getSupabaseClient()
    .from('generations')
    .insert({
      location: params.imageUrl,
      thumbnail_url: params.thumbnailUrl,
      type: params.fileType,
      project_id: params.projectId,
      params: params.generationParams,
    })
    .select()
    .single();
}

export async function createGenerationPrimaryVariant(params: CreatePrimaryVariantInput) {
  return getSupabaseClient()
    .from('generation_variants')
    .insert({
      generation_id: params.generationId,
      location: params.imageUrl,
      thumbnail_url: params.thumbnailUrl,
      is_primary: true,
      variant_type: params.variantType,
      name: 'Original',
      params: params.generationParams,
    });
}

export async function updateGenerationStarByScope(
  params: GenerationSettingsInput & { starred: boolean },
) {
  return getSupabaseClient()
    .from('generations')
    .update({ starred: params.starred })
    .eq('id', params.id)
    .eq('project_id', params.projectId)
    .select('id, starred');
}

export async function deleteGenerationByScope(params: GenerationSettingsInput) {
  return getSupabaseClient()
    .from('generations')
    .delete()
    .eq('id', params.id)
    .eq('project_id', params.projectId)
    .select('id');
}

export async function deleteGenerationVariantByScope(params: DeleteGenerationVariantInput) {
  return getSupabaseClient()
    .from('generation_variants')
    .delete()
    .eq('id', params.id)
    .eq('generation_id', params.generationId)
    .select('id');
}
