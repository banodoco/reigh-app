import { Home } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

interface SharePageErrorProps {
  message: string;
  onGoHome: () => void;
}

export function SharePageError(props: SharePageErrorProps) {
  const { message, onGoHome } = props;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Share Not Found</h1>
          <p className="text-muted-foreground">
            {message}
          </p>
        </div>

        <Button
          variant="retro"
          size="retro-sm"
          onClick={onGoHome}
          className="w-full"
        >
          <Home className="mr-2 h-4 w-4" />
          Go to Homepage
        </Button>
      </div>
    </div>
  );
}
