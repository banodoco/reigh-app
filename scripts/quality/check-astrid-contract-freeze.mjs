import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contractSchema, diagnosticSchema, EFFECTS } from './lib/astrid-contract-schema.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'config/contracts/astrid-plan-a-c1.json');
const PACKS = ['blender', 'comfy_wrap', 'editorial', 'fal', 'foley', 'generation', 'iteration',
  'media', 'moirae', 'rendering', 'runpod', 'stream_content', 'training', 'typed_timeline',
  'understanding', 'vibecomfy', 'video_editing', 'wan2gp', 'youtube'];
const COMMAND_EFFECTS = {
  agent: ['observe', 'may-spend-money'],
  'setup-preview': ['observe'], 'setup-check': ['observe'], help: ['observe'],
  'workspace-status': ['observe'], 'auth-status': ['observe'], 'runtime-status': ['observe'],
  doctor: ['observe'], 'task-inspect': ['observe'], 'relocate-preview': ['observe'],
  'setup-apply': ['configure-install', 'write-relocate-change-data', 'start-stop-local-service'],
  'auth-login': ['configure-install', 'write-relocate-change-data'],
  'auth-logout': ['write-relocate-change-data'], 'auth-revoke': ['write-relocate-change-data'],
  'runtime-up': ['start-stop-local-service', 'configure-install', 'write-relocate-change-data'],
  'runtime-restart': ['start-stop-local-service', 'interrupt-work', 'configure-install', 'write-relocate-change-data'],
  'runtime-down': ['start-stop-local-service', 'interrupt-work'],
  'runtime-connect': ['configure-install', 'write-relocate-change-data'],
  'task-cancel': ['interrupt-work', 'write-relocate-change-data'],
  'task-retry': ['may-spend-money', 'write-relocate-change-data'],
  'run-retry': ['may-spend-money', 'write-relocate-change-data'],
  'task-create': ['may-spend-money', 'write-relocate-change-data'],
  'diagnostic-bundle': ['observe', 'write-relocate-change-data'],
  backup: ['observe', 'write-relocate-change-data'], restore: ['write-relocate-change-data'],
  relocate: ['configure-install', 'start-stop-local-service', 'interrupt-work', 'write-relocate-change-data'],
  recovery: ['interrupt-work', 'write-relocate-change-data'],
};
const REQUIRED_INPUTS = {
  'workspace-inventory': ['physical-inventory', 'SL', 'CF-M1'],
  'preservation-preflight': ['preservation-receipt', 'SL', 'actual-workspace-mutation'],
  'preservation-final': ['preservation-receipt', 'SL', 'CF-CLOSE'],
  'setup-delivery': ['implementation-artifact', 'SL', 'A-CANDIDATE'],
  'observer-delivery': ['implementation-artifact', 'SL', 'A-CANDIDATE'],
  'execution-delivery': ['implementation-artifact', 'EW', 'A-CANDIDATE'],
  'worker-control-mapping': ['operator-contract', 'EW', 'EW-integration'],
  'hosted-auth-protocol': ['hosted-wire-input', 'CF', 'affected-B-integration'],
  'dependency-closure': ['artifact-closure', 'SL', 'A-CANDIDATE'],
  'hivemind-publication': ['publication-proof', 'SL', 'source-acquisition'],
  'engine-publication': ['publication-proof', 'SL', 'source-acquisition'],
  'runtime-reconciliation': ['source-custody', 'CF', 'EW-integration'],
  'sl-ack': ['consumer-ack', 'SL', 'CF-M1'], 'ew-ack': ['consumer-ack', 'EW', 'CF-M1'],
  'release-candidate': ['release-candidate', 'CF', 'installed-acceptance'],
  'execution-target': ['execution-binding', 'EW', 'A-CANDIDATE'],
};

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

/** UTF-8 JSON, recursively sorted object keys, ordered arrays, only root digest omitted. */
export function computeContractDigest(contract) {
  const { digest: _digest, ...body } = contract;
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex')}`;
}

const schemaErrors = (result) => result.error.issues.map((issue) => `${issue.path.join('.') || 'contract'}: ${issue.message}`);
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every((item) => b.includes(item));
const sameSequence = (a, b) => a.length === b.length && a.every((item, index) => item === b[index]);

function verifyEvidence(contract, repoRoots) {
  const result = { errors: [], verified: [], unverified: [] };
  const roots = { 'reigh-app': REPO_ROOT, ...repoRoots };
  for (const evidence of contract.sourceEvidence) {
    const root = roots[evidence.repository];
    if (!root) { result.unverified.push(evidence.id); continue; }
    try {
      const realRoot = realpathSync(root);
      const source = realpathSync(path.resolve(realRoot, evidence.path));
      if (!source.startsWith(`${realRoot}${path.sep}`)) throw new Error('source escapes repository root');
      const hash = createHash('sha256').update(readFileSync(source)).digest('hex');
      if (hash !== evidence.sha256) throw new Error('source SHA-256 mismatch');
      result.verified.push(evidence.id);
    } catch (error) { result.errors.push(`sourceEvidence.${evidence.id}: ${error.message}`); }
  }
  return result;
}

/** Validate only the frozen artifact and supplied source roots; never acquire/start anything. */
export function validateContract(contract, { repoRoots = {} } = {}) {
  const parsed = contractSchema.safeParse(contract);
  if (!parsed.success) return schemaErrors(parsed);
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  const set = (actual, expected, label) => require(sameSet(actual, expected), `${label}: expected exact distinct values ${expected.join(', ')}`);
  const sequence = (actual, expected, label) => require(sameSequence(actual, expected), `${label}: expected exact ordered values ${expected.join(', ')}`);
  require(contract.digest === computeContractDigest(contract), 'digest: canonical SHA-256 mismatch');
  for (const key of Object.keys(repoRoots)) require(['reigh-app', 'Astrid', 'workspace-runtime'].includes(key), `repoRoots: unknown repository ${key}`);
  for (const [name, entries] of Object.entries({ commands: contract.commands, migrations: contract.migrations,
    sourceEvidence: contract.sourceEvidence, unresolved: contract.unresolved, proofRequirements: contract.proofRequirements,
    authContexts: contract.auth.contexts, shippedPacks: contract.composition.shippedPacks,
    externalSources: contract.composition.externalSources, reconciliation: contract.composition.reconciliation })) {
    require(new Set(entries.map((entry) => entry.id)).size === entries.length, `${name}: duplicate ID`);
  }
  require(new Set(contract.sourceEvidence.map((entry) => `${entry.repository}:${entry.path}`)).size === contract.sourceEvidence.length,
    'sourceEvidence: duplicate repository/path');
  const evidence = new Map(contract.sourceEvidence.map((entry) => [entry.id, entry]));
  const inputs = new Map(contract.unresolved.map((entry) => [entry.id, entry]));
  const commands = new Map(contract.commands.map((entry) => [entry.id, entry]));
  function walk(value, location = '') {
    if (Array.isArray(value)) { value.forEach((item, index) => walk(item, `${location}[${index}]`)); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      const here = `${location}.${key}`;
      if (/EvidenceRefs?$/.test(key) || key === 'evidenceRef' || key === 'evidenceRefs') {
        const ids = Array.isArray(item) ? item : [item];
        require(new Set(ids).size === ids.length, `${here}: duplicate evidence reference`);
        for (const ref of ids) require(evidence.has(ref), `${here}: unknown evidence reference ${ref}`);
      } else if (key.endsWith('Ref') || key.endsWith('Refs')) {
        for (const ref of Array.isArray(item) ? item : [item]) require(inputs.has(ref), `${here}: unknown unresolved reference ${ref}`);
      }
      walk(item, here);
    }
  }
  walk(contract);
  set([...inputs.keys()], Object.keys(REQUIRED_INPUTS), 'unresolved');
  for (const [inputId, [kind, inputOwner, deadline]] of Object.entries(REQUIRED_INPUTS)) {
    const input = inputs.get(inputId);
    require(input?.kind === kind && input?.owner === inputOwner && input?.requiredBefore === deadline,
      `unresolved.${inputId}: expected ${kind}/${inputOwner}/${deadline}`);
  }
  const references = [
    [contract.scope.releaseCandidateRef, 'release-candidate'],
    [contract.workspace.physicalInventoryRef, 'workspace-inventory'], [contract.workspace.preservationRef, 'preservation-preflight'],
    [contract.auth.contribution.wireRef, 'hosted-auth-protocol'], [contract.dispatch.workerControlsRef, 'worker-control-mapping'],
    [contract.setup.inputRef, 'setup-delivery'], [contract.execution.deliveryRef, 'execution-delivery'],
    [contract.observation.observerRef, 'observer-delivery'], [contract.composition.selection.executionTargetRef, 'execution-target'],
    [contract.composition.selection.workerArtifactRef, 'execution-delivery'], [contract.composition.selection.dependencyClosureRef, 'dependency-closure'],
    [contract.composition.declaredEngineRevision.publicationRef, 'engine-publication'],
  ];
  for (const [actual, expected] of references) require(actual === expected, `reference ${actual}: expected ${expected} and its declared kind/owner`);
  set(contract.scope.consumerAckRefs, ['sl-ack', 'ew-ack'], 'scope.consumerAckRefs');
  set(contract.scope.consumers, ['SL', 'EW'], 'scope.consumers');
  set(contract.effects, EFFECTS, 'effects');
  const contexts = {
    'local-app-local-workspace': [false, 'existing-local-bridge', ['local-workspace-scopes']],
    'hosted-app-hosted-workspace': [true, 'backend-verified-discord', ['workspace-membership-and-action']],
    'local-app-hosted-workspace': [true, 'backend-verified-discord', ['workspace-membership-and-action', 'explicit-pairing-and-action']],
    'hosted-browser-local-connector': [true, 'backend-verified-discord', ['explicit-pairing-and-action', 'local-workspace-scopes']],
  };
  set(contract.auth.contexts.map((item) => item.id), Object.keys(contexts), 'auth.contexts');
  for (const context of contract.auth.contexts) {
    const expected = contexts[context.id];
    if (expected) {
      require(context.discordRequired === expected[0] && context.session === expected[1], `auth.contexts.${context.id}: incorrect session gate`);
      set(context.actionGrants, expected[2], `auth.contexts.${context.id}.actionGrants`);
    }
  }
  set(contract.auth.independentAuthorities, ['local-session', 'hosted-session', 'workspace-grant', 'connector-grant',
    'contributor-write-consent', 'execution-provider-authorization'], 'auth.independentAuthorities');
  set(contract.auth.contribution.triggers, ['explicit-knowledge-write', 'explicit-auth-management'], 'auth.contribution.triggers');
  set(contract.auth.contribution.anonymousReads, ['search', 'get-item', 'media-refresh'], 'auth.contribution.anonymousReads');
  set(contract.dispatch.reservedBeforePromptAndPacks, ['setup', 'status', 'auth', 'help', 'agent', 'login', 'logout', 'revoke', '--help', '--version'], 'dispatch.reservedBeforePromptAndPacks');
  set([...commands.keys()], Object.keys(COMMAND_EFFECTS), 'commands');
  for (const [commandId, expected] of Object.entries(COMMAND_EFFECTS)) set(commands.get(commandId)?.effects ?? [], expected, `commands.${commandId}.effects`);
  set(contract.migrations.map((entry) => entry.id), ['auth-aliases', 'status-namespace', 'setup-route', 'runtime-wrapper', 'help-census', 'doctor-observation'], 'migrations');
  sequence(contract.setup.applyStages, ['inspect', 'Create-or-Attach', 'select-default', 'compose',
    'Setup applied', 'Starting Astrid Runtime', 'Runtime ready'], 'setup.applyStages');
  require(contract.setup.retryCommandId === 'runtime-up' && commands.has('runtime-up'), 'setup.retryCommandId: must name runtime-up');
  set(contract.states.readinessDimensions, ['workspace', 'runtime', 'compute-worker', 'selected-capability', 'optional-contribution-auth', 'hosted-session-and-grants'], 'states.readinessDimensions');
  set(contract.execution.wireFields.taskStates, ['queued', 'ready', 'running', 'succeeded', 'failed', 'cancel_requested', 'cancelled', 'retrying'], 'execution.wireFields.taskStates');
  set(contract.execution.wireFields.runStates, ['queued', 'running', 'completed', 'failed', 'cancelled'], 'execution.wireFields.runStates');
  set(contract.composition.shippedPacks.map((pack) => pack.id), PACKS, 'composition.shippedPacks');
  for (const pack of contract.composition.shippedPacks) {
    require(pack.stability === (['comfy_wrap', 'stream_content', 'wan2gp'].includes(pack.id) ? 'experimental' : 'stable'), `composition.shippedPacks.${pack.id}: incorrect stability`);
    require(pack.evidenceRef === `pack-${pack.id}` && pack.skillPath === `astrid/packs/${pack.id}/skill/SKILL.md`, `composition.shippedPacks.${pack.id}: incorrect source association`);
    const source = evidence.get(pack.evidenceRef);
    require(source?.repository === 'Astrid' && source?.path === `astrid/packs/${pack.id}/pack.yaml`, `composition.shippedPacks.${pack.id}: expected pack manifest evidence`);
  }
  set(contract.composition.defaultSkills, ['_core', 'hivemind', 'vibecomfy', 'rendering', 'typed_timeline', 'video_editing'], 'composition.defaultSkills');
  require(contract.composition.declaredEngineRevision.revision === 'a6a0cdb493c2f8bea4115740b96ec4c118af7ad1', 'composition.declaredEngineRevision: changed declared VibeComfy pin requires successor');
  const external = contract.composition.externalSources;
  require(external.length === 1 && external[0].id === 'hivemind' && external[0].revision === 'a4c6610cba1032adb3b4bec541ccf821afba6ba8'
    && external[0].publicationRef === 'hivemind-publication', 'composition.externalSources: expected sole declared Hivemind default/pin/publication input');
  set(contract.observation.requiredFields, Object.keys(diagnosticSchema.shape), 'observation.requiredFields');
  set(contract.observation.nextActionFields, ['commandId', 'arguments', 'effects', 'authorizationRequired'], 'observation.nextActionFields');
  errors.push(...verifyEvidence(contract, repoRoots).errors);
  return errors;
}

/** Checks projection shape/binding; redacted:true is a claim, not sanitization proof. */
export function validateDiagnostic(diagnostic, contract, { shared = true } = {}) {
  const parsed = diagnosticSchema.safeParse(diagnostic);
  if (!parsed.success) return schemaErrors(parsed);
  const errors = [];
  if (diagnostic.contractRevision !== contract.revision || diagnostic.contractDigest !== contract.digest) errors.push('diagnostic: contract identity mismatch');
  if (shared && !diagnostic.redacted) errors.push('diagnostic.redacted: shared diagnostic must be redacted');
  if (!contract.states.problemCodes.includes(diagnostic.problemCode)) errors.push('diagnostic.problemCode: unknown normalized code');
  for (const [key, value] of Object.entries(diagnostic.limits)) if (value > contract.observation.defaultLimits[key]) errors.push(`diagnostic.limits.${key}: exceeds contract bound`);
  for (const key of ['workspaceRef', 'taskRef', 'runRef', 'attemptRef', 'targetRef']) {
    if (diagnostic[key] === null && !diagnostic.unavailableReasons[key]) errors.push(`diagnostic.${key}: null requires unavailable reason`);
  }
  if (diagnostic.progress?.total !== null && diagnostic.progress?.completed > diagnostic.progress?.total) errors.push('diagnostic.progress: completed exceeds total');
  if (diagnostic.freshness.state === 'fresh' && diagnostic.freshness.observedAt === null) errors.push('diagnostic.freshness: fresh requires an observation timestamp');
  for (const action of diagnostic.nextActions) {
    const command = contract.commands.find((entry) => entry.id === action.commandId);
    if (!command || !sameSet(action.effects, command.effects)) errors.push(`diagnostic.nextActions.${action.commandId}: unknown command or mismatched effects`);
    if (action.effects.some((effect) => effect !== 'observe') && !action.authorizationRequired) errors.push(`diagnostic.nextActions.${action.commandId}: effect requires scoped authorization`);
  }
  return errors;
}

function main(argv) {
  const json = argv.includes('--json');
  try {
    const roots = {};
    for (let index = 0; index < argv.length; index += 1) {
      const flag = argv[index];
      if (flag === '--json') continue;
      const repository = { '--astrid-root': 'Astrid', '--runtime-root': 'workspace-runtime' }[flag];
      if (!repository) throw new Error(`unknown argument: ${flag}`);
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${flag} requires a path`);
      if (roots[repository]) throw new Error(`duplicate argument: ${flag}`);
      roots[repository] = path.resolve(value);
    }
    const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
    const errors = validateContract(contract, { repoRoots: roots });
    const verification = contractSchema.safeParse(contract).success ? verifyEvidence(contract, roots) : { verified: [], unverified: [] };
    const report = { ok: errors.length === 0, revision: contract.revision, digest: contract.digest, errors,
      sourceVerification: { verified: verification.verified, unverified: verification.unverified },
      installedAcceptance: false };
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`${report.ok ? 'PASS' : 'FAIL'} Astrid ${contract.revision}: ${contract.digest}`);
      console.log(`Source evidence: ${verification.verified.length} verified; ${verification.unverified.length} external observations unverified (supply explicit source roots). No installed acceptance.`);
      for (const error of errors) console.error(error);
    }
    return report.ok ? 0 : 1;
  } catch (error) {
    if (json) console.log(JSON.stringify({ ok: false, errors: [error.message], installedAcceptance: false }));
    else console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
