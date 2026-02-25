import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

type ReconnectPriority = 'low' | 'medium' | 'high';

interface ReconnectRequestInput {
  source: string;
  reason: string;
  priority?: ReconnectPriority;
}

export async function requestRealtimeReconnect(input: ReconnectRequestInput): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const module = await import('@/integrations/supabase/reconnect/ReconnectScheduler');
    const { getReconnectScheduler } = module;
    const scheduler = getReconnectScheduler();

    scheduler.requestReconnect({
      source: input.source,
      reason: input.reason,
      priority: input.priority ?? 'medium',
    });
  } catch (error) {
    normalizeAndPresentError(error, {
      context: 'requestRealtimeReconnect',
      showToast: false,
      logData: {
        source: input.source,
        reason: input.reason,
      },
    });
  }
}
