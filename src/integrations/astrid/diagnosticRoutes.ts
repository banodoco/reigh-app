import { z } from 'zod';
import {
  ASTRID_C2_CANONICAL_DIGEST,
} from '@/integrations/runtime/contract-metadata.ts';
import type { AstridBridgeTransport } from './transport.ts';

const diagnosticFactSchema = z.strictObject({
  observed: z.boolean(),
  value: z.union([z.string(), z.boolean(), z.number().finite(), z.null()]),
  observedAt: z.string().datetime({ offset: true }).nullable(),
  unavailableReason: z.string().nullable(),
});

const diagnosticFactsSchema = z.strictObject({
  workspace: diagnosticFactSchema,
  runtime: diagnosticFactSchema,
  computeWorker: diagnosticFactSchema,
  selectedCapability: diagnosticFactSchema,
  authorization: diagnosticFactSchema,
  taskState: diagnosticFactSchema,
  contact: diagnosticFactSchema,
  progress: diagnosticFactSchema,
  terminalResult: diagnosticFactSchema,
  providerExecution: diagnosticFactSchema,
  providerBilling: diagnosticFactSchema,
  optionalContributionAuth: diagnosticFactSchema,
  hostedSessionAndGrants: diagnosticFactSchema,
});

const diagnosticActionSchema = z.strictObject({
  commandId: z.string().min(1),
  arguments: z.array(z.string()),
  effects: z.array(z.string()).min(1),
  authorizationRequired: z.boolean(),
  executable: z.boolean(),
});

export const astridDiagnosticSchema = z.strictObject({
  schemaVersion: z.literal(2),
  contractRevision: z.literal('C2'),
  contractDigest: z.literal(ASTRID_C2_CANONICAL_DIGEST),
  mode: z.enum(['local', 'shared']),
  collectedAt: z.string().datetime({ offset: true }),
  timing: z.strictObject({
    deadlineScope: z.literal('total-including-all-helpers'),
    deadlineMs: z.number().int().min(1).max(5000),
    elapsedMs: z.number().int().min(0),
    timedOut: z.boolean(),
  }),
  problemCode: z.string().min(1).nullable(),
  failureBoundary: z.string().min(1).nullable(),
  facts: diagnosticFactsSchema,
  limits: z.strictObject({
    maxEvents: z.number().int().min(0).max(200),
    maxLogBytes: z.number().int().min(0).max(65536),
    maxBundleBytes: z.number().int().min(0).max(1048576),
  }),
  captured: z.strictObject({
    events: z.number().int().min(0),
    logBytes: z.number().int().min(0),
    bundleBytes: z.number().int().min(0),
  }),
  truncated: z.boolean(),
  nextActions: z.array(diagnosticActionSchema),
  actionsExecuted: z.array(z.never()),
  redacted: z.boolean(),
});

export type AstridDiagnostic = z.infer<typeof astridDiagnosticSchema>;

/**
 * Parse Astrid's already-public C2 JSON projection without mutating it.
 * Runtime/Astrid own collection and command-effect truth; this is only the
 * app's typed, fail-closed boundary.
 */
export function parseAstridDiagnostic(value: unknown): AstridDiagnostic {
  const diagnostic = astridDiagnosticSchema.parse(value);
  const healthy = diagnostic.problemCode === null && diagnostic.failureBoundary === null;
  const failed = diagnostic.problemCode !== null && diagnostic.failureBoundary !== null;
  if (!healthy && !failed) {
    throw new Error('Astrid C2 diagnostic problemCode and failureBoundary must be paired');
  }
  if (diagnostic.mode === 'shared' && !diagnostic.redacted) {
    throw new Error('Astrid shared C2 diagnostics must be redacted');
  }
  if (diagnostic.mode === 'local' && diagnostic.redacted) {
    throw new Error('Astrid local C2 diagnostics must not claim shared redaction');
  }
  if (diagnostic.timing.elapsedMs > diagnostic.timing.deadlineMs) {
    throw new Error('Astrid C2 diagnostic elapsed time exceeds its deadline');
  }
  if (diagnostic.captured.events > diagnostic.limits.maxEvents
    || diagnostic.captured.logBytes > diagnostic.limits.maxLogBytes
    || diagnostic.captured.bundleBytes > diagnostic.limits.maxBundleBytes) {
    throw new Error('Astrid C2 diagnostic captured values exceed declared limits');
  }
  for (const [name, fact] of Object.entries(diagnostic.facts)) {
    if (fact.observed) {
      if (fact.value === null || fact.observedAt === null || fact.unavailableReason !== null) {
        throw new Error(`Astrid C2 observed fact ${name} is incomplete`);
      }
    } else if (fact.value !== null || fact.observedAt !== null || !fact.unavailableReason?.trim()) {
      throw new Error(`Astrid C2 unobserved fact ${name} must remain unknown`);
    }
  }
  if (diagnostic.mode === 'shared' && diagnostic.nextActions.some((action) => action.executable)) {
    throw new Error('Astrid shared C2 diagnostic actions must be inert');
  }
  if (diagnostic.nextActions.some((action) => action.effects.some((effect) => effect !== 'observe')
    && !action.authorizationRequired)) {
    throw new Error('Astrid effectful C2 diagnostic suggestions require authorization');
  }
  return diagnostic;
}

/** Adapter for callers that already own the bridge response/status envelope. */
export function parseAstridDiagnosticResponse(value: unknown): AstridDiagnostic {
  return parseAstridDiagnostic(value);
}

/**
 * Read the public C2 projection through the shared Astrid transport. This
 * adapter owns neither Runtime state nor command execution; Runtime remains
 * the sole authority for workspace, task, attempt, binding, and settlement
 * facts exposed by the projection.
 */
export class AstridLocalDiagnosticRoutes {
  constructor(private readonly transport: AstridBridgeTransport) {}

  async get(mode: AstridDiagnostic['mode'] = 'local'): Promise<AstridDiagnostic> {
    const query = new URLSearchParams({ mode }).toString();
    const payload = await this.transport.requestJson(
      `/v1/diagnostic?${query}`,
      {},
      astridDiagnosticSchema,
      'Astrid C2 diagnostic',
    );
    return parseAstridDiagnosticResponse(payload);
  }
}
