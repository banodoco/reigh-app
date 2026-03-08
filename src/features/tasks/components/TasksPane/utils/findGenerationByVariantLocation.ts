interface VariantRow {
  id: string;
  generation_id: string;
  location: string;
  thumbnail_url: string | null;
  is_primary: boolean;
}

type GenerationRecord = Record<string, unknown> & {
  id: string;
  thumbnail_url?: string | null;
};

interface VariantGenerationLookupResult {
  generation: GenerationRecord;
  variantId: string;
  variantIsPrimary: boolean;
}

interface SupabaseLike {
  from: (table: string) => unknown;
}

export async function findGenerationByVariantLocation(
  outputLocation: string,
  supabaseClient: SupabaseLike,
): Promise<VariantGenerationLookupResult | null> {
  const { data: variantByLocation, error: variantError } = await (supabaseClient.from('generation_variants') as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        limit: (count: number) => Promise<{ data: VariantRow[] | null; error: unknown }>;
      };
    };
  })
    .select('id, generation_id, location, thumbnail_url, is_primary')
    .eq('location', outputLocation)
    .limit(1);

  if (variantError || !variantByLocation || variantByLocation.length === 0) {
    return null;
  }

  const variant = variantByLocation[0];
  const { data: parentGen, error: parentError } = await (supabaseClient.from('generations') as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        single: () => Promise<{ data: GenerationRecord | null; error: unknown }>;
      };
    };
  })
    .select('*')
    .eq('id', variant.generation_id)
    .single();

  if (parentError || !parentGen) {
    return null;
  }

  const generation = parentGen;
  return {
    generation: {
      ...generation,
      location: variant.location,
      thumbnail_url: variant.thumbnail_url || generation.thumbnail_url,
    },
    variantId: variant.id,
    variantIsPrimary: variant.is_primary,
  };
}
