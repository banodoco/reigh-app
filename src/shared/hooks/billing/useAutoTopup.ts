import { getSupabaseClient } from '@/integrations/supabase/client';
import { invokeSupabaseEdgeFunction } from '@/integrations/supabase/functions/invokeSupabaseEdgeFunction';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { creditQueryKeys } from '@/shared/lib/queryKeys/credits';

const getSupabase = () => getSupabaseClient();

interface AutoTopupPreferences {
  enabled: boolean;
  setupCompleted: boolean;
  amount: number; // in dollars
  threshold: number; // in dollars
  hasPaymentMethod: boolean;
  lastTriggered?: string;
  // Note: Stripe IDs (customerId, paymentMethodId) are intentionally NOT exposed to frontend
}

// Fetch user's auto-top-up preferences
async function fetchAutoTopupPreferences(): Promise<AutoTopupPreferences> {
  const { data: { user }, error: authError } = await getSupabase().auth.getUser();
  
  if (authError || !user) {
    throw new Error('Authentication required');
  }

  // Try without the problematic field first, since we know it's causing 400 errors
  
  // Fetch auto-topup preferences.
  // IMPORTANT: Stripe IDs are NOT selected client-side (column privileges revoked).
  const { data, error } = await getSupabase()
    .from('users')
    .select(`
      auto_topup_enabled,
      auto_topup_amount,
      auto_topup_threshold,
      auto_topup_last_triggered,
      auto_topup_setup_completed
    `)
    .eq('id', user.id)
    .single();

  if (error) {
    throw new Error(`Failed to fetch auto-top-up preferences: ${error.message}`);
  }

  const hasPaymentMethod = !!data?.auto_topup_setup_completed;

  return {
    enabled: data?.auto_topup_enabled || false,
    // Setup completed if payment method is configured
    setupCompleted: hasPaymentMethod,
    amount: data?.auto_topup_amount ? data.auto_topup_amount / 100 : 50, // Convert cents to dollars
    threshold: data?.auto_topup_threshold ? data.auto_topup_threshold / 100 : 10, // Convert cents to dollars
    hasPaymentMethod,
    lastTriggered: data?.auto_topup_last_triggered ?? undefined,
    // Note: Stripe IDs are intentionally NOT exposed to frontend
  };
}

// Update auto-top-up preferences
interface UpdateAutoTopupParams {
  enabled: boolean;
  amount?: number; // in dollars
  threshold?: number; // in dollars
}

async function updateAutoTopupPreferences(params: UpdateAutoTopupParams): Promise<void> {
  
  const { data: { session }, error: authError } = await getSupabase().auth.getSession();
  
  if (authError || !session) {
    throw new Error('Authentication required');
  }

  const requestBody = {
    autoTopupEnabled: params.enabled,
    autoTopupAmount: params.amount,
    autoTopupThreshold: params.threshold,
  };
  
  // Call the setup-auto-topup edge function
  const data = await invokeSupabaseEdgeFunction('setup-auto-topup', {
    body: requestBody,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    timeoutMs: 20000,
  });
  
  if ((data as Record<string, unknown> | null)?.error) {
    throw new Error(((data as Record<string, unknown>).message as string) || 'Failed to update auto-top-up preferences');
  }
  
}

// Disable auto-top-up (convenience function)
function disableAutoTopup(): Promise<void> {
  return updateAutoTopupPreferences({ enabled: false });
}

export function useAutoTopup() {
  const queryClient = useQueryClient();

  // Fetch auto-top-up preferences
  const {
    data: preferences,
    isLoading: isLoadingPreferences,
    error: preferencesError,
  } = useQuery<AutoTopupPreferences>({
    queryKey: creditQueryKeys.autoTopupPreferences,
    queryFn: fetchAutoTopupPreferences,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });

  // Update preferences mutation
  const updatePreferencesMutation = useMutation<void, Error, UpdateAutoTopupParams>({
    mutationFn: updateAutoTopupPreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: creditQueryKeys.autoTopupPreferences });
      queryClient.invalidateQueries({ queryKey: creditQueryKeys.all }); // Refresh credits info
      // Removed toast notification for smoother UX
    },
    onError: (error, _variables) => {
      normalizeAndPresentError(error, { context: 'useAutoTopup', showToast: false });
      // Only log errors, don't show toast for save failures
    },
  });

  // Disable auto-top-up mutation
  const disableMutation = useMutation<void, Error>({
    mutationFn: disableAutoTopup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: creditQueryKeys.autoTopupPreferences });
      queryClient.invalidateQueries({ queryKey: creditQueryKeys.all }); // Refresh credits info
      // Removed toast notification for smoother UX
    },
    onError: (error) => {
      normalizeAndPresentError(error, { context: 'useAutoTopup', showToast: false });
      // Only log errors, don't show toast for disable failures
    },
  });

  return {
    // Data
    preferences,
    isLoadingPreferences,
    preferencesError,
    
    // Actions
    updatePreferences: updatePreferencesMutation.mutate,
    isUpdatingPreferences: updatePreferencesMutation.isPending,
    
    disableAutoTopup: disableMutation.mutate,
    isDisabling: disableMutation.isPending,
    
    // Computed values
    isEnabled: preferences?.enabled || false,
    isSetupCompleted: preferences?.setupCompleted || false,
    hasPaymentMethod: preferences?.hasPaymentMethod || false,
    isFullyConfigured: (preferences?.enabled && preferences?.setupCompleted && preferences?.hasPaymentMethod) || false,
  };
}
