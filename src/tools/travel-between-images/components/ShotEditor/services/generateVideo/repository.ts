import { getSupabaseClient } from '@/integrations/supabase/client';
import type { QueryClient } from '@tanstack/react-query';
import type { ShotGenRow } from './types';

const getSupabase = () => getSupabaseClient();

/** Shared Supabase query shape for shot_generations with joined generation data */
const SHOT_GEN_QUERY = `
  id,
  generation_id,
  timeline_frame,
  metadata,
  generation:generations!shot_generations_generation_id_generations_id_fk (
    id,
    location,
    type,
    primary_variant_id
  )
`;

export async function waitForPendingMutations(queryClient: QueryClient, timeoutMs = 5000): Promise<void> {
  if (queryClient.isMutating() === 0) return;

  const start = Date.now();
  while (queryClient.isMutating() > 0) {
    if (Date.now() - start > timeoutMs) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function fetchFreshShotGenerations(selectedShotId: string): Promise<ShotGenRow[]> {
  const { data, error } = await getSupabase()
    .from('shot_generations')
    .select(SHOT_GEN_QUERY)
    .eq('shot_id', selectedShotId)
    .order('timeline_frame', { ascending: true });

  if (error) throw error;
  return (data || []) as ShotGenRow[];
}
