import { z } from 'zod';

const text = z.string().trim().min(1);
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const list = (item = text) => z.array(item).min(1);
const object = (shape) => z.strictObject(shape);
const no = z.literal(false);
const yes = z.literal(true);
const owner = z.enum(['CF', 'SL', 'EW', 'B']);
const repository = z.enum(['reigh-app', 'Astrid', 'workspace-runtime']);
const revision = z.string().regex(/^[0-9a-f]{40}$/);
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const relativePath = text.refine((value) => !value.startsWith('/') && !value.includes('\\')
  && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  && !/^[a-zA-Z]:/.test(value), 'must be a contained relative POSIX path');

export const EFFECTS = [
  'observe', 'configure-install', 'start-stop-local-service', 'interrupt-work',
  'may-spend-money', 'write-relocate-change-data', 'share-diagnostics',
];
const effects = list(z.enum(EFFECTS));
const refs = list(id);

const unresolved = object({
  id,
  kind: z.enum(['physical-inventory', 'preservation-receipt', 'implementation-artifact',
    'operator-contract', 'hosted-wire-input', 'artifact-closure', 'publication-proof',
    'source-custody', 'consumer-ack', 'release-candidate', 'execution-binding']),
  status: z.literal('unresolved'),
  owner,
  requiredBefore: z.enum(['CF-M1', 'actual-workspace-mutation', 'CF-CLOSE', 'A-CANDIDATE',
    'EW-integration', 'affected-B-integration', 'source-acquisition', 'installed-acceptance']),
  reason: text,
});

/** C1 is a decision artifact, not a second Runtime wire or auth schema. */
export const contractSchema = object({
  schemaVersion: z.literal(1),
  kind: z.literal('astrid-contract-composition'),
  revision: z.literal('C1'),
  issuedOn: z.iso.date(),
  status: z.literal('frozen-semantics-pending-ack'),
  digest,
  scope: object({
    owner: z.literal('CF'), consumers: list(z.enum(['SL', 'EW'])),
    runtimeAuthority: z.literal('workspace.v1'), contributorAuthority: z.literal('Hivemind'),
    implementationClaim: no, installedAcceptanceClaim: no,
    releaseCandidateRef: id, consumerAckRefs: refs,
  }),
  workspace: object({
    count: z.literal(1), selection: z.literal('Create-or-Attach-during-setup'),
    identity: z.literal('existing-stable-workspace-UUID-and-registered-absolute-root'),
    repeat: z.literal('reuse-selected-identity-and-preserve-disabled-choices'),
    cwdFallback: no, implicitSecondWorkspace: no,
    expertOverride: z.literal('preservation-only-same-UUID-no-default-change'),
    localDisplay: list(), sharedDisplay: z.literal('redacted-root-reference'),
    physicalInventoryRef: id, preservationRef: id, authorityEvidenceRefs: refs, rootPolicy: text,
  }),
  auth: object({
    contexts: list(object({ id, session: z.enum(['existing-local-bridge', 'backend-verified-discord']),
      discordRequired: z.boolean(), contributorLoginRequired: no, actionGrants: list() })),
    contribution: object({
      canonicalNamespace: z.literal('astrid auth'), triggers: list(), anonymousReads: list(),
      writeConsent: z.literal('explicit-material-attribution-and-capability-consent'),
      identity: z.literal('same-Hivemind-canonical-contributor-through-verified-link'),
      rawKeySharing: no, localPresenceIsVerification: no,
      editorPermission: z.literal('existing-server-role-separate-from-write-consent'),
      helperAcquisition: z.literal('explicit-login-only-disclosed-scoped-existing-helper'), wireRef: id,
    }),
    independentAuthorities: list(), nonImplications: list(),
    modeTransitions: object({ revalidateDestination: yes, isolateSessionAndCaches: yes,
      preserveLocalDefault: yes, hostedFailureGatesLocal: no }),
    failurePolicy: list(),
    secretCustody: z.literal('no-contributor-key-Runtime-credential-or-OAuth-secret-in-browser-logs-prompts-URLs-or-diagnostics'),
    evidenceRefs: refs,
  }),
  effects,
  commands: list(object({ id, surface: text, current: text, effects, owner,
    implementation: z.enum(['existing', 'proposed', 'existing-with-contract-gap']), evidenceRefs: refs })),
  dispatch: object({
    reservedBeforePromptAndPacks: list(),
    profileNamespaces: object({ omp: text, runtime: text, execution: text }),
    dynamicCollisionPolicy: z.literal('reject-or-namespace-conflicts-before-dispatch-no-contextual-multiplexing'),
    workerControlsRef: id,
  }),
  migrations: list(object({ id, old: text, oldMeaning: text, new: text, newMeaning: text,
    compatibilityInterval: text, removalCondition: text, implementation: z.literal('pending-SL') })),
  setup: object({
    previewByDefault: yes, checkStartsProcesses: no,
    offlineMeans: z.literal('no-network-acquisition-not-no-local-writes'), applyStages: list(),
    automaticRuntimeStart: yes, reconcileRunningRuntime: yes,
    startupFailure: z.literal('workspace-configured-runtime-not-ready'), retryCommandId: id,
    resumePolicy: z.literal('reconcile-completed-stages-preserve-UUID-root-choices-no-silent-upgrade'), inputRef: id,
  }),
  execution: object({
    authority: z.literal('existing-Runtime-admission-attempt-event-settlement'), wireEvidenceRef: id,
    sameKeyRetry: z.literal('reconcile-identical-authorized-request-no-new-attempt-or-target'),
    newAttempt: z.literal('explicit-task-retry-after-reconciliation-with-action-and-spend-scope'),
    dispatch: z.literal('selected-capability-target-credentials-and-spend-checked-at-admission-and-dispatch'),
    engineReceivesRuntimeCredentials: no,
    activeTaskLifecycle: z.literal('refuse-active-or-unreconciled-work-unless-scoped-interruption-authorized'),
    processOwnership: z.literal('verify-process-and-workspace-identity-never-port-only'),
    remoteUncertaintySurvivesRestart: yes, stopImpliesRemoteSettlement: no,
    workerRelaunchIsTaskRetry: no, replacementIsRelaunch: no, deliveryRef: id,
    wireFields: object({ taskStates: list(), runStates: list(), attemptFence: list(), events: list(), productEnvelope: list() }),
    wireRules: list(),
  }),
  states: object({
    independentFacts: object(Object.fromEntries(['installed', 'enabled', 'connected', 'ready', 'authorized',
      'queued', 'running', 'contact', 'progress', 'terminal', 'providerUncertainty'].map((key) => [key, text]))),
    readinessDimensions: list(), contributorAuth: list(), problemCodes: list(), wireMapping: text,
  }),
  observation: object({
    schemaPath: z.literal('scripts/quality/lib/astrid-contract-schema.mjs#diagnosticSchema'),
    processPolicy: z.literal('No Runtime, Worker, engine or provider starts. Bounded read-only observer/helper subprocesses are permitted; no bootstrap, provisioning or state writes.'),
    nonMutating: yes, provisioning: no, startsProcesses: no,
    defaultLimits: object({ timeoutMs: z.number().int().positive().max(5000), maxEvents: z.number().int().positive().max(200),
      maxLogBytes: z.number().int().positive().max(65536), maxBundleBytes: z.number().int().positive().max(1048576) }),
    requiredFields: list(), referencePolicy: text, nextActionFields: list(), nextActionPolicy: text,
    sharedRedaction: list(), localPaths: z.literal('available-only-in-local-inspection'), bundlePolicy: text,
    observerRef: id, nonStartingProofCases: list(), problemCodePolicy: text,
  }),
  composition: object({
    selection: object({
      capability: z.literal('vibecomfy.run'), engine: z.literal('VibeComfy/ComfyUI'),
      engineProfile: z.literal('pip_embedded'), localPlatform: z.literal('macOS'), workerPlatform: z.literal('Linux/CUDA'),
      targetKind: z.literal('runpod'), capabilityProfile: z.literal('astrid-beta-current-mac'), runtimeProfile: z.literal('astrid'),
      executionTargetRef: id, workerArtifactRef: id, dependencyClosureRef: id, evidenceRefs: refs,
      qualification: z.literal('not-executed'), rationale: text,
    }),
    declaredEngineRevision: object({ revision, evidenceRefs: refs, publicationRef: id }),
    shippedPacks: list(object({ id, status: z.literal('active'), stability: z.enum(['stable', 'experimental']),
      support: z.literal('core'), skillPath: relativePath, evidenceRef: id })),
    defaultSkills: list(), defaultSkillPolicy: text,
    externalSources: list(object({ id, default: yes, revision, evidenceRefs: refs, publicationRef: id })),
    reconciliation: list(object({ id, decision: text, evidenceRefs: refs })),
    preserveDisabledChoices: yes, silentPrerequisiteAcquisition: no, prerequisitePolicy: text, excludedDefaults: list(),
    observedHeads: list(object({ repository, revision, custodyPin: no })),
  }),
  sourceEvidence: list(object({ id, repository, path: relativePath, sha256: z.string().regex(/^[0-9a-f]{64}$/), summary: text })),
  unresolved: list(unresolved),
  evidencePolicy: object({
    sourceObservationsAreReleasePins: no, historicalReceiptsAreAcceptance: no,
    changedSemantics: z.literal('issue-successor-Cn-and-both-consumer-ACKs'),
    changedArtifactPins: z.literal('parent-invalidates-affected-installed-route-evidence'),
    a10: z.literal('rerun-for-exact-current-tuple'), receiptFields: list(), gatesClaimed: z.array(z.never()).length(0),
  }),
  proofRequirements: list(object({ id, owner, scenarios: list(), acceptance: list(), status: z.literal('not-executed') })),
  deferred: list(),
});

/** Sanitized observer projection. Runtime resources and raw codes remain authoritative. */
export const diagnosticSchema = object({
  schemaVersion: z.literal(1), contractRevision: z.literal('C1'), contractDigest: digest,
  collectedAt: z.iso.datetime(), versions: z.record(text, text),
  ...Object.fromEntries(['workspaceRef', 'taskRef', 'runRef', 'attemptRef', 'targetRef'].map((key) => [key, text.nullable()])),
  problemCode: text, rawRuntimeCode: text.nullable(), failureBoundary: text, stillWorks: z.array(text),
  lastContactAt: z.iso.datetime().nullable(),
  progress: object({ completed: z.number().nonnegative(), total: z.number().nonnegative().nullable(), unit: text }).nullable(),
  uncertainty: z.enum(['none', 'unknown', 'remote-execution', 'remote-billing', 'both']),
  limits: object({ timeoutMs: z.number().int().positive(), maxEvents: z.number().int().positive(),
    maxLogBytes: z.number().int().positive(), maxBundleBytes: z.number().int().positive() }),
  truncated: z.boolean(),
  nextActions: z.array(object({ commandId: id, arguments: z.array(z.string()), effects, authorizationRequired: z.boolean() })),
  freshness: object({ state: z.enum(['fresh', 'stale', 'unknown']), observedAt: z.iso.datetime().nullable(), maxAgeMs: z.number().int().positive() }),
  terminalResult: object({ source: z.literal('Runtime'), state: z.enum(['succeeded', 'completed', 'failed', 'cancelled']) }).nullable(),
  redacted: z.boolean(), unavailableReasons: z.record(text, text),
});
