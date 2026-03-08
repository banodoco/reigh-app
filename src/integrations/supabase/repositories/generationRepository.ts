import type { GenerationRow } from '@/domains/generation/types';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';

export async function fetchGenerationById(generationId: string): Promise<GenerationRow | null> {
  const { data, error } = await supabase().from('generations')
    .select('*')
    .eq('id', generationId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as GenerationRow;
}
