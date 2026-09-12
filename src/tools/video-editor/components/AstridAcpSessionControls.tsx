import { useMemo, useState } from 'react';

import { AstridLocalClient } from '@/integrations/astrid/client.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card.tsx';

function sessionIdFromResult(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return typeof record.sessionId === 'string'
    ? record.sessionId
    : typeof record.session_id === 'string'
      ? record.session_id
      : null;
}

export function AstridAcpSessionControls({ enabled }: { enabled: boolean }) {
  const client = useMemo(() => new AstridLocalClient({ projectSlug: 'reigh-acp' }), []);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('Disconnected');
  const [error, setError] = useState<string | null>(null);

  if (!enabled) return null;

  async function run(label: string, action: () => Promise<void>): Promise<void> {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  const connect = () => run('connect', async () => {
    const connection = await client.acp.connect();
    setConnectionId(connection.connection_id);
    setStatus('Connected');
  });

  const reconnect = () => run('reconnect', async () => {
    const connection = await client.acp.reconnect(connectionId ?? undefined);
    setConnectionId(connection.connection_id);
    if (sessionId.trim()) {
      await client.acp.resumeSession(connection.connection_id, sessionId.trim());
      setStatus('Reconnected and resumed');
    } else {
      setStatus('Reconnected');
    }
  });

  const create = () => run('create', async () => {
    if (!connectionId) throw new Error('Connect to Astrid before creating a session.');
    const result = await client.acp.createSession(connectionId, { mcpServers: [] });
    const nextSessionId = sessionIdFromResult(result);
    if (!nextSessionId) throw new Error('Astrid ACP did not return an opaque session ID.');
    setSessionId(nextSessionId);
    setStatus('Session created');
  });

  const resume = () => run('resume', async () => {
    if (!connectionId) throw new Error('Connect to Astrid before resuming a session.');
    if (!sessionId.trim()) throw new Error('Enter an opaque Astrid session ID before resuming.');
    await client.acp.resumeSession(connectionId, sessionId.trim());
    setStatus('Session resumed');
  });

  const cancel = () => run('cancel', async () => {
    if (!connectionId || !sessionId.trim()) throw new Error('A connected session is required to cancel.');
    await client.acp.cancelSession(connectionId, sessionId.trim());
    setStatus('Session cancellation requested');
  });

  const close = () => run('close', async () => {
    if (!connectionId || !sessionId.trim()) throw new Error('A connected session is required to close.');
    await client.acp.closeSession(connectionId, sessionId.trim());
    await client.acp.disconnect(connectionId);
    setConnectionId(null);
    setSessionId('');
    setStatus('Disconnected');
  });

  const isBusy = busy !== null;
  return (
    <Card className="w-full max-w-xl border-border/70 bg-card/80" data-testid="astrid-acp-session-controls">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Astrid ACP session</CardTitle>
        <CardDescription>
          Host-owned OMP session controls. IDs stay in this browser tab and are never persisted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground" role="status">{status}</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={connectionId ? reconnect : connect} disabled={isBusy} data-testid="astrid-acp-connect">
              {busy === 'reconnect' ? 'Reconnecting…' : connectionId ? 'Reconnect' : 'Connect'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={create} disabled={isBusy || !connectionId} data-testid="astrid-acp-create">
              Create
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            aria-label="Astrid ACP session ID"
            placeholder="Opaque Astrid session ID"
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
            disabled={isBusy}
          />
          <Button type="button" size="sm" variant="outline" onClick={resume} disabled={isBusy || !connectionId} data-testid="astrid-acp-resume">
            Resume
          </Button>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={cancel} disabled={isBusy || !connectionId || !sessionId} data-testid="astrid-acp-cancel">
            Cancel
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={close} disabled={isBusy || !connectionId || !sessionId} data-testid="astrid-acp-close">
            Close
          </Button>
        </div>
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      </CardContent>
    </Card>
  );
}
