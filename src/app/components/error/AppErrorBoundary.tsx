import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { reportErrorBoundaryCatch } from '@/shared/lib/errorHandling/recoverableError';
import { ErrorDebugDetails } from '@/shared/components/error/ErrorDebugDetails';
import { createRecoveredErrorBoundaryState } from '@/shared/components/error/errorBoundaryState';

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

/**
 * App-level error boundary that catches uncaught React errors
 * and displays a recovery UI instead of a white screen.
 *
 * This should wrap the entire app to catch any unhandled errors
 * that bubble up from components.
 */
export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = createRecoveredErrorBoundaryState();
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    reportErrorBoundaryCatch({
      context: 'AppErrorBoundary.componentDidCatch',
      error,
      errorInfo,
      recoveryAction: 'fallback',
    });

    this.setState({ errorInfo });

    // In production, you might want to send this to an error tracking service
    // e.g., Sentry, LogRocket, etc.
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleRetry = (): void => {
    this.setState(createRecoveredErrorBoundaryState());
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const { error } = this.state;
      const isDev = import.meta.env.DEV;

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full space-y-6 text-center">
            {/* Error icon */}
            <div className="flex justify-center">
              <div className="rounded-full bg-destructive/10 p-4">
                <AlertTriangle className="h-12 w-12 text-destructive" />
              </div>
            </div>

            {/* Error message */}
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-foreground">
                Something went wrong
              </h1>
              <p className="text-muted-foreground">
                We're sorry, but something unexpected happened. Please try refreshing the page.
              </p>
            </div>

            <ErrorDebugDetails error={error} isDev={isDev} />

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleRetry} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button onClick={this.handleReload}>
                Reload Page
              </Button>
            </div>

            {/* Help text */}
            <p className="text-sm text-muted-foreground">
              If this keeps happening, try clearing your browser cache or contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
