import type { GenerationRow } from '@/domains/generation/types';
import type { Database } from '@/integrations/supabase/databasePublicTypes';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';

type GenerationRecord = Database['public']['Tables']['generations']['Row'] & Record<string, unknown>;

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

export async function fetchGenerationRecordById(generationId: string): Promise<GenerationRecord | null> {
  const { data, error } = await supabase().from('generations')
    .select('*')
    .eq('id', generationId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as GenerationRecord;
}
