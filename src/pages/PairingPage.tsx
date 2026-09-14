import { useCallback, useEffect, useState } from 'react';

type PairStatus = { pair_id: string; realm_id: string; expires_at: number };

async function pairingRequest(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(path, { ...init, headers: { Accept: 'application/json', ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : typeof payload.error === 'string' ? payload.error : `pairing request failed (${response.status})`);
  return payload;
}

export default function PairingPage() {
  const [status, setStatus] = useState<PairStatus | null>(null);
  const [message, setMessage] = useState('Waiting for an explicitly started local connector.');
  const [runtimeCheck, setRuntimeCheck] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try { setStatus(await pairingRequest('/api/pairing/status') as unknown as PairStatus); setMessage('This browser is paired with the local workspace.'); }
    catch { setStatus(null); }
  }, []);
  useEffect(() => {
    const invitation = window.location.hash.slice(1);
    if (!invitation) { void refresh(); return; }
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setBusy(true);
    void pairingRequest('/api/pairing/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invitation: decodeURIComponent(invitation) }) })
      .then((value) => { setStatus(value as unknown as PairStatus); setMessage('Pairing complete. The local connector remains the only Runtime path.'); })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Pairing failed.'))
      .finally(() => setBusy(false));
  }, [refresh]);
  const revoke = async () => {
    setBusy(true);
    try { await pairingRequest('/api/pairing/revoke', { method: 'POST' }); setStatus(null); setMessage('Pair revoked. Start the connector and pair again for a new session.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Revoke failed.'); }
    finally { setBusy(false); }
  };
  const checkRuntime = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/runtime/v1/health', { headers: { Accept: 'application/json' } });
      const value = await response.json().catch(() => ({})) as { protocol?: unknown; status?: unknown; error?: unknown };
      setRuntimeCheck(response.ok ? `${String(value.protocol)} / ${String(value.status)}` : `HTTP ${response.status}: ${String(value.error ?? 'request rejected')}`);
    } catch (error) { setRuntimeCheck(error instanceof Error ? error.message : 'Runtime request failed.'); }
    finally { setBusy(false); }
  };
  return (
    <main style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1.5rem' }}>
      <h1>Pair local workspace</h1>
      <p>{message}</p>
      {status ? (
        <section aria-label="paired workspace">
          <p>Realm: <strong>{status.realm_id}</strong></p>
          <p>Session expires: <time dateTime={new Date(status.expires_at).toISOString()}>{new Date(status.expires_at).toLocaleString()}</time></p>
          <button type="button" disabled={busy} onClick={() => void checkRuntime()}>Check local workspace</button>{' '}
          <button type="button" disabled={busy} onClick={() => void revoke()}>Revoke pairing</button>
          {runtimeCheck ? <p role="status">Runtime: {runtimeCheck}</p> : null}
        </section>
      ) : <p>Run <code>npm run dev:local -- --paired</code> with the configured relay origin, then open its invitation link.</p>}
    </main>
  );
}
