import { getSupabaseClient } from '@/integrations/supabase/client';

interface PresetResourceRecord<TMetadata = unknown> {
  id: string;
  metadata: TMetadata;
}

export async function fetchPresetResourceById<TMetadata = unknown>(
  presetId: string,
): Promise<PresetResourceRecord<TMetadata>> {
  const { data, error } = await getSupabaseClient()
    .from('resources')
    .select('*')
    .eq('id', presetId)
    .single();

  if (error) {
    throw error;
  }

  return data as unknown as PresetResourceRecord<TMetadata>;
}
