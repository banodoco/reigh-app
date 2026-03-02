import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/integrations/supabase/client';

export async function fetchRealtimeSession() {
  return getSupabaseClient().auth.getSession();
}

export function setRealtimeAuthToken(accessToken: string): void {
  getSupabaseClient().realtime.setAuth(accessToken);
}

export function createRealtimeChannel(topic: string): RealtimeChannel {
  return getSupabaseClient().channel(topic);
}
