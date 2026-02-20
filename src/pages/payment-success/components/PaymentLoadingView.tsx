import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';

interface PaymentLoadingViewProps {
  sessionId: string;
}

export function PaymentLoadingView(props: PaymentLoadingViewProps) {
  const { sessionId } = props;

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
