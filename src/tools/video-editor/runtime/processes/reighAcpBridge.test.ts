import { describe, expect, it } from 'vitest';
import type { JsonRpcProcessLike } from './jsonRpcStdioTransport.ts';
import {
  ASTRID_ACP_COMMAND,
  createAstridAcpProcessHost,
} from './astridAcpLauncher.ts';
import {
  createReighAcpHttpServer,
  resolveReighAcpBridgeConfig,
  type ReighAcpBridgeConfig,
} from '../../../../../scripts/reigh-acp-bridge.ts';

type Listener = (...args: unknown[]) => void;

class FakeReadable {
  private readonly listeners = new Map<string, Listener[]>();

  on(event: string, listener: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
}

class FakeWritable {
  readonly writes: string[] = [];
  ended = false;

  write(chunk: string): boolean {
    this.writes.push(chunk);
    return true;
  }

  end(): void {
    this.ended = true;
  }
}

class FakeProcess {
  readonly stdin = new FakeWritable();
  readonly stdout = new FakeReadable();
  private readonly listeners = new Map<string, Listener[]>();

  on(event: string, listener: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  kill(): boolean {
    return true;
  }

  asProcess(): JsonRpcProcessLike {
    return this as unknown as JsonRpcProcessLike;
  }
}

function lastRequest(process: FakeProcess): Record<string, unknown> {
  const line = process.stdin.writes.at(-1);
  if (!line) throw new Error('expected an ACP request');
  return JSON.parse(line) as Record<string, unknown>;
}

function respond(process: FakeProcess, id: unknown, result: unknown): void {
  process.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function waitForRequest(process: FakeProcess, after = 0): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (process.stdin.writes.length > after) return;
    await tick();
  }
  throw new Error('expected an ACP request');
}

async function listen(server: ReturnType<typeof createReighAcpHttpServer>['server']): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('expected a TCP server address');
  return address.port;
}

function headers(token = 'test-token'): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'X-Astrid-Bridge-Version': 'v1',
    'Content-Type': 'application/json',
  };
}

describe('Reigh ACP HTTP bridge', () => {
  it('defaults to OMP canonical session storage when no override is configured', () => {
    expect(resolveReighAcpBridgeConfig({
      ASTRID_BRIDGE_TOKEN: 'test-token',
      ASTRID_ACP_CWD: '/tmp/reigh-canonical-project',
      ASTRID_ACP_PROFILE: 'astrid',
    })).toMatchObject({
      token: 'test-token',
      cwd: '/tmp/reigh-canonical-project',
      profile: 'astrid',
    });
    expect(resolveReighAcpBridgeConfig({
      ASTRID_BRIDGE_TOKEN: 'test-token',
      ASTRID_ACP_CWD: '/tmp/reigh-canonical-project',
      ASTRID_ACP_PROFILE: 'astrid',
      ASTRID_ACP_SESSION_DIR: '/tmp/reigh-legacy-sessions',
    }).sessionDir).toBe('/tmp/reigh-legacy-sessions');
  });

  it('forwards browser lifecycle controls with host-owned cwd and ephemeral connection identity', async () => {
    const first = new FakeProcess();
    const second = new FakeProcess();
    const processes = [first, second];
    const config: ReighAcpBridgeConfig = {
      token: 'test-token',
      port: 0,
      cwd: '/tmp/reigh-project',
      profile: 'astrid',
      sessionDir: '/tmp/reigh-sessions',
      systemPromptFile: '/tmp/astrid.md',
      command: ASTRID_ACP_COMMAND,
    };
    const { bridge, server } = createReighAcpHttpServer({
      config,
      idFactory: (() => {
        let index = 0;
        return () => `connection-${++index}`;
      })(),
      hostFactory: (options) => createAstridAcpProcessHost({
        ...options,
        fileIsRegularFile: () => true,
        spawnProcess: () => {
          const process = processes.shift();
          if (!process) throw new Error('no fake ACP process remains');
          return process.asProcess();
        },
      }),
    });
    const port = await listen(server);
    const base = `http://127.0.0.1:${port}`;

    const unauthorized = await fetch(`${base}/health`);
    expect(unauthorized.status).toBe(401);

    const connecting = fetch(`${base}/connect`, { method: 'POST', headers: headers(), body: '{}' });
    await waitForRequest(first);
    const initialize = lastRequest(first);
    expect(initialize).toMatchObject({ method: 'initialize', params: { protocolVersion: 1 } });
    respond(first, initialize.id, { agentCapabilities: { loadSession: true } });
    const connected = await (await connecting).json() as { connection_id: string; initialize: unknown };
    expect(connected).toMatchObject({ connection_id: 'connection-1' });

    const afterInitialize = first.stdin.writes.length;
    const creating = fetch(`${base}/connection-1/rpc`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ method: 'session/new', params: { cwd: '/tmp/browser-must-not-redirect' } }),
    });
    await waitForRequest(first, afterInitialize);
    const newSession = lastRequest(first);
    expect(newSession).toMatchObject({
      method: 'session/new',
      params: { cwd: '/tmp/reigh-project', mcpServers: [] },
    });
    respond(first, newSession.id, { sessionId: 'omp-session-opaque' });
    await expect((await creating).json()).resolves.toEqual({ result: { sessionId: 'omp-session-opaque' } });

    const reconnecting = fetch(base + '/connection-1/reconnect', { method: 'POST', headers: headers(), body: '{}' });
    expect(await (await reconnecting).json()).toEqual({ connection_id: 'connection-1', reused: true });

    const afterReconnect = first.stdin.writes.length;
    const resuming = fetch(base + '/connection-1/rpc', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ method: 'session/resume', params: { sessionId: 'omp-session-opaque' } }),
    });
    await waitForRequest(first, afterReconnect);
    const resume = lastRequest(first);
    expect(resume).toMatchObject({
      method: 'session/resume',
      params: { sessionId: 'omp-session-opaque', cwd: '/tmp/reigh-project', mcpServers: [] },
    });
    respond(first, resume.id, { sessionId: 'omp-session-opaque' });
    await expect((await resuming).json()).resolves.toEqual({ result: { sessionId: 'omp-session-opaque' } });

    const afterResume = first.stdin.writes.length;
    const prompting = fetch(`${base}/connection-1/rpc`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({
        method: 'session/prompt',
        params: { sessionId: 'omp-session-opaque', prompt: [{ type: 'text', text: 'hello Astrid' }] },
      }),
    });
    await waitForRequest(first, afterResume);
    const prompt = lastRequest(first);
    expect(prompt).toMatchObject({
      method: 'session/prompt',
      params: { sessionId: 'omp-session-opaque', prompt: [{ type: 'text', text: 'hello Astrid' }] },
    });
    respond(first, prompt.id, { stopReason: 'end_turn' });
    await expect((await prompting).json()).resolves.toEqual({ result: { stopReason: 'end_turn' } });

    const afterPrompt = first.stdin.writes.length;
    const cancelling = fetch(`${base}/connection-1/cancel`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ sessionId: 'omp-session-opaque' }),
    });
    await waitForRequest(first, afterPrompt);
    const cancel = lastRequest(first);
    expect(cancel).toMatchObject({ method: 'session/cancel', params: { sessionId: 'omp-session-opaque' } });
    const cancelResponse = await cancelling;
    expect(cancelResponse.status).toBe(200);
    expect(await cancelResponse.json()).toEqual({ cancelled: true, session_id: 'omp-session-opaque' });

    const afterCancel = first.stdin.writes.length;
    const closing = fetch(`${base}/connection-1/rpc`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ method: 'session/close', params: { sessionId: 'omp-session-opaque' } }),
    });
    await waitForRequest(first, afterCancel);
    const close = lastRequest(first);
    expect(close).toMatchObject({ method: 'session/close', params: { sessionId: 'omp-session-opaque' } });
    respond(first, close.id, {});
    await expect((await closing).json()).resolves.toEqual({ result: {} });

    const secondConnecting = fetch(`${base}/connect`, { method: 'POST', headers: headers(), body: '{}' });
    await waitForRequest(second);
    const secondInitialize = lastRequest(second);
    respond(second, secondInitialize.id, { agentCapabilities: { loadSession: true } });
    await expect((await secondConnecting).json()).resolves.toMatchObject({ connection_id: 'connection-2' });

    const disconnected = await fetch(`${base}/connection-1`, { method: 'DELETE', headers: headers() });
    expect(disconnected.status).toBe(200);
    expect(await disconnected.json()).toEqual({ connection_id: 'connection-1', closed: true });

    await bridge.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('answers local permission and terminal callbacks instead of forcing ACP fallback retries', async () => {
    const fakeProcess = new FakeProcess();
    const config: ReighAcpBridgeConfig = {
      token: 'test-token',
      port: 0,
      cwd: globalThis.process.cwd(),
      profile: 'astrid',
      systemPromptFile: '/tmp/astrid.md',
      command: ASTRID_ACP_COMMAND,
    };
    const { bridge, server } = createReighAcpHttpServer({
      config,
      hostFactory: (options) => createAstridAcpProcessHost({
        ...options,
        fileIsRegularFile: () => true,
        spawnProcess: () => fakeProcess.asProcess(),
      }),
    });
    const port = await listen(server);
    const base = `http://127.0.0.1:${port}`;

    const connecting = fetch(`${base}/connect`, { method: 'POST', headers: headers(), body: '{}' });
    await waitForRequest(fakeProcess);
    const initialize = lastRequest(fakeProcess);
    respond(fakeProcess, initialize.id, { agentCapabilities: { loadSession: true } });
    await connecting;

    const afterInitialize = fakeProcess.stdin.writes.length;
    fakeProcess.stdout.emit('data', `${JSON.stringify({
      jsonrpc: '2.0',
      id: 'permission-1',
      method: 'session/request_permission',
      params: { toolCall: { title: 'astrid-tools timelines show --summary', kind: 'execute' } },
    })}\n`);
    await waitForRequest(fakeProcess, afterInitialize);
    expect(lastRequest(fakeProcess)).toMatchObject({
      id: 'permission-1',
      result: { outcome: { outcome: 'selected', optionId: 'allow_always' } },
    });

    const afterPermission = fakeProcess.stdin.writes.length;
    fakeProcess.stdout.emit('data', `${JSON.stringify({
      jsonrpc: '2.0',
      id: 'terminal-1',
      method: 'terminal/create',
      params: { command: '/bin/echo', args: ['bridge-ok'], cwd: globalThis.process.cwd() },
    })}\n`);
    await waitForRequest(fakeProcess, afterPermission);
    const terminalCreate = lastRequest(fakeProcess) as { result?: { terminalId?: string } };
    expect(terminalCreate.result?.terminalId).toEqual(expect.any(String));
    const terminalId = terminalCreate.result!.terminalId!;

    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    const afterCreate = fakeProcess.stdin.writes.length;
    fakeProcess.stdout.emit('data', `${JSON.stringify({
      jsonrpc: '2.0',
      id: 'terminal-output-1',
      method: 'terminal/output',
      params: { terminalId },
    })}\n`);
    await waitForRequest(fakeProcess, afterCreate);
    expect(lastRequest(fakeProcess)).toMatchObject({
      id: 'terminal-output-1',
      result: { output: 'bridge-ok\n', truncated: false, exitStatus: { exitCode: 0, signal: null } },
    });

    await bridge.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
});
