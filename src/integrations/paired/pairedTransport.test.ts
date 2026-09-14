import { createServer, request as httpRequestFn } from 'node:http';
import { WebSocket } from 'ws';
import { describe, expect, it } from 'vitest';
import { classifyPairedRoute, isSafeForwardPath } from '../../../config/vite/pairedRoutePolicy';
import { PairingError, PairingRegistry } from '../../../config/vite/pairedRegistry';
import { PairedRelay } from '../../../config/vite/pairedRelay';

function httpRequest(port: number, path: string, method: string, origin: string, headers: Record<string, string> = {}, body = ''): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequestFn({ hostname: '127.0.0.1', port, path, method, headers: { Origin: origin, ...headers, ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) } }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

describe('paired transport boundary', () => {
  it('keeps the forwarding table closed and rejects destination tricks', () => {
    expect(classifyPairedRoute('/api/runtime/v1/health', 'GET')?.service).toBe('runtime');
    expect(classifyPairedRoute('/api/runtime/v1/projects/p1/documents/d1', 'PATCH')?.service).toBe('runtime');
    expect(classifyPairedRoute('/api/runtime/v1/projects/p1/objects', 'POST')?.stream).toBe(true);
    expect(classifyPairedRoute('/api/runtime/v1/doctor', 'GET')).toBeNull();
    expect(classifyPairedRoute('/api/runtime/v1/tasks/claim', 'POST')).toBeNull();
    expect(classifyPairedRoute('/api/runtime/v1/export?destination=/tmp/x', 'GET')).toBeNull();
    expect(classifyPairedRoute('/api/runtime/http://127.0.0.1:1/v1/health', 'GET')).toBeNull();
    expect(classifyPairedRoute('/api/astrid/v1/capabilities?limit=50', 'GET')?.service).toBe('astrid');
    expect(isSafeForwardPath('/api/runtime/v1/objects/a%2Fb')).toBe(false);
  });

  it('consumes invitations once and fences revoked sessions', () => {
    let now = 1_000;
    const registry = new PairingRegistry(() => now);
    const connection = {};
    const connected = registry.connectConnector({ connectorId: 'connector-1', realmId: 'realm-1', connectorSecret: 'connector-secret', connection });
    expect(connected.invitation?.code).toHaveLength(43);
    const redeemed = registry.redeemInvitation(connected.invitation!.code);
    expect(registry.authorizeSession(redeemed.sessionToken).realmId).toBe('realm-1');
    expect(() => registry.redeemInvitation(connected.invitation!.code)).toThrowError(PairingError);
    registry.revoke(redeemed.pair.pairId);
    expect(() => registry.authorizeSession(redeemed.sessionToken)).toThrow();
    now += 9 * 60 * 60 * 1000;
    expect(registry.getPair(redeemed.pair.pairId)).toBeUndefined();
  });

  it('expires pending invitations and sessions at their configured bounds', () => {
    let now = 1_000;
    const registry = new PairingRegistry(() => now);
    const connected = registry.connectConnector({ connectorId: 'connector-1', realmId: 'realm-1', connectorSecret: 'secret-1' });
    now += 5 * 60 * 1000;
    expect(() => registry.redeemInvitation(connected.invitation!.code)).toThrowError(
      expect.objectContaining({ code: 'expired_invitation' }),
    );

    now = 1_000;
    const next = registry.connectConnector({ connectorId: 'connector-1', realmId: 'realm-1', connectorSecret: 'secret-1' });
    const redemption = registry.redeemInvitation(next.invitation!.code);
    now += 8 * 60 * 60 * 1000;
    expect(() => registry.authorizeSession(redemption.sessionToken)).toThrowError(
      expect.objectContaining({ code: 'expired_session' }),
    );
  });

  it('enforces invitation and session expiry through the live relay handler', async () => {
    let now = 1_000;
    const config = { origin: '', loopbackTest: true, enabled: true };
    const relay = new PairedRelay(config, () => now);
    const server = createServer(relay.handler());
    relay.installUpgrade(server as never);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('live relay did not bind a TCP port');
    const port = address.port;
    config.origin = `http://127.0.0.1:${port}`;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/pairing/connector`);
    try {
      const hello = new Promise<Record<string, unknown>>((resolve, reject) => {
        socket.once('message', (raw) => resolve(JSON.parse(raw.toString()) as Record<string, unknown>));
        socket.once('error', reject);
      });
      await new Promise<void>((resolve, reject) => {
        socket.once('open', () => {
          socket.send(JSON.stringify({ type: 'connector_hello', connector_id: 'live-connector', connector_secret: 'live-secret', realm_id: 'live-realm' }));
          resolve();
        });
        socket.once('error', reject);
      });
      const acknowledged = await hello;
      expect(acknowledged.type).toBe('connector_hello_ack');
      const invitation = String(acknowledged.invitation);
      const pending = relay.registry.createInvitation('live-connector');
      now += 5 * 60 * 1000;
      const expiredInvitation = await httpRequest(port, '/api/pairing/redeem', 'POST', config.origin, { 'Content-Type': 'application/json' }, JSON.stringify({ invitation: pending.code }));
      expect(expiredInvitation.status).toBe(410);
      expect(JSON.parse(expiredInvitation.body).error).toBe('expired_invitation');

      now = 1_000;
      const redeemed = await httpRequest(port, '/api/pairing/redeem', 'POST', config.origin, { 'Content-Type': 'application/json' }, JSON.stringify({ invitation }));
      expect(redeemed.status).toBe(200);
      const cookie = String(redeemed.headers['set-cookie']).split(';', 1)[0];
      now += 8 * 60 * 60 * 1000;
      const expiredSession = await httpRequest(port, '/api/pairing/status', 'GET', config.origin, { Cookie: cookie });
      expect(expiredSession.status).toBe(401);
      expect(JSON.parse(expiredSession.body).error).toBe('expired_session');
    } finally {
      socket.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('reconnects only with the separate connector secret and advances generation', () => {
    const registry = new PairingRegistry(() => 1_000);
    const first = registry.connectConnector({ connectorId: 'connector-1', realmId: 'realm-1', connectorSecret: 'secret-1' });
    const firstGeneration = first.connector.generation;
    const redemption = registry.redeemInvitation(first.invitation!.code);
    const pair = redemption.pair;
    const second = registry.connectConnector({ connectorId: 'connector-1', realmId: 'realm-1', connectorSecret: 'secret-1' });
    expect(second.connector.generation).toBeGreaterThan(firstGeneration);
    expect(registry.authorizeSession(redemption.sessionToken).generation).toBe(second.connector.generation);
    expect(() => registry.authorizeConnector(pair.pairId, 'wrong-secret', second.connector.generation)).toThrow();
  });

  it('invalidates every invitation and the connector credential on revoke', () => {
    const registry = new PairingRegistry(() => 1_000);
    const first = registry.connectConnector({ connectorId: 'connector-1', realmId: 'realm-1', connectorSecret: 'secret-1' });
    const secondInvitation = registry.createInvitation('connector-1');
    const redemption = registry.redeemInvitation(first.invitation!.code);
    registry.revoke(redemption.pair.pairId);
    expect(() => registry.redeemInvitation(secondInvitation.code)).toThrowError(PairingError);
    expect(() => registry.connectConnector({ connectorId: 'connector-1', realmId: 'realm-1', connectorSecret: 'secret-1' })).toThrowError(PairingError);
  });
});
