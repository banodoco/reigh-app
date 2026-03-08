import React from 'react';

interface ErrorDebugDetailsProps {
  error: Error | null;
  isDev: boolean;
}

export function ErrorDebugDetails({
  error,
  isDev,
}: ErrorDebugDetailsProps): React.ReactElement | null {
  if (!isDev || !error) {
    return null;
  }

  return (
    <div className="bg-muted rounded-lg p-4 text-left">
      <p className="text-sm font-mono text-destructive break-all">
        {error.name}: {error.message}
      </p>
      {error.stack && (
        <pre className="mt-2 text-xs text-muted-foreground overflow-x-auto max-h-32">
          {error.stack.split('\n').slice(1, 6).join('\n')}
        </pre>
      )}
    </div>
  );
}
