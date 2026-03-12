import { getSupabaseClient } from '@/integrations/supabase/client';
import { invokeSupabaseEdgeFunction } from '@/integrations/supabase/functions/invokeSupabaseEdgeFunction';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { QUERY_PRESETS } from '@/shared/lib/query/queryDefaults';
import { normalizeAndPresentAndRethrow, normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { creditQueryKeys } from '@/shared/lib/queryKeys/credits';
import {
  requireSession,
  requireUserFromSession,
} from '@/integrations/supabase/auth/ensureAuthenticatedSession';

interface CreditBalance {
  balance: number;
  currency: string;
}

interface CreditLedgerEntry {
  id: string;
  user_id: string;
  type: 'manual' | 'stripe' | 'spend' | 'refund' | 'auto_topup';
  amount: number;
  description?: string;
  task_id?: string | null;
  metadata?: unknown;
  created_at: string;
}

interface CreditLedgerResponse {
  entries: CreditLedgerEntry[];
  pagination: {
  limit: number;
  offset: number;
    total: number;
    hasMore: boolean;
  };
}

interface CheckoutResponse {
  checkoutUrl?: string;
  error?: boolean;
  message?: string;
}

interface CheckoutParams {
  amount: number;
  autoTopupEnabled?: boolean;
  autoTopupAmount?: number;
  autoTopupThreshold?: number;
}

async function fetchCreditBalance(): Promise<CreditBalance> {
  const supabase = getSupabaseClient();
  const user = await requireUserFromSession(supabase, 'useCredits.fetchCreditBalance');

  const { data, error } = await supabase
    .from('users')
    .select('credits')
    .eq('id', user.id)
    .single();

  if (error) {
    normalizeAndPresentAndRethrow(error, {
      context: 'useCredits.fetchCreditBalance',
      showToast: false,
    });
  }

  return {
    balance: data?.credits || 0,
    currency: 'USD',
  };
}

/**
 * Get credit ledger using direct Supabase call
 */
async function fetchCreditLedger(limit: number = 50, offset: number = 0): Promise<CreditLedgerResponse> {
  const supabase = getSupabaseClient();
  const user = await requireUserFromSession(supabase, 'useCredits.fetchCreditLedger');

  const { count, error: countError } = await supabase
    .from('credits_ledger')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .neq('type', 'spend');

  if (countError) {
    normalizeAndPresentAndRethrow(countError, {
      context: 'useCredits.fetchCreditLedger.count',
      showToast: false,
    });
  }

  const { data, error } = await supabase
    .from('credits_ledger')
    .select('*')
    .eq('user_id', user.id)
    .neq('type', 'spend')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    normalizeAndPresentAndRethrow(error, {
      context: 'useCredits.fetchCreditLedger.entries',
      showToast: false,
    });
  }

  const total = count || 0;
  const hasMore = offset + limit < total;

  return {
    entries: data || [],
    pagination: {
      limit,
      offset,
      total,
      hasMore,
    },
  };
}

export function useCreditLedger(limit = 50, offset = 0) {
  return useQuery<CreditLedgerResponse>({
    queryKey: creditQueryKeys.ledgerPaginated(limit, offset),
    queryFn: () => fetchCreditLedger(limit, offset),
    ...QUERY_PRESETS.userConfig,
  });
}

export function useCredits() {
  const queryClient = useQueryClient();

  // Fetch credit balance using Supabase
  const {
    data: balance,
    isLoading: isLoadingBalance,
    error: balanceError,
  } = useQuery<CreditBalance>({
    queryKey: creditQueryKeys.balance,
    queryFn: fetchCreditBalance,
    // Use userConfig preset - balance changes after purchases/spend
    ...QUERY_PRESETS.userConfig,
    staleTime: 1000 * 60 * 5, // Override: 5 minutes (balance doesn't need 2min checks)
  });

  // Create checkout session with optional auto-top-up support
  const createCheckoutMutation = useMutation<CheckoutResponse, Error, CheckoutParams>({
    mutationKey: ['stripe-checkout'],
    mutationFn: async (params: CheckoutParams) => {
      try {
        const session = await requireSession(getSupabaseClient(), 'useCredits.createCheckout');

        // Call Supabase Edge Function for Stripe checkout
        const data = await invokeSupabaseEdgeFunction<CheckoutResponse>('stripe-checkout', {
          body: {
            amount: params.amount,
            autoTopupEnabled: params.autoTopupEnabled,
            autoTopupAmount: params.autoTopupAmount,
            autoTopupThreshold: params.autoTopupThreshold,
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          timeoutMs: 20000,
        });
        return data;
      } catch (error) {
        normalizeAndPresentAndRethrow(error, {
          context: 'useCredits.createCheckout',
          showToast: false,
        });
      }
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        // Validate and normalize checkout URL to prevent open redirects.
        // We only ever navigate to Stripe's canonical checkout origin.
        const STRIPE_CHECKOUT_ORIGIN = 'https://checkout.stripe.com';
        let safeCheckoutUrl: string | null = null;

        try {
          const checkoutUrl = new URL(data.checkoutUrl, window.location.origin);
          if (checkoutUrl.protocol !== 'https:' || checkoutUrl.origin !== STRIPE_CHECKOUT_ORIGIN) {
            throw new Error('Unexpected checkout origin');
          }

          safeCheckoutUrl = `${STRIPE_CHECKOUT_ORIGIN}${checkoutUrl.pathname}${checkoutUrl.search}${checkoutUrl.hash}`;
        } catch {
          toast.error('Invalid checkout URL');
          return;
        }

        window.location.assign(safeCheckoutUrl);
      } else if (data.error) {
        toast.error(data.message || 'Failed to create checkout session');
      }
    },
    onError: (error) => {
      normalizeAndPresentError(error, { context: 'useCredits.createCheckout', toastTitle: 'Failed to create checkout session' });
    },
  });

  // Grant credits - for admin use via Edge Function
  const grantCreditsMutation = useMutation<unknown, Error, { userId: string; amount: number; description: string }>({
    mutationKey: ['grant-credits'],
    mutationFn: async ({ userId, amount, description }) => {
      try {
        const session = await requireSession(getSupabaseClient(), 'useCredits.grantCredits');

        // Call Supabase Edge Function for granting credits
        return await invokeSupabaseEdgeFunction('grant-credits', {
          body: { userId, amount, description },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          timeoutMs: 20000,
        });
      } catch (error) {
        normalizeAndPresentAndRethrow(error, {
          context: 'useCredits.grantCredits',
          showToast: false,
        });
      }
    },
    onSuccess: () => {
      // Invalidate balance and ledger to refresh
      queryClient.invalidateQueries({ queryKey: creditQueryKeys.balance });
      queryClient.invalidateQueries({ queryKey: creditQueryKeys.ledger });
    },
    onError: (error) => {
      normalizeAndPresentError(error, { context: 'useCredits.grantCredits', toastTitle: 'Failed to grant credits' });
    },
  });

  // Format currency amount
  const formatCurrency = (cents: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  return {
    balance,
    isLoadingBalance,
    balanceError,
    createCheckout: createCheckoutMutation.mutate,
    // Convenience method for simple checkout without auto-top-up
    createSimpleCheckout: (amount: number) => createCheckoutMutation.mutate({ amount }),
    isCreatingCheckout: createCheckoutMutation.isPending,
    grantCredits: grantCreditsMutation.mutate,
    isGrantingCredits: grantCreditsMutation.isPending,
    formatCurrency,
  };
} 
