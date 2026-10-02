import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateContract } from './check-astrid-contract-freeze.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SUCCESSOR_PATH = path.join(REPO_ROOT, 'config/contracts/astrid-plan-a-c1-s1.json');
export const PREDECESSOR_PATH = path.join(REPO_ROOT, 'config/contracts/astrid-plan-a-c1.json');
const SHA256 = /^[0-9a-f]{64}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const GIT_OID = /^[0-9a-f]{40}$/;
const PRODUCT_SCOPES = [
  'handshake', 'projects:read', 'projects:write', 'tasks:read', 'tasks:write',
  'objects:read', 'objects:write',
];
const NON_PRODUCT_SCOPES = ['admin', 'credentials:provision', 'worker:execute', 'worker:register'];
const AUTHORITY_SOURCE_PATHS = [
  'banodoco_local/bootstrap.py',
  'runtime_protocol/auth.py',
  'runtime_protocol/daemon.py',
  'runtime_protocol/server.py',
  'runtime_protocol/service.py',
];
const SUPERSEDED_RUNTIME_EVIDENCE_IDS = [
  'runtime-cli', 'runtime-paths', 'runtime-bootstrap',
  'runtime-contract', 'runtime-task', 'runtime-worker',
];
const UNTRACKED_SOURCE_PATHS = [];
const RUNTIME_REPOSITORY = 'banodoco/banodoco-workspace-runtime';
const RUNTIME_REMOTE = 'https://github.com/banodoco/banodoco-workspace-runtime.git';
const CLAIM_BOUNDARY = 'For this exact pinned Runtime source and its current HTTP authorization-route census, the authenticated bearer has no HTTP API authority beyond the seven product scopes.';
function exactKeys(value, expected, label, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${label}: expected object`);
    return;
  }
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  for (const key of actual) if (!allowed.includes(key)) errors.push(`${label}: unknown field ${key}`);
  for (const key of allowed) if (!actual.includes(key)) errors.push(`${label}: missing field ${key}`);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
export function computeSuccessorDigest(contract) {
  const { digest: _digest, ...body } = contract;
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex')}`;
}
export function computeRuntimeCensusDigest(census) {
  const { digest: _digest, ...body } = census;
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex')}`;
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function validateRuntimeCensusBinding(contract, repoRoot, runtimeRoot, errors) {
  const require = (condition, message) => { if (!condition) errors.push(message); };
  const binding = contract.change?.runtimeSourceCensus;
  exactKeys(binding, ['path', 'rawFileSha256', 'digest'], 'runtimeSourceCensus', errors);
  require(typeof binding?.path === 'string' && binding.path.length > 0 && !path.isAbsolute(binding.path), 'runtimeSourceCensus.path: repository-relative path required');
  require(SHA256.test(binding?.rawFileSha256 ?? ''), 'runtimeSourceCensus.rawFileSha256: malformed SHA-256');
  require(DIGEST.test(binding?.digest ?? ''), 'runtimeSourceCensus.digest: malformed SHA-256');
  let census;
  try {
    const root = realpathSync(repoRoot);
    const filename = realpathSync(path.resolve(root, binding.path));
    require(filename.startsWith(`${root}${path.sep}`), 'runtimeSourceCensus.path: source escapes repository root');
    const raw = readFileSync(filename);
    require(sha256(raw) === binding.rawFileSha256, 'runtimeSourceCensus.rawFileSha256: bound artifact bytes changed');
    census = JSON.parse(raw);
  } catch (error) {
    errors.push(`runtimeSourceCensus: ${error.message}`);
    return;
  }
  exactKeys(census, ['schemaVersion', 'kind', 'issuedOn', 'digest', 'repository', 'untrackedSources', 'authoritySources', 'predecessorSupersessions', 'authorityCensus'], 'runtimeSourceCensus.artifact', errors);
  exactKeys(census.repository, ['identity', 'canonicalRemote', 'head', 'tree', 'statusFormat', 'statusPorcelainSha256', 'diffFormat', 'trackedBinaryDiffSha256'], 'runtimeSourceCensus.repository', errors);
  exactKeys(census.authorityCensus, ['productScopes', 'nonProductScopes', 'completeStoredScopeDisclosure', 'claimBoundary', 'residual'], 'runtimeSourceCensus.authorityCensus', errors);
  require(census.schemaVersion === 1, 'runtimeSourceCensus.schemaVersion: expected 1');
  require(census.kind === 'astrid-plan-a-runtime-authority-census', 'runtimeSourceCensus.kind: unexpected kind');
  require(census.digest === binding.digest, 'runtimeSourceCensus.digest: contract binding mismatch');
  require(census.digest === computeRuntimeCensusDigest(census), 'runtimeSourceCensus.digest: canonical SHA-256 mismatch');
  require(census.repository?.identity === RUNTIME_REPOSITORY, 'runtimeSourceCensus.repository.identity: unexpected repository');
  require(census.repository?.canonicalRemote === RUNTIME_REMOTE, 'runtimeSourceCensus.repository.canonicalRemote: unexpected remote');
  require(GIT_OID.test(census.repository?.head ?? ''), 'runtimeSourceCensus.repository.head: malformed Git OID');
  require(GIT_OID.test(census.repository?.tree ?? ''), 'runtimeSourceCensus.repository.tree: malformed Git tree OID');
  require(census.repository?.statusFormat === 'git-status-porcelain-v1-nul', 'runtimeSourceCensus.repository.statusFormat: expected NUL porcelain v1');
  require(SHA256.test(census.repository?.statusPorcelainSha256 ?? ''), 'runtimeSourceCensus.repository.statusPorcelainSha256: malformed SHA-256');
  require(census.repository?.diffFormat === 'git-diff-binary', 'runtimeSourceCensus.repository.diffFormat: expected binary Git diff');
  require(SHA256.test(census.repository?.trackedBinaryDiffSha256 ?? ''), 'runtimeSourceCensus.repository.trackedBinaryDiffSha256: malformed SHA-256');
  require(sameArray(census.authorityCensus?.productScopes, PRODUCT_SCOPES), 'runtimeSourceCensus.authorityCensus.productScopes: exact seven-scope census required');
  require(sameArray(census.authorityCensus?.nonProductScopes, NON_PRODUCT_SCOPES), 'runtimeSourceCensus.authorityCensus.nonProductScopes: exact four-scope census required');
  require(census.authorityCensus?.completeStoredScopeDisclosure === false, 'runtimeSourceCensus.authorityCensus.completeStoredScopeDisclosure: must remain false');
  require(census.authorityCensus?.claimBoundary === CLAIM_BOUNDARY, 'runtimeSourceCensus.authorityCensus.claimBoundary: exact narrow claim required');
  require(typeof census.authorityCensus?.residual === 'string' && census.authorityCensus.residual.length > 0, 'runtimeSourceCensus.authorityCensus.residual: required');
  const sourcePaths = new Set();
  for (const source of census.authoritySources ?? []) {
    exactKeys(source, ['path', 'sha256', 'role'], `runtimeSourceCensus.authoritySources.${source?.path ?? '<missing>'}`, errors);
    require(typeof source.path === 'string' && source.path.length > 0 && !path.isAbsolute(source.path), 'runtimeSourceCensus.authoritySources: repository-relative paths required');
    require(!sourcePaths.has(source.path), `runtimeSourceCensus.authoritySources: duplicate path ${source.path}`);
    sourcePaths.add(source.path);
    require(SHA256.test(source.sha256 ?? ''), `runtimeSourceCensus.authoritySources.${source.path}: malformed SHA-256`);
    require(typeof source.role === 'string' && source.role.length > 0, `runtimeSourceCensus.authoritySources.${source.path}: role required`);
  }
  require(sourcePaths.size === AUTHORITY_SOURCE_PATHS.length && AUTHORITY_SOURCE_PATHS.every((sourcePath) => sourcePaths.has(sourcePath)), 'runtimeSourceCensus.authoritySources: exact authority-source census required');
  const untrackedPaths = new Set();
  for (const source of census.untrackedSources ?? []) {
    exactKeys(source, ['path', 'sha256'], `runtimeSourceCensus.untrackedSources.${source?.path ?? '<missing>'}`, errors);
    require(typeof source.path === 'string' && source.path.length > 0 && !path.isAbsolute(source.path), 'runtimeSourceCensus.untrackedSources: repository-relative paths required');
    require(!untrackedPaths.has(source.path), `runtimeSourceCensus.untrackedSources: duplicate path ${source.path}`);
    untrackedPaths.add(source.path);
    require(SHA256.test(source.sha256 ?? ''), `runtimeSourceCensus.untrackedSources.${source.path}: malformed SHA-256`);
  }
  require(untrackedPaths.size === UNTRACKED_SOURCE_PATHS.length && UNTRACKED_SOURCE_PATHS.every((sourcePath) => untrackedPaths.has(sourcePath)), 'runtimeSourceCensus.untrackedSources: exact live untracked-source census required');
  const predecessor = JSON.parse(readFileSync(PREDECESSOR_PATH, 'utf8'));
  const predecessorEvidence = new Map((predecessor.sourceEvidence ?? []).map((source) => [source.id, source]));
  const successorMappings = contract.change?.runtimeSourceSupersessions ?? [];
  const artifactMappings = census.predecessorSupersessions ?? [];
  const mappingIds = new Set();
  for (const mapping of successorMappings) {
    exactKeys(mapping, ['predecessorEvidenceId', 'path', 'predecessorSha256', 'successorSha256'], `runtimeSourceSupersessions.${mapping?.predecessorEvidenceId ?? '<missing>'}`, errors);
    const evidence = predecessorEvidence.get(mapping.predecessorEvidenceId);
    require(!mappingIds.has(mapping.predecessorEvidenceId), `runtimeSourceSupersessions: duplicate ID ${mapping.predecessorEvidenceId}`);
    mappingIds.add(mapping.predecessorEvidenceId);
    require(evidence?.repository === 'workspace-runtime', `runtimeSourceSupersessions.${mapping.predecessorEvidenceId}: predecessor must be Runtime evidence`);
    require(mapping.path === evidence?.path, `runtimeSourceSupersessions.${mapping.predecessorEvidenceId}: predecessor path mismatch`);
    require(mapping.predecessorSha256 === evidence?.sha256, `runtimeSourceSupersessions.${mapping.predecessorEvidenceId}: predecessor SHA-256 mismatch`);
    require(SHA256.test(mapping.successorSha256 ?? ''), `runtimeSourceSupersessions.${mapping.predecessorEvidenceId}: malformed successor SHA-256`);
  }
  require(mappingIds.size === SUPERSEDED_RUNTIME_EVIDENCE_IDS.length
    && SUPERSEDED_RUNTIME_EVIDENCE_IDS.every((id) => mappingIds.has(id)),
  'runtimeSourceSupersessions: exact six inherited Runtime mismatches must be superseded');
  require(JSON.stringify(canonical(successorMappings)) === JSON.stringify(canonical(artifactMappings)), 'runtimeSourceSupersessions: contract and census artifact mappings differ');
  if (!runtimeRoot) {
    errors.push('runtimeSourceCensus: live Runtime root is required for accepting validation');
    return;
  }
  try {
    const root = realpathSync(runtimeRoot);
    const git = (args, encoding = null) => execFileSync('git', ['-C', root, ...args], { encoding, maxBuffer: 64 * 1024 * 1024 });
    require(git(['remote', 'get-url', 'origin'], 'utf8').trim() === census.repository.canonicalRemote, 'runtimeSourceCensus.live.canonicalRemote: live Runtime remote drift');
    require(git(['rev-parse', 'HEAD'], 'utf8').trim() === census.repository.head, 'runtimeSourceCensus.live.head: live Runtime HEAD drift');
    require(git(['rev-parse', 'HEAD^{tree}'], 'utf8').trim() === census.repository.tree, 'runtimeSourceCensus.live.tree: live Runtime tree drift');
    require(sha256(git(['status', '--porcelain=v1', '-z'])) === census.repository.statusPorcelainSha256, 'runtimeSourceCensus.live.status: live Runtime NUL-status drift');
    require(sha256(git(['diff', '--binary'])) === census.repository.trackedBinaryDiffSha256, 'runtimeSourceCensus.live.diff: live Runtime tracked diff drift');
    const liveUntrackedPaths = git(['ls-files', '--others', '--exclude-standard', '-z'])
      .toString('utf8').split('\0').filter(Boolean);
    require(sameArray(liveUntrackedPaths, census.untrackedSources.map((source) => source.path)), 'runtimeSourceCensus.live.untrackedSources: live untracked path census drift');
    for (const source of census.untrackedSources) {
      const filename = realpathSync(path.resolve(root, source.path));
      require(filename.startsWith(`${root}${path.sep}`), `runtimeSourceCensus.live.${source.path}: untracked source escapes Runtime root`);
      require(sha256(readFileSync(filename)) === source.sha256, `runtimeSourceCensus.live.${source.path}: live untracked source drift`);
    }
    for (const source of census.authoritySources) {
      const filename = realpathSync(path.resolve(root, source.path));
      require(filename.startsWith(`${root}${path.sep}`), `runtimeSourceCensus.live.${source.path}: source escapes Runtime root`);
      require(sha256(readFileSync(filename)) === source.sha256, `runtimeSourceCensus.live.${source.path}: live Runtime source drift`);
    }
    for (const mapping of successorMappings) {
      const filename = realpathSync(path.resolve(root, mapping.path));
      require(filename.startsWith(`${root}${path.sep}`), `runtimeSourceSupersessions.live.${mapping.predecessorEvidenceId}: source escapes Runtime root`);
      require(sha256(readFileSync(filename)) === mapping.successorSha256, `runtimeSourceSupersessions.live.${mapping.predecessorEvidenceId}: live successor source drift`);
    }
  } catch (error) {
    errors.push(`runtimeSourceCensus.live: ${error.message}`);
  }
}

export function validateSuccessorContract(contract, { repoRoot = REPO_ROOT, runtimeRoot } = {}) {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  require(contract && typeof contract === 'object' && !Array.isArray(contract), 'contract: expected object');
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return errors;
  exactKeys(contract, ['schemaVersion', 'kind', 'revision', 'issuedOn', 'status', 'digest', 'predecessor', 'change', 'consumerAcknowledgements'], 'contract', errors);
  exactKeys(contract.predecessor, ['path', 'revision', 'digest', 'rawFileSha256', 'immutable'], 'predecessor', errors);
  exactKeys(contract.change, ['reason', 'runtimeSourceCensus', 'runtimeSourceSupersessions', 'appSourceSupersessions', 'sourceEvidence', 'consumerAckRefs'], 'change', errors);
  require(contract.schemaVersion === 1, 'schemaVersion: expected 1');
  require(contract.kind === 'astrid-contract-composition-successor', 'kind: unexpected successor kind');
  require(contract.revision === 'C1-S1', 'revision: expected C1-S1');
  require(contract.status === 'successor-pending-consumer-ack', 'status: successor must remain pending coordinator closeout');
  require(DIGEST.test(contract.digest ?? ''), 'digest: malformed SHA-256');
  require(contract.digest === computeSuccessorDigest(contract), 'digest: canonical SHA-256 mismatch');
  const predecessor = JSON.parse(readFileSync(PREDECESSOR_PATH, 'utf8'));
  require(contract.predecessor?.immutable === true, 'predecessor: immutable C1 binding required');
  require(contract.predecessor?.path === 'config/contracts/astrid-plan-a-c1.json', 'predecessor.path: expected C1 path');
  require(contract.predecessor?.revision === 'C1' && predecessor.revision === 'C1', 'predecessor.revision: expected C1');
  require(contract.predecessor?.digest === predecessor.digest, 'predecessor.digest: does not match C1');
  require(contract.predecessor?.rawFileSha256 === sha256(readFileSync(PREDECESSOR_PATH)), 'predecessor.rawFileSha256: immutable C1 bytes changed');
  validateRuntimeCensusBinding(contract, repoRoot, runtimeRoot, errors);
  const evidenceIds = new Set();
  const successorEvidence = new Map();
  for (const source of contract.change?.sourceEvidence ?? []) {
    exactKeys(source, ['id', 'path', 'sha256', 'role'], `sourceEvidence.${source?.id ?? '<missing>'}`, errors);
    require(typeof source.id === 'string' && source.id.length > 0, 'sourceEvidence: every entry needs an ID');
    require(typeof source.path === 'string' && source.path.length > 0 && !path.isAbsolute(source.path), `sourceEvidence.${source?.id ?? '<missing>'}: path must be relative`);
    require(typeof source.role === 'string' && source.role.length > 0, `sourceEvidence.${source?.id ?? '<missing>'}: role is required`);
    require(!evidenceIds.has(source.id), `sourceEvidence: duplicate ID ${source.id}`);
    evidenceIds.add(source.id);
    successorEvidence.set(source.id, source);
    require(SHA256.test(source.sha256 ?? ''), `sourceEvidence.${source.id}: malformed SHA-256`);
    try {
      const root = realpathSync(repoRoot);
      const filename = realpathSync(path.resolve(root, source.path));
      require(filename.startsWith(`${root}${path.sep}`), `sourceEvidence.${source.id}: source escapes repository root`);
      require(sha256(readFileSync(filename)) === source.sha256, `sourceEvidence.${source.id}: source SHA-256 mismatch`);
    } catch (error) { errors.push(`sourceEvidence.${source.id}: ${error.message}`); }
  }
  const expectedEvidenceRefs = [
    'local-launcher-current',
    'product-credential-helper',
    'paired-connector',
    'product-credential-tests',
    'runtime-source-census',
    'runtime-proxy-config',
    'runtime-proxy-policy',
    'runtime-proxy-regression-tests',
    'runtime-proxy-environment-example',
  ];
  require(evidenceIds.size === expectedEvidenceRefs.length
    && expectedEvidenceRefs.every((id) => evidenceIds.has(id)),
  'sourceEvidence: launcher, helper, connector, tests, Runtime census, Vite proxy, and environment example surfaces are required');
  const appSupersessions = contract.change?.appSourceSupersessions ?? [];
  const expectedAppSupersessions = new Map([
    ['local-launcher', 'local-launcher-current'],
    ['runtime-proxy', 'runtime-proxy-policy'],
  ]);
  require(appSupersessions.length === expectedAppSupersessions.size, 'appSourceSupersessions: exact local-launcher and runtime-proxy successor mappings required');
  const predecessorEvidence = new Map((predecessor.sourceEvidence ?? []).map((source) => [source.id, source]));
  const appMappingIds = new Set();
  for (const mapping of appSupersessions) {
    exactKeys(mapping, ['predecessorEvidenceId', 'successorEvidenceId', 'path', 'predecessorSha256', 'successorSha256'], `appSourceSupersessions.${mapping?.predecessorEvidenceId ?? '<missing>'}`, errors);
    const previous = predecessorEvidence.get(mapping.predecessorEvidenceId);
    const current = successorEvidence.get(mapping.successorEvidenceId);
    require(!appMappingIds.has(mapping.predecessorEvidenceId), `appSourceSupersessions: duplicate ID ${mapping.predecessorEvidenceId}`);
    appMappingIds.add(mapping.predecessorEvidenceId);
    require(expectedAppSupersessions.get(mapping.predecessorEvidenceId) === mapping.successorEvidenceId, `appSourceSupersessions.${mapping.predecessorEvidenceId}: unexpected successor evidence`);
    require(previous?.repository === 'reigh-app', `appSourceSupersessions.${mapping.predecessorEvidenceId}: predecessor repository mismatch`);
    require(mapping.path === previous?.path && mapping.path === current?.path, `appSourceSupersessions.${mapping.predecessorEvidenceId}: source path mismatch`);
    require(mapping.predecessorSha256 === previous?.sha256, `appSourceSupersessions.${mapping.predecessorEvidenceId}: predecessor SHA-256 mismatch`);
    require(mapping.successorSha256 === current?.sha256, `appSourceSupersessions.${mapping.predecessorEvidenceId}: successor SHA-256 mismatch`);
  }
  require(appMappingIds.size === expectedAppSupersessions.size
    && [...expectedAppSupersessions.keys()].every((id) => appMappingIds.has(id)),
  'appSourceSupersessions: exact local-launcher and runtime-proxy predecessor coverage required');
  require(typeof contract.change?.reason === 'string' && contract.change.reason.length > 0, 'change.reason: successor reason is required');
  const refs = contract.change?.consumerAckRefs ?? [];
  require(refs.length === 2 && refs[0] === 'sl-c1-s1-ack' && refs[1] === 'ew-c1-s1-ack', 'consumerAckRefs: exact SL/EW acknowledgements required');
  const acks = contract.consumerAcknowledgements ?? [];
  for (const ack of acks) exactKeys(ack, ['id', 'consumer', 'status', 'contractRevision', 'scope', 'sourceEvidenceRefs'], `consumerAcknowledgements.${ack?.id ?? '<missing>'}`, errors);
  const expectedAckConsumers = new Map([['sl-c1-s1-ack', 'SL'], ['ew-c1-s1-ack', 'EW']]);
  const seenAckIds = new Set();
  for (const ack of acks) {
    require(!seenAckIds.has(ack.id), `consumerAcknowledgements: duplicate ID ${ack.id}`);
    seenAckIds.add(ack.id);
    require(expectedAckConsumers.get(ack.id) === ack.consumer, `consumerAcknowledgements.${ack.id}: acknowledgement must bind to ${expectedAckConsumers.get(ack.id) ?? 'its declared consumer'}`);
  }
  require(acks.length === expectedAckConsumers.size
    && [...expectedAckConsumers.keys()].every((id) => seenAckIds.has(id))
    && acks.every((ack) => expectedAckConsumers.has(ack.id)
      && ack.status === 'pending-exact-consumer-ack'
      && ack.contractRevision === contract.revision),
  'consumerAcknowledgements: exact pending SL/EW successor bindings required');
  require(acks.every((ack) => Array.isArray(ack.sourceEvidenceRefs)
    && ack.sourceEvidenceRefs.length === expectedEvidenceRefs.length
    && [...ack.sourceEvidenceRefs].sort().join('|') === [...expectedEvidenceRefs].sort().join('|')),
  'consumerAcknowledgements: every launcher, credential, Runtime census, Vite proxy, and environment example evidence row must be bound exactly');
  return errors;
}

const KNOWN_C1_SUCCESSOR_DRIFT = new Set([
  'sourceEvidence.local-launcher: source SHA-256 mismatch',
  'sourceEvidence.runtime-proxy: source SHA-256 mismatch',
  ...SUPERSEDED_RUNTIME_EVIDENCE_IDS.map((id) => `sourceEvidence.${id}: source SHA-256 mismatch`),
]);

function parseRoots(argv) {
  const roots = {};
  const explicitRepositories = new Set();
  const environmentRuntimeRoot = process.env.ASTRID_RUNTIME_SOURCE_ROOT?.trim();
  if (environmentRuntimeRoot) roots['workspace-runtime'] = path.resolve(environmentRuntimeRoot);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--json') continue;
    const repository = { '--astrid-root': 'Astrid', '--runtime-root': 'workspace-runtime' }[flag];
    if (!repository) throw new Error(`unknown argument: ${flag}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a path`);
    if (explicitRepositories.has(repository)) throw new Error(`duplicate argument: ${flag}`);
    explicitRepositories.add(repository);
    roots[repository] = path.resolve(value);
  }
  return roots;
}

/**
 * The active composition gate binds the current-source successor while still
 * checking every immutable C1 rule. Exact launcher/proxy drift and the six
 * mapped Runtime source rows are represented by C1-S1 evidence; every other
 * C1 failure remains fatal. Accepting validation requires the bound live
 * Runtime root. The raw C1 checker remains the historical audit command.
 */
export function validateActiveComposition({ repoRoots = {} } = {}) {
  const predecessor = JSON.parse(readFileSync(PREDECESSOR_PATH, 'utf8'));
  const successor = JSON.parse(readFileSync(SUCCESSOR_PATH, 'utf8'));
  const predecessorErrors = validateContract(predecessor, { repoRoots })
    .filter((error) => !KNOWN_C1_SUCCESSOR_DRIFT.has(error));
  return {
    successor,
    errors: [...predecessorErrors, ...validateSuccessorContract(successor, {
      runtimeRoot: repoRoots['workspace-runtime'],
    })],
    toleratedPredecessorErrors: validateContract(predecessor, { repoRoots })
      .filter((error) => KNOWN_C1_SUCCESSOR_DRIFT.has(error)),
  };
}

export function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  try {
    const roots = parseRoots(argv);
    const { successor, errors, toleratedPredecessorErrors } = validateActiveComposition({ repoRoots: roots });
    const report = {
      ok: errors.length === 0,
      revision: successor.revision,
      digest: successor.digest,
      errors,
      runtimeIdentityVerified: Boolean(roots['workspace-runtime'])
        && !errors.some((error) => error.startsWith('runtimeSourceCensus.live')
          || error.includes('live Runtime root is required')),
      predecessor: { revision: 'C1', rawAudit: 'historical', toleratedErrors: toleratedPredecessorErrors },
    };
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`${report.ok ? 'PASS' : 'FAIL'} Astrid ${report.revision}: ${report.digest}`);
      if (toleratedPredecessorErrors.length > 0) console.log(`C1 historical audit: tolerated ${toleratedPredecessorErrors.join('; ')}`);
      if (!report.ok) errors.forEach((error) => console.error(error));
    }
    return report.ok ? 0 : 1;
  } catch (error) {
    if (json) console.log(JSON.stringify({ ok: false, errors: [error.message] })); else console.error(error.message);
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = main();
