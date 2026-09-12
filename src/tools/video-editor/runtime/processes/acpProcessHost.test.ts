import { describe, expect, it } from 'vitest';
import type { JsonRpcProcessLike } from './jsonRpcStdioTransport.ts';
import {
  AcpProcessHost,
  type AcpProcessSpawnOptions,
} from './acpProcessHost.ts';

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

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('AcpProcessHost', () => {
  it('forwards initialize/new/close and preserves the opaque OMP session id', async () => {
    const process = new FakeProcess();
    const host = new AcpProcessHost({ process: process.asProcess(), requestTimeoutMs: 1_000 });

    const initializePromise = host.initialize<{ agentCapabilities: { loadSession: boolean } }>({
      protocolVersion: 1,
      clientCapabilities: {},
    });
    await flush();
    const initializeRequest = lastRequest(process);
    expect(initializeRequest).toMatchObject({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    respond(process, initializeRequest.id, { agentCapabilities: { loadSession: true } });
    await expect(initializePromise).resolves.toEqual({ agentCapabilities: { loadSession: true } });

    const newSessionPromise = host.newSession<{ sessionId: string }>({ cwd: '/tmp/reigh', mcpServers: [] });
    await flush();
    const newSessionRequest = lastRequest(process);
    expect(newSessionRequest).toMatchObject({ method: 'session/new', params: { cwd: '/tmp/reigh' } });
    respond(process, newSessionRequest.id, { sessionId: 'omp-owned-session-opaque' });
    await expect(newSessionPromise).resolves.toEqual({ sessionId: 'omp-owned-session-opaque' });

    const closePromise = host.closeSession({ sessionId: 'omp-owned-session-opaque' });
    await flush();
    const closeRequest = lastRequest(process);
    expect(closeRequest).toMatchObject({ method: 'session/close', params: { sessionId: 'omp-owned-session-opaque' } });
    respond(process, closeRequest.id, {});
    await expect(closePromise).resolves.toEqual({});
    await host.dispose();
    expect(process.stdin.ended).toBe(true);
  });

  it('forwards notifications and answers explicit permission callbacks without ambient authority', async () => {
    const notifications: Record<string, unknown>[] = [];
    const process = new FakeProcess();
    const host = new AcpProcessHost({
      process: process.asProcess(),
      callbacks: {
        onNotification: (notification) => notifications.push(notification),
        requestPermission: async (params) => ({ outcome: 'selected', optionId: 'allow-once', params }),
      },
    });
    await host.connect();

    process.stdout.emit('data', `${JSON.stringify({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { sessionId: 'omp-owned-session-opaque', update: { kind: 'agent_message_chunk' } },
    })}\n`);
    process.stdout.emit('data', `${JSON.stringify({
      jsonrpc: '2.0',
      id: 77,
      method: 'session/request_permission',
      params: { sessionId: 'omp-owned-session-opaque', options: [{ optionId: 'allow-once' }] },
    })}\n`);
    await flush();

    expect(notifications).toEqual([expect.objectContaining({ method: 'session/update' })]);
    expect(lastRequest(process)).toMatchObject({
      jsonrpc: '2.0',
      id: 77,
      result: { outcome: 'selected', optionId: 'allow-once' },
    });
    await host.dispose();
  });

  it('fails closed when a required filesystem callback is absent', async () => {
    const process = new FakeProcess();
    const host = new AcpProcessHost({ process: process.asProcess() });
    await host.connect();
    process.stdout.emit('data', `${JSON.stringify({
      jsonrpc: '2.0',
      id: 9,
      method: 'fs/read_text_file',
      params: { path: '/tmp/no-read-authority' },
    })}\n`);
    await flush();
    expect(lastRequest(process)).toMatchObject({
      id: 9,
      error: { code: -32001, message: expect.stringContaining('unavailable') },
    });
    await host.dispose();
  });

  it('rejects pending calls when the owned process disconnects and builds the explicit omp acp launch', async () => {
    const process = new FakeProcess();
    let spawnOptions: AcpProcessSpawnOptions | undefined;
    const host = new AcpProcessHost({
      command: '/Users/hannahomalley/.bun/bin/omp',
      cwd: '/tmp/reigh-project',
      profile: 'reigh-profile',
      sessionDir: '/tmp/reigh-sessions',
      spawnProcess: (options) => {
        spawnOptions = options;
        return process.asProcess();
      },
      requestTimeoutMs: 1_000,
    });
    const pending = host.listSessions();
    await flush();
    expect(spawnOptions).toEqual({
      command: '/Users/hannahomalley/.bun/bin/omp',
      args: ['acp', '--profile', 'reigh-profile', '--session-dir', '/tmp/reigh-sessions'],
      cwd: '/tmp/reigh-project',
      env: undefined,
    });
    process.emit('exit', 1, null);
    await expect(pending).rejects.toMatchObject({ code: 'acp_process_exited' });
    await host.dispose();
  });
});
