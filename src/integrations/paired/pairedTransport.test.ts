import { describe, expect, it } from 'vitest';
import { classifyPairedRoute, isSafeForwardPath } from '../../../config/vite/pairedRoutePolicy';
import { PairingError, PairingRegistry } from '../../../config/vite/pairedRegistry';

describe('paired transport boundary', () => {
  it('keeps the forwarding table closed and rejects destination tricks', () => {
    expect(classifyPairedRoute('/api/runtime/v1/health', 'GET')?.service).toBe('runtime');
    expect(classifyPairedRoute('/api/runtime/v1/projects/p1/documents/d1', 'PATCH')?.service).toBe('runtime');
    expect(classifyPairedRoute('/api/runtime/v1/doctor', 'GET')).toBeNull();
    expect(classifyPairedRoute('/api/runtime/v1/tasks/claim', 'POST')).toBeNull();
    expect(classifyPairedRoute('/api/runtime/v1/export?destination=/tmp/x', 'GET')).toBeNull();
    expect(classifyPairedRoute('/api/runtime/http://127.0.0.1:1/v1/health', 'GET')).toBeNull();
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
});
