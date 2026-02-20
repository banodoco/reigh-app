import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { creditQueryKeys } from '@/shared/lib/queryKeys/credits';

type PaymentState = 'loading' | 'polling' | 'verified' | 'timed_out';

export interface PaymentSessionDetails {
  amount?: string;
  sessionId?: string;
}

const MIN_LOADING_DISPLAY_MS = 1500;
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 30000;

interface UsePaymentVerificationInput {
  sessionId: string | null;
  amount: string | null;
}

interface UsePaymentVerificationResult {
  state: PaymentState;
  sessionDetails: PaymentSessionDetails | null;
}

export function usePaymentVerification(input: UsePaymentVerificationInput): UsePaymentVerificationResult {
  const { sessionId, amount } = input;
  const queryClient = useQueryClient();
  const [state, setState] = useState<PaymentState>('loading');
  const [sessionDetails, setSessionDetails] = useState<PaymentSessionDetails | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshCredits = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: creditQueryKeys.balance });
    queryClient.invalidateQueries({ queryKey: creditQueryKeys.ledger });
  }, [queryClient]);

  const stopPolling = useCallback(() => {
    if (!pollIntervalRef.current) {
      return;
    }

    clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = null;
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setState('loading');
      setSessionDetails(null);
      stopPolling();
      return;
    }

    setSessionDetails({
      sessionId,
      amount: amount || undefined,
    });

    setState('polling');

    refreshCredits();
    pollIntervalRef.current = setInterval(refreshCredits, POLL_INTERVAL_MS);

    const displayTimer = setTimeout(() => {
      setState(previous => (previous === 'polling' ? 'verified' : previous));
    }, MIN_LOADING_DISPLAY_MS);

    const maxTimer = setTimeout(() => {
      stopPolling();
      setState(previous => (previous === 'polling' ? 'timed_out' : previous));
    }, MAX_POLL_DURATION_MS);

    return () => {
      clearTimeout(displayTimer);
      clearTimeout(maxTimer);
      stopPolling();
    };
  }, [amount, refreshCredits, sessionId, stopPolling]);

  useEffect(() => {
    if (state === 'verified' || state === 'timed_out') {
      stopPolling();
    }
  }, [state, stopPolling]);

  return { state, sessionDetails };
}
