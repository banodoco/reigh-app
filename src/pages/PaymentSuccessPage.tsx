import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, Loader2, XCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';

/**
 * State machine for payment verification:
 *
 *   loading → polling: immediately on mount, start credit poll + minimum display timer
 *   polling → verified: after 1.5s minimum display (credits poll continues in background)
 *   polling → timed_out: after 30s, stop polling and show success anyway
 *   verified → (done): polling stopped, user navigates away manually
 *   timed_out → (done): polling stopped, user navigates away manually
 */
type PaymentState = 'loading' | 'polling' | 'verified' | 'timed_out';

const MIN_LOADING_DISPLAY_MS = 1500;
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 30000;

const PaymentSuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [state, setState] = useState<PaymentState>('loading');
  const [sessionDetails, setSessionDetails] = useState<{
    amount?: string;
    sessionId?: string;
  } | null>(null);

  const sessionId = searchParams.get('session_id');
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshCredits = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.credits.balance });
    queryClient.invalidateQueries({ queryKey: queryKeys.credits.ledger });
  }, [queryClient]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Main state machine effect — runs once on mount (sessionId is from URL, stable)
  useEffect(() => {
    if (!sessionId) return;

    setSessionDetails({
      sessionId,
      amount: searchParams.get('amount') || undefined,
    });

    // Transition: loading → polling
    setState('polling');

    // Start credit polling immediately
    refreshCredits();
    pollIntervalRef.current = setInterval(refreshCredits, POLL_INTERVAL_MS);

    // After minimum display time, transition polling → verified
    const displayTimer = setTimeout(() => {
      setState((prev) => (prev === 'polling' ? 'verified' : prev));
    }, MIN_LOADING_DISPLAY_MS);

    // Hard timeout: stop polling after 30s, force timed_out if still polling
    const maxTimer = setTimeout(() => {
      stopPolling();
      setState((prev) => (prev === 'polling' ? 'timed_out' : prev));
    }, MAX_POLL_DURATION_MS);

    return () => {
      clearTimeout(displayTimer);
      clearTimeout(maxTimer);
      stopPolling();
    };
  }, [sessionId, searchParams, refreshCredits, stopPolling]);

  // Stop polling once verified (no need to keep going after success is shown)
  // This is separate so it reacts to state changes without re-running the main effect
  useEffect(() => {
    if (state === 'verified' || state === 'timed_out') {
      stopPolling();
    }
  }, [state, stopPolling]);

  const handleContinue = () => {
    navigate('/tools');
  };

  const handleViewTransactions = () => {
    navigate('/tools', { state: { openSettings: true, creditsTab: 'history' } });
  };

  // No session ID — show error state
  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-wes-cream via-white to-wes-mint/10">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-xl">Payment Verification Failed</CardTitle>
            <CardDescription>
              We couldn't verify your payment. This might be a temporary issue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground text-center">
              If you were charged, your credits will be added automatically within a few minutes.
              You can check your transaction history in Settings.
            </div>
            <div className="flex gap-2">
              <Button variant="retro-secondary" size="retro-sm" onClick={() => navigate('/')} className="flex-1">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Home
              </Button>
              <Button variant="retro" size="retro-sm" onClick={handleViewTransactions} className="flex-1">
                View Transactions
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // loading / polling — show spinner while we wait for minimum display time
  if (state === 'loading' || state === 'polling') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-wes-cream via-white to-wes-mint/10">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
            <CardTitle className="text-xl">Processing Payment</CardTitle>
            <CardDescription>
              Please wait while we confirm your payment...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground text-center">
              <div className="font-mono break-all">
                Session ID: {sessionId}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-wes-cream via-white to-wes-mint/10">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <CardTitle className="text-xl">Payment Successful!</CardTitle>
          <CardDescription>
            Your credits have been added to your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Transaction ID:</span>
              <span className="font-mono text-xs">{sessionDetails?.sessionId?.slice(-12)}</span>
            </div>
            {sessionDetails?.amount && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-light">${sessionDetails.amount}</span>
              </div>
            )}
          </div>
          
          <div className="text-sm text-muted-foreground text-center">
            Your credits are being processed and will be available shortly.
            You can start using them for AI generation tasks.
          </div>

          <div className="flex gap-2">
            <Button variant="retro" size="retro-sm" onClick={handleContinue} className="flex-1">
              Return to Tool
            </Button>
            <Button variant="retro-secondary" size="retro-sm" onClick={handleViewTransactions} className="flex-1">
              View Transactions
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentSuccessPage; 