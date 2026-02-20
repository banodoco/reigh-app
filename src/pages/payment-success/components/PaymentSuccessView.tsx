import { CheckCircle } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import type { PaymentSessionDetails } from '../hooks/usePaymentVerification';

interface PaymentSuccessViewProps {
  sessionDetails: PaymentSessionDetails | null;
  onContinue: () => void;
  onViewTransactions: () => void;
}

export function PaymentSuccessView(props: PaymentSuccessViewProps) {
  const { sessionDetails, onContinue, onViewTransactions } = props;

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
            <Button variant="retro" size="retro-sm" onClick={onContinue} className="flex-1">
              Return to Tool
            </Button>
            <Button variant="retro-secondary" size="retro-sm" onClick={onViewTransactions} className="flex-1">
              View Transactions
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
