import { describe, expect, it, vi } from 'vitest';

import {
  AstridLocalDiagnosticRoutes,
  parseAstridDiagnostic,
  type AstridDiagnostic,
} from './diagnosticRoutes.ts';
import type { AstridBridgeTransport } from './transport.ts';
import { ASTRID_C2_CANONICAL_DIGEST } from '@/integrations/runtime/contract-metadata.ts';

const observedAt = '2026-09-24T10:00:00.000Z';

function fact(value: string | boolean | number): AstridDiagnostic['facts']['runtime'] {
  return { observed: true, value, observedAt, unavailableReason: null };
}

function unknownFact(): AstridDiagnostic['facts']['runtime'] {
  return { observed: false, value: null, observedAt: null, unavailableReason: 'not-observed' };
}

function diagnostic(overrides: Partial<AstridDiagnostic> = {}): AstridDiagnostic {
  const facts: AstridDiagnostic['facts'] = {
    workspace: unknownFact(),
    runtime: fact('ready'),
    computeWorker: unknownFact(),
    selectedCapability: unknownFact(),
    authorization: unknownFact(),
    taskState: unknownFact(),
    contact: fact('fresh'),
    progress: unknownFact(),
    terminalResult: unknownFact(),
    providerExecution: unknownFact(),
    providerBilling: unknownFact(),
    optionalContributionAuth: unknownFact(),
    hostedSessionAndGrants: unknownFact(),
  };
  return {
    schemaVersion: 2,
    contractRevision: 'C2',
    contractDigest: ASTRID_C2_CANONICAL_DIGEST,
    mode: 'local',
    collectedAt: observedAt,
    timing: {
      deadlineScope: 'total-including-all-helpers',
      deadlineMs: 5000,
      elapsedMs: 12,
      timedOut: false,
    },
    problemCode: null,
    failureBoundary: null,
    facts,
    limits: { maxEvents: 200, maxLogBytes: 65536, maxBundleBytes: 1048576 },
    captured: { events: 0, logBytes: 0, bundleBytes: 0 },
    truncated: false,
    nextActions: [],
    actionsExecuted: [],
    redacted: false,
    ...overrides,
  };
}

describe('Astrid C2 diagnostic consumer', () => {
  it('reads through the shared transport and preserves the typed projection', async () => {
    const payload = diagnostic();
    const requestJson = vi.fn(async () => payload);
    const routes = new AstridLocalDiagnosticRoutes({ requestJson } as unknown as AstridBridgeTransport);

    await expect(routes.get()).resolves.toEqual(payload);
    expect(requestJson).toHaveBeenCalledWith(
      '/v1/diagnostic?mode=local', {}, expect.anything(), 'Astrid C2 diagnostic',
    );
  });

  it('requires paired failure semantics and preserves unknown independent facts', () => {
    const valid = diagnostic({
      problemCode: 'runtime_unavailable',
      failureBoundary: 'runtime-contact',
      facts: {
        ...diagnostic().facts,
        runtime: { observed: false, value: null, observedAt: null, unavailableReason: 'connection refused' },
      },
      nextActions: [{
        commandId: 'runtime-up',
        arguments: [],
        effects: ['start-stop-local-service', 'configure-install', 'write-relocate-change-data'],
        authorizationRequired: true,
        executable: true,
      }],
    });
    expect(parseAstridDiagnostic(valid)).toEqual(valid);
    expect(() => parseAstridDiagnostic({ ...valid, failureBoundary: null })).toThrow('must be paired');
  });

  it('rejects unredacted shared actions and captured values over declared limits', () => {
    const shared = diagnostic({ mode: 'shared', redacted: false });
    expect(() => parseAstridDiagnostic(shared)).toThrow('must be redacted');

    const executableSharedAction = diagnostic({
      mode: 'shared',
      redacted: true,
      nextActions: [{
        commandId: 'setup-check',
        arguments: [],
        effects: ['observe'],
        authorizationRequired: false,
        executable: true,
      }],
    });
    expect(() => parseAstridDiagnostic(executableSharedAction)).toThrow('must be inert');

    const overLimit = diagnostic({ captured: { events: 201, logBytes: 0, bundleBytes: 0 } });
    expect(() => parseAstridDiagnostic(overLimit)).toThrow('exceed declared limits');
  });
});
