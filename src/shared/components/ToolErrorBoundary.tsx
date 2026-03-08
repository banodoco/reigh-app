import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { ErrorDebugDetails } from '@/shared/components/error/ErrorDebugDetails';
import { createRecoveredErrorBoundaryState } from '@/shared/components/error/errorBoundaryState';

interface ToolErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ToolErrorBoundaryProps {
  toolName: string;
  children: React.ReactNode;
}

/**
 * Per-tool error boundary that catches errors within a single tool's route
 * and displays a recovery UI instead of crashing the entire app.
 *
 * Wrap each tool's page element in routes.tsx so that one tool's crash
 * doesn't take down unrelated UI (header, panes, other tools).
 */
export class ToolErrorBoundary extends React.Component<
  ToolErrorBoundaryProps,
  ToolErrorBoundaryState
> {
  constructor(props: ToolErrorBoundaryProps) {
    super(props);
    this.state = createRecoveredErrorBoundaryState();
  }

  static getDerivedStateFromError(error: Error): Partial<ToolErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(`[ToolErrorBoundary:${this.props.toolName}] Uncaught error:`, {
      message: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      componentStack: errorInfo.componentStack?.split('\n').slice(0, 10).join('\n'),
    });

    this.setState({ errorInfo });
  }

  handleRetry = (): void => {
    this.setState(createRecoveredErrorBoundaryState());
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const { error } = this.state;
      const { toolName } = this.props;
      const isDev = import.meta.env.DEV;

      return (
        <div className="flex items-center justify-center p-8 min-h-[50vh]">
          <div className="max-w-md w-full space-y-6 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-destructive/10 p-3">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">
                {toolName} encountered an error
              </h2>
              <p className="text-sm text-muted-foreground">
                Something went wrong in this tool. Your other tools and data are unaffected.
              </p>
            </div>

            <ErrorDebugDetails error={error} isDev={isDev} />

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleRetry} variant="default">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button variant="outline" asChild>
                <a href="/">
                  <Home className="h-4 w-4 mr-2" />
                  Go Home
                </a>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
