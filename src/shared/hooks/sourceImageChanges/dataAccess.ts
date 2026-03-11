import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type {
  GenVariantInfo,
  SourceSlotData,
  SourceSlotLookupError,
  StartGenToNextInfo,
} from './sourceMismatchAnalysis';

function buildStartGenToNextMap(
  startSlots: Array<{ generation_id: string }>,
  orderedSlots: Array<{ generation_id: string; updated_at: string | null }>,
): Record<string, StartGenToNextInfo> {
  const startGenToNext: Record<string, StartGenToNextInfo> = {};

  startSlots.forEach((slot) => {
    const idx = orderedSlots.findIndex((orderedSlot) => orderedSlot.generation_id === slot.generation_id);
    const nextSlot = idx >= 0 && idx < orderedSlots.length - 1 ? orderedSlots[idx + 1] : null;
    startGenToNext[slot.generation_id] = {
      nextGenId: nextSlot?.generation_id || null,
      nextSlotUpdatedAt: nextSlot?.updated_at ? new Date(nextSlot.updated_at) : null,
    };
  });

  return startGenToNext;
}

function buildGenerationVariantMap(
  genData: Array<{ id: string; primary_variant_id: string | null; updated_at: string | null }>,
  variantLocations: Record<string, { location: string }>,
): Record<string, GenVariantInfo> {
  const genToVariant: Record<string, GenVariantInfo> = {};

  genData.forEach((generation) => {
    const variant = generation.primary_variant_id ? variantLocations[generation.primary_variant_id] : null;
    genToVariant[generation.id] = {
      location: variant?.location || null,
      updated_at: new Date(generation.updated_at ?? 0),
    };
  });

  return genToVariant;
}

interface VariantLocationLookupResult {
  locations: Record<string, { location: string }>;
  lookupError: SourceSlotLookupError | null;
}

async function fetchVariantLocations(variantIds: string[]): Promise<VariantLocationLookupResult> {
  const variantLocations: Record<string, { location: string }> = {};
  if (variantIds.length === 0) {
    return {
      locations: variantLocations,
      lookupError: null,
    };
  }

  const { data: variantData, error: variantError } = await supabase().from('generation_variants')
    .select('id, location')
    .in('id', variantIds);

  if (variantError) {
    normalizeAndPresentError(variantError, { context: 'useSourceImageChanges:variantLookup', showToast: false });
    return {
      locations: variantLocations,
      lookupError: {
        kind: 'variant_lookup_failed',
        message: variantError.message,
      },
    };
  }

  (variantData || []).forEach((variant) => {
    variantLocations[variant.id] = { location: variant.location };
  });

  return {
    locations: variantLocations,
    lookupError: null,
  };
}

export async function fetchSourceSlotData(startGenIds: string[]): Promise<SourceSlotData | null> {
  if (startGenIds.length === 0) {
    return null;
  }

  const { data: startSlots, error: startError } = await supabase().from('shot_generations')
    .select('shot_id, generation_id, updated_at')
    .in('generation_id', startGenIds)
    .not('timeline_frame', 'is', null);

  if (startError) {
    normalizeAndPresentError(startError, { context: 'useSourceImageChanges:startSlots', showToast: false });
    return null;
  }

  if (!startSlots || startSlots.length === 0) {
    return null;
  }

  const shotId = startSlots[0].shot_id;

  const { data: allSlots, error: allError } = await supabase().from('shot_generations')
    .select('generation_id, timeline_frame, updated_at')
    .eq('shot_id', shotId)
    .not('timeline_frame', 'is', null)
    .order('timeline_frame', { ascending: true });

  if (allError) {
    normalizeAndPresentError(allError, { context: 'useSourceImageChanges:allSlots', showToast: false });
    return null;
  }

  const orderedSlots = allSlots || [];
  const startGenToNext = buildStartGenToNextMap(startSlots, orderedSlots);
  const generationIds = orderedSlots.map((slot) => slot.generation_id).filter(Boolean);
  if (generationIds.length === 0) {
    return null;
  }

  const { data: genData, error: genError } = await supabase().from('generations')
    .select('id, primary_variant_id, updated_at')
    .in('id', generationIds);

  if (genError) {
    normalizeAndPresentError(genError, { context: 'useSourceImageChanges:generations', showToast: false });
    return null;
  }

  const variantsToFetch = (genData || [])
    .map((generation) => generation.primary_variant_id)
    .filter((variantId): variantId is string => Boolean(variantId));
  const { locations: variantLocations, lookupError } = await fetchVariantLocations(variantsToFetch);

  return {
    genToVariant: buildGenerationVariantMap(genData || [], variantLocations),
    startGenToNext,
    lookupError,
  };
}
