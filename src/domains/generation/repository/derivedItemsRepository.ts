import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { calculateDerivedCountsSafe } from '@/shared/lib/generationTransformers';
import { expandShotData } from '@/shared/lib/shotData';
import { EDIT_VARIANT_TYPES } from '@/shared/constants/variantTypes';

export interface DerivedItem {
  id: string;
  thumbUrl: string | null;
  url: string | null;
  createdAt: string;
  derivedCount: number;
  starred?: boolean;
  prompt?: string;
  itemType: 'generation' | 'variant';
  variantType?: string | null;
  variantName?: string | null;
  viewedAt?: string | null;
  basedOn?: string | null;
  shot_id?: string;
  timeline_frame?: number | null;
  all_shot_associations?: Array<{ shot_id: string; timeline_frame: number | null; position: number | null }>;
}

function normalizePosition(timelineFrame: number | null | undefined): number | null {
  if (timelineFrame === null || timelineFrame === undefined) {
    return null;
  }
  return Math.floor(timelineFrame / 50);
}

function normalizePrompt(params: unknown): string | undefined {
  const record = params as Record<string, unknown> | null;
  if (!record) {
    return undefined;
  }

  if (typeof record.prompt === 'string') {
    return record.prompt;
  }

  const originalParams = record.originalParams as Record<string, unknown> | undefined;
  const orchestratorDetails = originalParams?.orchestrator_details as Record<string, unknown> | undefined;
  return typeof orchestratorDetails?.prompt === 'string' ? orchestratorDetails.prompt : undefined;
}

export async function fetchDerivedItemsFromRepository(
  sourceGenerationId: string | null,
): Promise<DerivedItem[]> {
  if (!sourceGenerationId) {
    return [];
  }

  const [generationsResult, variantsResult] = await Promise.all([
    supabase().from('generations')
      .select(`
        id,
        location,
        thumbnail_url,
        type,
        created_at,
        params,
        starred,
        tasks,
        based_on,
        shot_data
      `)
      .eq('based_on', sourceGenerationId)
      .order('starred', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase().from('generation_variants')
      .select('id, location, thumbnail_url, created_at, variant_type, name, params, is_primary, viewed_at')
      .eq('generation_id', sourceGenerationId)
      .in('variant_type', EDIT_VARIANT_TYPES)
      .eq('is_primary', false)
      .order('created_at', { ascending: false }),
  ]);

  if (generationsResult.error) {
    normalizeAndPresentError(generationsResult.error, {
      context: 'generation.derivedItems.repository.generations',
      showToast: false,
    });
  }
  if (variantsResult.error) {
    normalizeAndPresentError(variantsResult.error, {
      context: 'generation.derivedItems.repository.variants',
      showToast: false,
    });
  }

  const childGenerations = generationsResult.data || [];
  const editVariants = variantsResult.data || [];

  const generationIds = childGenerations.map((row) => row.id);
  const { derivedCounts } = await calculateDerivedCountsSafe(generationIds);

  const generationItems: DerivedItem[] = childGenerations.map((item) => {
    const shotGenerations = expandShotData(
      (item as { shot_data?: Record<string, unknown> | null }).shot_data,
    );
    const allAssociations = shotGenerations.length > 1
      ? shotGenerations.map((sg) => ({
          shot_id: sg.shot_id,
          timeline_frame: sg.timeline_frame,
          position: normalizePosition(sg.timeline_frame),
        }))
      : undefined;

    const primaryShot = shotGenerations[0];

    return {
      id: item.id,
      thumbUrl: item.thumbnail_url || item.location,
      url: item.location,
      createdAt: item.created_at,
      derivedCount: derivedCounts[item.id] || 0,
      starred: item.starred || false,
      prompt: normalizePrompt(item.params),
      itemType: 'generation',
      basedOn: item.based_on,
      shot_id: primaryShot?.shot_id,
      timeline_frame: primaryShot?.timeline_frame,
      all_shot_associations: allAssociations,
    };
  });

  const variantItems: DerivedItem[] = editVariants.map((variant) => ({
    id: variant.id,
    thumbUrl: variant.thumbnail_url || variant.location,
    url: variant.location,
    createdAt: variant.created_at,
    derivedCount: 0,
    starred: false,
    prompt: normalizePrompt(variant.params),
    itemType: 'variant',
    variantType: variant.variant_type,
    variantName: variant.name,
    viewedAt: variant.viewed_at,
  }));

  return [...generationItems, ...variantItems].sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
