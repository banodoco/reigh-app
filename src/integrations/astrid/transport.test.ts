// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';

import { BridgeContractError } from '@/tools/video-editor/data/bridgeContract.ts';
import {
  AstridBridgeTransport,
  BridgeRouteError,
  BridgeTransportFailure,
  type BridgeRequestInit,
} from './transport';

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe('Astrid bridge transport boundary', () => {
  it.each([
    [429, 'rate_limited'],
    [413, 'payload_too_large'],
  ])('preserves typed upstream %s errors without fallback', async (status, code) => {
    const server = createServer((_request, response) => {
      response.writeHead(status, {
        'Content-Type': 'application/json',
        ...(status === 429 ? { 'Retry-After': '1' } : {}),
      });
      response.end(JSON.stringify({ error: code, detail: 'server boundary' }));
    });
    const baseUrl = await listen(server);
    try {
      const transport = new AstridBridgeTransport({ baseUrl });
      const error = await transport.requestJson(
        '/projects/demo-project/timelines/timeline',
        {},
        z.object({ ok: z.boolean() }),
        'load timeline',
      ).catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(BridgeRouteError);
      expect(error).toMatchObject({ status, code });
      // `rate_limited` is an Astrid wire code, not one of Reigh's public
      // recovery categories; preserve it without relabeling as conflict.
      if (code === 'rate_limited') expect(error).toMatchObject({ category: 'unknown' });
    } finally {
      await close(server);
    }
  });

  it('sends raw bytes unchanged while keeping JSON serialization explicit', async () => {
    const observed: Array<{ body: Uint8Array; contentType: string | null; idempotencyKey: string | null }> = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        observed.push({
          body: new Uint8Array(Buffer.concat(chunks)),
          contentType: typeof request.headers['content-type'] === 'string'
            ? request.headers['content-type']
            : null,
          idempotencyKey: typeof request.headers['idempotency-key'] === 'string'
            ? request.headers['idempotency-key']
            : null,
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: true }));
      });
    });
    const baseUrl = await listen(server);
    try {
      const transport = new AstridBridgeTransport({ baseUrl });
      await transport.requestRaw('/v1/upload', {
        method: 'POST',
        rawBody: new Uint8Array([0, 255, 1]),
        headers: {
          'Content-Type': 'image/png',
          'Idempotency-Key': 'cas:test',
          'X-Original-Name': 'input.png',
        },
      });
      await transport.requestJson('/health', {
        method: 'POST',
        body: { ok: true },
      }, z.object({ ok: z.boolean() }), 'json');
      expect(observed[0]).toEqual({
        body: new Uint8Array([0, 255, 1]),
        contentType: 'image/png',
        idempotencyKey: 'cas:test',
      });
      expect(observed[1].body).toEqual(new Uint8Array(Buffer.from('{"ok":true}')));
      expect(observed[1].contentType).toBe('application/json');
      await expect(transport.requestRaw('/v1/upload', {
        method: 'POST',
        body: { invalid: true },
        rawBody: new Uint8Array([1]),
      } as BridgeRequestInit)).rejects.toThrow('both body and rawBody');
    } finally {
      await close(server);
    }
  });

  it('aborts a slow bridge request and releases the client request', async () => {
    let requestClosed: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => { requestClosed = resolve; });
    const timer = { value: undefined as ReturnType<typeof setTimeout> | undefined };
    const server = createServer((request, response) => {
      request.once('close', requestClosed);
      timer.value = setTimeout(() => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: true }));
      }, 1_000);
    });
    const baseUrl = await listen(server);
    try {
      const transport = new AstridBridgeTransport({ baseUrl, timeoutMs: 25 });
      await expect(transport.requestJson(
        '/health',
        {},
        z.object({ ok: z.boolean() }),
        'health',
      )).rejects.toBeInstanceOf(BridgeTransportFailure);
      await expect(closed).resolves.toBeUndefined();
    } finally {
      if (timer.value) clearTimeout(timer.value);
      await close(server);
    }
  });

  it.each([
    ['malformed JSON', '{"ok":'],
    ['truncated JSON', '{"ok": true'],
  ])('rejects a %s success response as a contract failure', async (_label, body) => {
    const server = createServer((_request, response) => {
      response.writeHead(200, {
        'Content-Type': 'application/json',
        // A short declared body exercises the same fetch consumption path as
        // a peer that disconnects during a streamed JSON response.
        'Content-Length': String(body.length + 8),
        Connection: 'close',
      });
      response.end(body);
    });
    const baseUrl = await listen(server);
    try {
      const transport = new AstridBridgeTransport({ baseUrl });
      await expect(transport.requestJson(
        '/health',
        {},
        z.object({ ok: z.boolean() }),
        'health',
      )).rejects.toBeInstanceOf(BridgeContractError);
    } finally {
      await close(server);
    }
  });
});
