import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { presetQueryKeys } from '@/shared/lib/queryKeys/presets';

const getSupabase = () => getSupabaseClient();

const BUILTIN_PRESET_NAMES: Record<string, string> = {
  '__builtin_default_i2v__': 'Basic',
  '__builtin_default_vace__': 'Basic',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function usePresetName(presetId: string | null): string | null {
  const isDbPreset = Boolean(presetId && !presetId.startsWith('__builtin_'));

  const { data: dbPresetName } = useQuery({
    queryKey: presetQueryKeys.name(presetId ?? ''),
    queryFn: async () => {
      if (!presetId) return null;
      const { data } = await getSupabase()
        .from('resources')
        .select('metadata')
        .eq('id', presetId)
        .single();
      return asString(asRecord(data?.metadata)?.name);
    },
    enabled: isDbPreset,
    staleTime: Infinity,
  });

  if (!presetId) {
    return null;
  }

  return BUILTIN_PRESET_NAMES[presetId] || dbPresetName || null;
}
