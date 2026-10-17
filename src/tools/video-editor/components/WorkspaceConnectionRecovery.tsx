import { useState } from 'react';
import { AlertTriangle, Check, Copy, LoaderCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/shared/components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card.tsx';
import { writeClipboardTextSafe } from '@/shared/lib/browser/clipboard.ts';
import { ASTRID_APP_LOCAL_DEV_COMMAND } from '@/shared/lib/localAstridRuntime.ts';

export interface WorkspaceConnectionRecoveryProps {
  readonly retrying: boolean;
  readonly error: string;
  readonly onRetry: () => void | Promise<void>;
  /** Concise explanation of which workspace check failed. */
  readonly failureSummary?: string | null;
  /** Current route identity, when the editor has one. */
  readonly projectSlug?: string | null;
  readonly timelineId?: string | null;
  /** A configured, non-secret Runtime URL when the host knows it. */
  readonly connectionUrl?: string | null;
}

type RecoveryChoice = 'agent' | 'manual' | null;

function safeConnectionUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function buildWorkspaceRestartBrief({
  error,
  connectionUrl,
  projectSlug,
  timelineId,
}: Pick<WorkspaceConnectionRecoveryProps, 'error' | 'connectionUrl' | 'projectSlug' | 'timelineId'>): string {
  const diagnostic = error.trim() || 'The editor cannot reach its configured Astrid Runtime.';
  const safeUrl = safeConnectionUrl(connectionUrl);
  return [
    'Please restore this editor’s existing Astrid Runtime connection.',
    'Keep the current installation, Runtime profile, data root, workspace files, credentials, and agent instructions. Do not reset, reinstall, create a new data root, or switch to the bundled demo bridge.',
    `Restart the existing app process through its local launcher (${ASTRID_APP_LOCAL_DEV_COMMAND}) from the same Astrid App checkout. If the Runtime is managed separately, restart that existing Runtime with its current command, profile, and data root; inspect the existing configuration instead of guessing a path.`,
    ...(projectSlug || timelineId ? [`Preserve the current editor route identity: project ${projectSlug || '(unknown)'}, timeline ${timelineId || '(unknown)'}.`] : []),
    `Current editor diagnostic: ${diagnostic}`,
    ...(safeUrl ? [`Configured editor origin for the workspace connection: ${safeUrl}`] : []),
    'Verify that the same configured Runtime is healthy, editor project and timeline discovery return the same selections, and the existing configured agent responds without changing its instructions. Leave the existing processes available after verification.',
  ].join('\n\n');
}

/** Recovery UI for the selected local workspace and its existing Runtime. */
export function WorkspaceConnectionRecovery({
  retrying,
  error,
  onRetry,
  failureSummary,
  projectSlug,
  timelineId,
  connectionUrl,
}: WorkspaceConnectionRecoveryProps) {
  const [choice, setChoice] = useState<RecoveryChoice>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const safeUrl = safeConnectionUrl(connectionUrl);
  const restartBrief = buildWorkspaceRestartBrief({ error, connectionUrl: safeUrl, projectSlug, timelineId });
  const visibleFailureSummary = failureSummary?.trim()
    || 'The editor could not complete workspace discovery.';

  const chooseAgent = async () => {
    setChoice('agent');
    const copied = await writeClipboardTextSafe(restartBrief);
    setCopyStatus(copied
      ? 'Restart instructions copied. Paste them into your agent.'
      : 'Clipboard access is unavailable. Copy the brief from the field below.');
  };

  return (
    <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-background px-4 py-8" data-testid="workspace-connection-recovery">
      <Card className="w-full max-w-2xl border-border/80 shadow-sm" role="alert">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle aria-hidden="true" className="h-5 w-5" />
          </div>
          <CardTitle className="text-xl">Workspace connection unavailable</CardTitle>
          <CardDescription className="max-w-prose text-sm leading-6">
            This editor cannot reach the Astrid Runtime it is configured to use. Your selected project and timeline are still here; reconnect to the existing workspace to continue.
          </CardDescription>
          <p className="mt-2 break-words rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground" data-testid="workspace-connection-summary">
            {visibleFailureSummary}
          </p>
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none font-medium">Show full connection error</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2" data-testid="workspace-connection-diagnostic">
              {error.trim() || 'No additional connection error details were provided.'}
            </pre>
          </details>
          {safeUrl && <p className="break-all text-xs text-muted-foreground">Configured editor origin: <code>{safeUrl}</code></p>}
        </CardHeader>
        <CardContent className="space-y-4">
          <Button type="button" className="w-full sm:w-auto" onClick={() => void onRetry()} disabled={retrying}>
            {retrying ? <LoaderCircle aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw aria-hidden="true" className="mr-2 h-4 w-4" />}
            {retrying ? 'Reconnecting to Runtime…' : 'Retry connection'}
          </Button>

          <div className="grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-2">
            <section className="min-w-0 rounded-lg border border-border/70 p-3">
              <h2 className="text-sm font-medium">Ask your agent to restart it</h2>
              <p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">Give your agent the current diagnostic and safe instructions for restarting this existing workspace.</p>
              <Button type="button" variant={choice === 'agent' ? 'default' : 'outline'} className="mt-2 w-full" aria-pressed={choice === 'agent'} onClick={() => void chooseAgent()}>
                {copyStatus.startsWith('Restart instructions copied') ? <Check aria-hidden="true" className="mr-2 h-4 w-4" /> : <Copy aria-hidden="true" className="mr-2 h-4 w-4" />}
                Give restart instructions to my agent
              </Button>
              {choice === 'agent' && <>
                <p role="status" className="mt-2 text-xs text-muted-foreground">{copyStatus}</p>
                <label className="mt-2 block text-xs font-medium" htmlFor="workspace-restart-brief">Restart brief</label>
                <textarea id="workspace-restart-brief" aria-label="Restart brief" readOnly rows={8} value={restartBrief} className="mt-1 w-full resize-y rounded-md border border-border bg-background p-2 text-xs leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onFocus={(event) => event.currentTarget.select()} />
              </>}
            </section>

            <section className="min-w-0 rounded-lg border border-border/70 p-3">
              <h2 className="text-sm font-medium">Restart it yourself</h2>
              <p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">Use the existing startup configuration so the app returns to the same Runtime and data.</p>
              <Button type="button" variant={choice === 'manual' ? 'default' : 'outline'} className="mt-2 w-full" aria-pressed={choice === 'manual'} onClick={() => setChoice('manual')}>
                I’ll restart it myself
              </Button>
              {choice === 'manual' && <ol className="mt-3 list-decimal space-y-2 pl-4 text-xs leading-5 text-muted-foreground">
                <li>Return to the same Astrid App checkout and terminal used to start this app. Restart its existing local launcher with <code className="rounded bg-muted px-1 py-0.5 text-foreground">{ASTRID_APP_LOCAL_DEV_COMMAND}</code>.</li>
                <li>If Astrid Runtime is a separate process, restart that same Runtime with its current command, profile, and data-root configuration. Keep the existing install and data location.</li>
                <li>Wait for the Runtime to become ready, then choose <strong className="font-medium text-foreground">Retry connection</strong> here and confirm the same project, timeline, and configured agent return.</li>
              </ol>}
              <p className="mt-3 text-[11px] leading-4 text-muted-foreground">Do not reset or reinstall the workspace, change its data root, or replace its credentials.</p>
            </section>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
