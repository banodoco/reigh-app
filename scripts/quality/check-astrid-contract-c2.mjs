import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeContractDigest as computeC1Digest } from './check-astrid-contract-freeze.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'config/contracts/astrid-plan-a-c2.json');
const C1_PATH = path.join(REPO_ROOT, 'config/contracts/astrid-plan-a-c1.json');
const SCHEMA_PATH = path.join(REPO_ROOT, 'config/contracts/astrid-plan-a-diagnostic-c2.schema.json');
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const REDACTION_MARKER = /^(?:<redacted(?::[^>]+)?>|\[redacted(?::[^\]]+)?\])$/i;
const PRIVATE_PATH = /(?:^|[\s"'=])\/(?:Users|home|opt|var|mnt|private|tmp)\//;
const SECRET_TEXT = /(?:api[_-]?key|access[_-]?token|authorization|bearer|client[_-]?secret|prompt)\s*[:=]\s*(?!<redacted|\[redacted)/i;
const SIGNED_URL = /[?&](?:sig|signature|token|access_token|x-amz-signature)=(?!<redacted|%5Bredacted)/i;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function computeContractDigest(contract) {
  const { digest: _digest, ...body } = contract;
  return `sha256:${sha256(JSON.stringify(canonical(body)))}`;
}

function sameSequence(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function requireExactKeys(value, expected, pathName, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const allowed = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${pathName}.${key}: unknown field`);
  }
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) errors.push(`${pathName}.${key}: missing required field`);
  }
}

function predecessorCommandEffects() {
  const c1 = JSON.parse(readFileSync(C1_PATH, 'utf8'));
  return new Map(c1.commands.map((command) => [command.id, command.effects]));
}

function safeContainedFile(root, relativePath) {
  const realRoot = realpathSync(root);
  const file = realpathSync(path.resolve(realRoot, relativePath));
  if (!file.startsWith(`${realRoot}${path.sep}`)) throw new Error('source escapes repository root');
  return file;
}

function validateC1(contract, errors) {
  const bytes = readFileSync(C1_PATH);
  const c1 = JSON.parse(bytes);
  if (sha256(bytes) !== contract.predecessor.rawFileSha256) errors.push('predecessor.rawFileSha256: immutable C1 raw bytes changed');
  if (c1.revision !== 'C1' || c1.digest !== contract.predecessor.canonicalDigest) errors.push('predecessor: C1 revision/digest mismatch');
  if (computeC1Digest(c1) !== c1.digest) errors.push('predecessor: C1 canonical digest no longer validates');
}

function validateSourceApplicability(contract, repoRoots, errors, verification) {
  const roots = { 'reigh-app': REPO_ROOT, ...repoRoots };
  for (const source of contract.sourceApplicability ?? []) {
    const root = roots[source.repository];
    if (!root) {
      verification.unverified.push(`${source.repository}:${source.path}`);
      continue;
    }
    try {
      const file = safeContainedFile(root, source.path);
      if (sha256(readFileSync(file)) !== source.sha256) throw new Error('source SHA-256 mismatch');
      verification.verified.push(`${source.repository}:${source.path}`);
    } catch (error) {
      errors.push(`sourceApplicability.${source.repository}:${source.path}: ${error.message}`);
    }
  }
  for (const client of contract.generatedClientCompatibility?.clients ?? []) {
    const root = roots[client.repository];
    if (!root) continue;
    for (const [kind, filename, expected] of [
      ['generated', client.generatedPath, client.generatedSha256],
      ['metadata', client.metadataPath, client.metadataSha256],
    ]) {
      try {
        const actual = sha256(readFileSync(safeContainedFile(root, filename)));
        if (actual !== expected) throw new Error(`${kind} SHA-256 mismatch`);
      } catch (error) {
        errors.push(`generatedClientCompatibility.${client.repository}.${kind}: ${error.message}`);
      }
    }
  }
}

export function validateContract(contract, { repoRoots = {} } = {}) {
  const errors = [];
  const verification = { verified: [], unverified: [] };
  const require = (condition, message) => { if (!condition) errors.push(message); };
  require(contract && typeof contract === 'object' && !Array.isArray(contract), 'contract: expected object');
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return { errors, verification };
  require(contract.schemaVersion === 2, 'schemaVersion: expected 2');
  require(contract.kind === 'astrid-contract-diagnostic-projection', 'kind: unexpected contract kind');
  require(contract.revision === 'C2', 'revision: expected C2');
  require(SHA256.test(contract.digest ?? ''), 'digest: malformed SHA-256');
  require(contract.digest === computeContractDigest(contract), 'digest: canonical SHA-256 mismatch');
  require(contract.predecessor?.immutable === true, 'predecessor: C1 must be immutable');
  require(contract.predecessor?.path === 'config/contracts/astrid-plan-a-c1.json', 'predecessor.path: expected C1 path');
  require(contract.authority?.runtimeWire === 'workspace.v1', 'authority.runtimeWire: Runtime authority changed');
  require(contract.authority?.runtimeWireOwner === 'banodoco-workspace-runtime', 'authority.runtimeWireOwner: duplicate Runtime authority');
  require(contract.diagnostic?.totalObservationDeadlineMs === 5000, 'diagnostic.totalObservationDeadlineMs: expected exactly 5000');
  require(contract.diagnostic?.deadlineScope === 'total-including-all-helpers', 'diagnostic.deadlineScope: expected total deadline');
  require(sameSequence(contract.diagnostic?.collectionEffects, ['observe']), 'diagnostic.collectionEffects: diagnostic collection must only observe');
  require(contract.diagnostic?.healthySemantics?.problemCode === null && contract.diagnostic?.healthySemantics?.failureBoundary === null,
    'diagnostic.healthySemantics: healthy pair must be null/null');
  require(contract.diagnostic?.failureSemantics?.paired === true, 'diagnostic.failureSemantics: failure values must be paired');
  for (const field of ['collectionMayStart', 'collectionMayRepair', 'collectionMayUpload', 'collectionMaySpend', 'redactedPlaceholderExecutable']) {
    require(contract.diagnostic?.actionRules?.[field] === false, `diagnostic.actionRules.${field}: expected false`);
  }
  require(contract.diagnostic?.actionRules?.commandEffectsSource === 'config/contracts/astrid-plan-a-c1.json#commands'
    && contract.diagnostic?.actionRules?.exactCommandEffectsRequired === true,
  'diagnostic.actionRules: actions must bind to exact predecessor C1 command effects');
  require(contract.diagnostic?.actionRules?.actionsExecutedMustBeEmpty === true, 'diagnostic.actionRules.actionsExecutedMustBeEmpty: expected true');
  const facts = contract.diagnostic?.unknownSemantics?.independentFacts ?? [];
  require(facts.length === 13 && new Set(facts).size === facts.length, 'diagnostic.unknownSemantics.independentFacts: expected 13 distinct facts');
  require(contract.gates?.C03Diagnostic === 'not-claimed-until-I-07-I-08-actual-public-output-evidence', 'gates.C03Diagnostic: public-output acceptance must remain unclaimed');
  require(contract.gates?.installedAcceptance === false && contract.gates?.hostedAcceptance === false && contract.gates?.liveProviderAcceptance === false,
    'gates: installed/hosted/live acceptance must be false');
  require(contract.generatedClientCompatibility?.authorityStatus === 'held-primary-overlay-pending-I-04-I-05',
    'generatedClientCompatibility.authorityStatus: Runtime overlay must remain held');
  require((contract.unresolvedAuthority ?? []).some((item) => item.id === 'runtime-primary-overlay' && item.status === 'waiting-for-Astra'),
    'unresolvedAuthority: Runtime primary overlay decision must remain pending');
  require((contract.unresolvedAuthority ?? []).some((item) => item.id === 'held-top-level-h3-workflow-group' && item.status.startsWith('waiting-for-')),
    'unresolvedAuthority: held H3 workflow decision must remain pending');
  require((contract.acknowledgements ?? []).length === 2
    && contract.acknowledgements.every((item) => item.status === 'pending-exact-consumer-ack'),
  'acknowledgements: exact SL/EW consumer ACKs must remain pending coordinator finalization');
  try { validateC1(contract, errors); } catch (error) { errors.push(`predecessor: ${error.message}`); }
  try {
    const schema = readFileSync(SCHEMA_PATH);
    if (contract.diagnostic?.schemaSha256 && sha256(schema) !== contract.diagnostic.schemaSha256) errors.push('diagnostic.schemaSha256: schema bytes changed');
    JSON.parse(schema);
  } catch (error) { errors.push(`diagnostic.schemaPath: ${error.message}`); }
  validateSourceApplicability(contract, repoRoots, errors, verification);
  return { errors, verification };
}

function walkShared(value, pathName, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkShared(item, `${pathName}[${index}]`, errors));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/^(?:api[_-]?key|access[_-]?token|authorization|bearer|client[_-]?secret|prompt|environment(?:Value)?)$/i.test(key)
        && typeof item === 'string' && !REDACTION_MARKER.test(item)) {
        errors.push(`${pathName}.${key}: shared sensitive field is not inertly redacted`);
      }
      walkShared(item, `${pathName}.${key}`, errors);
    }
    return;
  }
  if (typeof value === 'string' && (PRIVATE_PATH.test(value) || SECRET_TEXT.test(value) || SIGNED_URL.test(value))) {
    errors.push(`${pathName}: shared output contains sensitive material`);
  }
}

export function validateDiagnostic(diagnostic, contract) {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  require(diagnostic && typeof diagnostic === 'object' && !Array.isArray(diagnostic), 'diagnostic: expected object');
  if (!diagnostic || typeof diagnostic !== 'object' || Array.isArray(diagnostic)) return errors;
  requireExactKeys(diagnostic, [
    'schemaVersion', 'contractRevision', 'contractDigest', 'mode', 'collectedAt', 'timing',
    'problemCode', 'failureBoundary', 'facts', 'limits', 'captured', 'truncated',
    'nextActions', 'actionsExecuted', 'redacted',
  ], 'diagnostic', errors);
  require(diagnostic.schemaVersion === 2, 'schemaVersion: expected 2');
  require(diagnostic.contractRevision === 'C2' && diagnostic.contractDigest === contract.digest, 'diagnostic: contract identity mismatch');
  require(['local', 'shared'].includes(diagnostic.mode), 'mode: expected local or shared');
  require(DATE_TIME.test(diagnostic.collectedAt ?? ''), 'collectedAt: expected UTC date-time');
  requireExactKeys(diagnostic.timing, ['deadlineScope', 'deadlineMs', 'elapsedMs', 'timedOut'], 'timing', errors);
  require(diagnostic.timing?.deadlineScope === 'total-including-all-helpers', 'timing.deadlineScope: expected total deadline');
  require(Number.isInteger(diagnostic.timing?.deadlineMs) && diagnostic.timing.deadlineMs > 0
    && diagnostic.timing.deadlineMs <= contract.diagnostic.totalObservationDeadlineMs, 'timing.deadlineMs: exceeds five-second total deadline');
  require(Number.isInteger(diagnostic.timing?.elapsedMs) && diagnostic.timing.elapsedMs >= 0
    && diagnostic.timing.elapsedMs <= diagnostic.timing?.deadlineMs, 'timing.elapsedMs: exceeds total deadline');
  require(typeof diagnostic.timing?.timedOut === 'boolean', 'timing.timedOut: expected boolean');
  const healthy = diagnostic.problemCode === null && diagnostic.failureBoundary === null;
  const failed = typeof diagnostic.problemCode === 'string' && typeof diagnostic.failureBoundary === 'string';
  require(healthy || failed, 'problemCode/failureBoundary: must be paired null/null or non-null/non-null');
  if (failed) {
    require(contract.diagnostic.problemCodes.includes(diagnostic.problemCode), 'problemCode: unknown normalized code');
    require(contract.diagnostic.failureBoundaries.includes(diagnostic.failureBoundary), 'failureBoundary: unknown boundary');
  }
  const expectedFacts = contract.diagnostic.unknownSemantics.independentFacts;
  require(diagnostic.facts && typeof diagnostic.facts === 'object' && !Array.isArray(diagnostic.facts), 'facts: expected object');
  require(sameSequence(Object.keys(diagnostic.facts ?? {}).sort(), [...expectedFacts].sort()), 'facts: expected exact independent fact set');
  for (const [name, fact] of Object.entries(diagnostic.facts ?? {})) {
    requireExactKeys(fact, ['observed', 'value', 'observedAt', 'unavailableReason'], `facts.${name}`, errors);
    require(fact && typeof fact === 'object' && typeof fact.observed === 'boolean', `facts.${name}: malformed fact`);
    if (!fact || typeof fact !== 'object') continue;
    require(fact.value === null || typeof fact.value === 'string' || typeof fact.value === 'boolean'
      || (typeof fact.value === 'number' && Number.isFinite(fact.value)), `facts.${name}.value: expected string, boolean, finite number, or null`);
    require(fact.observedAt === null || typeof fact.observedAt === 'string', `facts.${name}.observedAt: expected string or null`);
    require(fact.unavailableReason === null || typeof fact.unavailableReason === 'string', `facts.${name}.unavailableReason: expected string or null`);
    if (fact.observed) {
      require(fact.value !== null && fact.value !== undefined, `facts.${name}: observed fact requires value`);
      require(DATE_TIME.test(fact.observedAt ?? ''), `facts.${name}: observed fact requires timestamp`);
      require(fact.unavailableReason === null, `facts.${name}: observed fact cannot have unavailableReason`);
    } else {
      require(fact.value === null && fact.observedAt === null, `facts.${name}: unobserved fact must preserve null value/timestamp`);
      require(typeof fact.unavailableReason === 'string' && fact.unavailableReason.trim().length > 0,
        `facts.${name}: unobserved fact requires unavailableReason`);
    }
  }
  requireExactKeys(diagnostic.limits, ['maxEvents', 'maxLogBytes', 'maxBundleBytes'], 'limits', errors);
  for (const [key, maximum] of Object.entries(contract.diagnostic.limits)) {
    require(Number.isInteger(diagnostic.limits?.[key]) && diagnostic.limits[key] >= 0 && diagnostic.limits[key] <= maximum,
      `limits.${key}: exceeds contract bound`);
  }
  requireExactKeys(diagnostic.captured, ['events', 'logBytes', 'bundleBytes'], 'captured', errors);
  for (const [captured, limit] of [['events', 'maxEvents'], ['logBytes', 'maxLogBytes'], ['bundleBytes', 'maxBundleBytes']]) {
    require(Number.isInteger(diagnostic.captured?.[captured]) && diagnostic.captured[captured] >= 0
      && diagnostic.captured[captured] <= diagnostic.limits?.[limit], `captured.${captured}: exceeds declared limit`);
  }
  require(typeof diagnostic.truncated === 'boolean', 'truncated: expected boolean');
  require(Array.isArray(diagnostic.nextActions), 'nextActions: expected array');
  const commandEffects = predecessorCommandEffects();
  const actions = Array.isArray(diagnostic.nextActions) ? diagnostic.nextActions : [];
  for (const [index, action] of actions.entries()) {
    requireExactKeys(action, ['commandId', 'arguments', 'effects', 'authorizationRequired', 'executable'], `nextActions[${index}]`, errors);
    const argumentsList = Array.isArray(action?.arguments) ? action.arguments : [];
    const effects = Array.isArray(action?.effects) ? action.effects : [];
    require(typeof action?.commandId === 'string' && action.commandId.length > 0, `nextActions[${index}].commandId: required`);
    require(Array.isArray(action?.arguments) && action.arguments.every((arg) => typeof arg === 'string'), `nextActions[${index}].arguments: expected strings`);
    require(Array.isArray(effects) && effects.length > 0 && new Set(effects).size === effects.length
      && effects.every((effect) => contract.diagnostic.actionRules.allowedEffects.includes(effect)), `nextActions[${index}].effects: invalid effects`);
    const expectedEffects = commandEffects.get(action?.commandId);
    require(expectedEffects !== undefined, `nextActions[${index}].commandId: unknown C1 command`);
    if (expectedEffects) require(sameSequence(effects, expectedEffects), `nextActions[${index}].effects: must exactly match C1 command effects`);
    const effectful = effects.some((effect) => effect !== 'observe');
    if (effectful) require(action.authorizationRequired === true, `nextActions[${index}]: effectful suggestion requires authorization`);
    const hasPlaceholder = argumentsList.some((arg) => typeof arg === 'string' && /<redacted|\[redacted/i.test(arg));
    if (hasPlaceholder) require(action.executable === false, `nextActions[${index}]: redacted placeholder must be inert`);
    require(typeof action.authorizationRequired === 'boolean', `nextActions[${index}].authorizationRequired: expected boolean`);
    require(typeof action.executable === 'boolean', `nextActions[${index}].executable: expected boolean`);
  }
  require(Array.isArray(diagnostic.actionsExecuted) && diagnostic.actionsExecuted.length === 0,
    'actionsExecuted: diagnostic collection must not start, repair, upload, spend, or execute actions');
  require(typeof diagnostic.redacted === 'boolean', 'redacted: expected boolean');
  if (diagnostic.mode === 'shared') {
    require(diagnostic.redacted === true, 'redacted: shared diagnostic must be redacted');
    walkShared(diagnostic, 'diagnostic', errors);
  }
  return errors;
}

function validateFixtures(contract, errors) {
  for (const filename of contract.fixtures.positive) {
    const diagnostic = JSON.parse(readFileSync(path.join(REPO_ROOT, filename), 'utf8'));
    const fixtureErrors = validateDiagnostic(diagnostic, contract);
    if (fixtureErrors.length) errors.push(`${filename}: expected PASS: ${fixtureErrors.join('; ')}`);
  }
  for (const filename of contract.fixtures.negative) {
    const fixturePath = path.join(REPO_ROOT, filename);
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const diagnostic = JSON.parse(readFileSync(path.resolve(path.dirname(fixturePath), fixture.base), 'utf8'));
    let target = diagnostic;
    const parts = fixture.mutation.path.split('.');
    for (const part of parts.slice(0, -1)) target = target[part];
    target[parts.at(-1)] = fixture.mutation.value;
    const fixtureErrors = validateDiagnostic(diagnostic, contract);
    if (fixtureErrors.length === 0) errors.push(`${filename}: expected deterministic rejection`);
    else if (!fixtureErrors.some((error) => error.includes(fixture.expectedError))) {
      errors.push(`${filename}: expected error containing ${fixture.expectedError}; received ${fixtureErrors.join('; ')}`);
    }
  }
}

function main(argv) {
  const json = argv.includes('--json');
  const roots = {};
  const flags = {
    '--app-root': 'reigh-app',
    '--astrid-root': 'Astrid',
    '--runtime-root': 'banodoco-workspace-runtime',
    '--worker-root': 'reigh-worker',
  };
  try {
    for (let index = 0; index < argv.length; index += 1) {
      const flag = argv[index];
      if (flag === '--json') continue;
      const repository = flags[flag];
      if (!repository) throw new Error(`unknown argument: ${flag}`);
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${flag} requires a path`);
      if (roots[repository]) throw new Error(`duplicate argument: ${flag}`);
      roots[repository] = path.resolve(value);
    }
    const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
    const result = validateContract(contract, { repoRoots: roots });
    validateFixtures(contract, result.errors);
    const report = {
      ok: result.errors.length === 0,
      revision: contract.revision,
      digest: contract.digest,
      predecessor: contract.predecessor,
      sourceVerification: result.verification,
      fixtureCounts: { positive: contract.fixtures.positive.length, negative: contract.fixtures.negative.length },
      C03Contract: result.errors.length === 0 ? 'PASS' : 'FAIL',
      C03Diagnostic: 'NOT_CLAIMED',
      installedAcceptance: false,
      errors: result.errors,
    };
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`${report.ok ? 'PASS' : 'FAIL'} Astrid ${report.revision}: ${report.digest}`);
      console.log(`${report.fixtureCounts.positive} positive and ${report.fixtureCounts.negative} negative fixtures; C03-diagnostic actual public-output acceptance is not claimed.`);
      for (const error of report.errors) console.error(error);
    }
    return report.ok ? 0 : 1;
  } catch (error) {
    const report = { ok: false, C03Contract: 'FAIL', C03Diagnostic: 'NOT_CLAIMED', installedAcceptance: false, errors: [error.message] };
    if (json) console.log(JSON.stringify(report, null, 2)); else console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
