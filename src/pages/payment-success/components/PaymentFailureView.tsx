import { ArrowLeft, XCircle } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';

interface PaymentFailureViewProps {
  errorMessage: string;
  onGoHome: () => void;
  onViewTransactions: () => void;
}

export function PaymentFailureView(props: PaymentFailureViewProps) {
  const { errorMessage, onGoHome, onViewTransactions } = props;

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
            {errorMessage}
          </div>
          <div className="flex gap-2">
            <Button variant="retro-secondary" size="retro-sm" onClick={onGoHome} className="flex-1">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Home
            </Button>
            <Button variant="retro" size="retro-sm" onClick={onViewTransactions} className="flex-1">
              View Transactions
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
