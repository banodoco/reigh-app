import { useState, useEffect } from 'react';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { GenerationRow } from '@/types/shots';
import { supabase } from '@/integrations/supabase/client';

interface UseSourceGenerationParams {
  media: GenerationRow;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
}

export interface SourceVariantData {
  id: string;
  location: string;
  thumbnail_url: string | null;
  variant_type: string | null;
  is_primary: boolean;
}

/** Enriched generation data with shot associations */
interface SourceGenerationWithAssociations extends GenerationRow {
  all_shot_associations: Array<{ shot_id: string; timeline_frame: number | null }>;
}

interface UseSourceGenerationReturn {
  sourceGenerationData: SourceGenerationWithAssociations | null;
  sourcePrimaryVariant: SourceVariantData | null;
}

/**
 * Hook to fetch and manage source generation (based_on) data
 * Fetches the generation that this media was derived from, plus its primary variant
 */
export const useSourceGeneration = ({
  media
}: UseSourceGenerationParams): UseSourceGenerationReturn => {
  const [sourceGenerationData, setSourceGenerationData] = useState<SourceGenerationWithAssociations | null>(null);
  const [sourcePrimaryVariant, setSourcePrimaryVariant] = useState<SourceVariantData | null>(null);
  const metadataBasedOnId = (media.metadata as Record<string, unknown> | null)?.based_on as string | undefined;

  useEffect(() => {
    const basedOnId = media.based_on;
    const basedOnFromMetadata = metadataBasedOnId;

    // Check both direct field and metadata
    const effectiveBasedOnId = basedOnId || basedOnFromMetadata;
    
    if (!effectiveBasedOnId) {
      setSourceGenerationData(null);
      setSourcePrimaryVariant(null);
      return;
    }
    
    const fetchSourceGeneration = async () => {
      try {
        // Fetch source generation with shot associations and primary variant
        // Use left join (no !inner) so we get the generation even if it's not in any shot
        const { data, error } = await supabase
          .from('generations')
          .select(`
            *,
            shot_generations!shot_generations_generation_id_generations_id_fk(
              shot_id,
              timeline_frame
            ),
            generation_variants!generation_variants_generation_id_fkey(
              id,
              location,
              thumbnail_url,
              variant_type,
              is_primary
            )
          `)
          .eq('id', effectiveBasedOnId)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          // Extract shot associations from joined data
          const joinedData = data as unknown as Record<string, unknown>;
          const shotAssociations = (joinedData.shot_generations || []) as Array<{ shot_id: string; timeline_frame: number | null }>;
          const variants = (joinedData.generation_variants || []) as SourceVariantData[];
          
          // Find primary variant
          const primaryVariant = variants.find((v) => v.is_primary) || null;
          
          // Add shot associations to the data for easy access
          const enrichedData: SourceGenerationWithAssociations = {
            ...data as unknown as GenerationRow,
            all_shot_associations: shotAssociations,
          };

          setSourceGenerationData(enrichedData);
          setSourcePrimaryVariant(primaryVariant);
        } else {
          setSourceGenerationData(null);
          setSourcePrimaryVariant(null);
        }
      } catch (error) {
        handleError(error, { context: 'useSourceGeneration', showToast: false });
        // Don't show toast - this is a non-critical feature
        setSourceGenerationData(null);
        setSourcePrimaryVariant(null);
      }
    };
    
    void fetchSourceGeneration();
  }, [media.based_on, metadataBasedOnId]);

  return {
    sourceGenerationData,
    sourcePrimaryVariant
  };
};
