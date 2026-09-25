import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { computeContractDigest, validateContract, validateDiagnostic } from './check-astrid-contract-freeze.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const checker = path.join(root, 'scripts/quality/check-astrid-contract-freeze.mjs');
const original = JSON.parse(readFileSync(path.join(root, 'config/contracts/astrid-plan-a-c1.json'), 'utf8'));
const clone = () => structuredClone(original);
const seal = (contract) => { contract.digest = computeContractDigest(contract); return contract; };
function corrupt(change, pattern) {
  const contract = clone();
  change(contract);
  assert.match(validateContract(seal(contract)).join('\n'), pattern);
}
function temporary(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'astrid-cf-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function fixtureSources(contract, directory, repository) {
  for (const source of contract.sourceEvidence.filter((entry) => entry.repository === repository)) {
    const filename = path.join(directory, source.path);
    mkdirSync(path.dirname(filename), { recursive: true });
    const bytes = `source fixture: ${source.id}\n`;
    writeFileSync(filename, bytes);
    source.sha256 = createHash('sha256').update(bytes).digest('hex');
  }
}

test('C1 artifact passes local source verification without external checkouts', () => {
  assert.deepEqual(validateContract(original), []);
});

test('digest recursively canonicalizes object keys, preserves arrays and nested digest', () => {
  assert.equal(computeContractDigest({ digest: 'old', b: { y: 2, x: 1 }, a: [3, 2] }),
    computeContractDigest({ a: [3, 2], b: { x: 1, y: 2 }, digest: 'new' }));
  assert.notEqual(computeContractDigest({ a: [3, 2] }), computeContractDigest({ a: [2, 3] }));
  assert.notEqual(computeContractDigest({ a: { digest: 'a' } }), computeContractDigest({ a: { digest: 'b' } }));
  const changed = clone();
  changed.workspace.rootPolicy += ' altered';
  assert.match(validateContract(changed).join('\n'), /digest: canonical SHA-256 mismatch/);
});

test('frozen local/hosted gates and separate contributor authority reject inversion', () => {
  corrupt((c) => { c.auth.contexts[0].discordRequired = true; }, /incorrect session gate/);
  corrupt((c) => { c.auth.contexts[1].discordRequired = false; }, /incorrect session gate/);
  corrupt((c) => { c.auth.contribution.rawKeySharing = true; }, /rawKeySharing/);
  corrupt((c) => { c.auth.independentAuthorities.pop(); }, /independentAuthorities/);
  corrupt((c) => { c.auth.modeTransitions.hostedFailureGatesLocal = true; }, /hostedFailureGatesLocal/);
});

test('observation cannot gain side effects or omit independent readiness', () => {
  corrupt((c) => { c.commands.find((entry) => entry.id === 'doctor').effects.push('start-stop-local-service'); }, /commands.doctor.effects/);
  corrupt((c) => { c.observation.provisioning = true; }, /observation.provisioning/);
  corrupt((c) => { c.observation.defaultLimits.maxEvents = 100000; }, /maxEvents/);
  corrupt((c) => { c.states.readinessDimensions.pop(); }, /readinessDimensions/);
  corrupt((c) => { c.execution.stopImpliesRemoteSettlement = true; }, /stopImpliesRemoteSettlement/);
  corrupt((c) => { c.commands.find((entry) => entry.id === 'runtime-up').effects = ['observe']; }, /commands.runtime-up.effects/);
  corrupt((c) => { c.commands = c.commands.filter((entry) => entry.id !== 'restore'); }, /commands: expected exact/);
  corrupt((c) => { c.migrations = c.migrations.filter((entry) => entry.id !== 'doctor-observation'); }, /migrations: expected exact/);
});

test('single-workspace setup cannot infer selection, cwd, or a second identity', () => {
  corrupt((c) => { c.workspace.count = 2; }, /workspace.count/);
  corrupt((c) => { c.workspace.selection = 'automatic'; }, /workspace.selection/);
  corrupt((c) => { c.workspace.identity = 'project-or-user'; }, /workspace.identity/);
  corrupt((c) => { c.workspace.cwdFallback = true; }, /workspace.cwdFallback/);
  corrupt((c) => { c.workspace.implicitSecondWorkspace = true; }, /workspace.implicitSecondWorkspace/);
  corrupt((c) => { c.workspace.expertOverride = 'switch-default'; }, /workspace.expertOverride/);
  corrupt((c) => { c.setup.applyStages = c.setup.applyStages.filter((stage) => stage !== 'Create-or-Attach'); }, /setup.applyStages/);
  corrupt((c) => { [c.setup.applyStages[0], c.setup.applyStages[1]] = [c.setup.applyStages[1], c.setup.applyStages[0]]; }, /setup.applyStages: expected exact ordered values/);
  corrupt((c) => { c.setup.resumePolicy = 'create-again'; }, /setup.resumePolicy/);
});

test('runtime ownership and observation reject port-only adoption and hidden startup', () => {
  corrupt((c) => { c.execution.processOwnership = 'matching-port-is-owner'; }, /execution.processOwnership/);
  corrupt((c) => { c.observation.startsProcesses = true; }, /observation.startsProcesses/);
  corrupt((c) => { c.observation.provisioning = true; }, /observation.provisioning/);
  corrupt((c) => { c.setup.checkStartsProcesses = true; }, /setup.checkStartsProcesses/);
  corrupt((c) => { c.commands.find((entry) => entry.id === 'runtime-status').effects = ['start-stop-local-service']; }, /commands.runtime-status.effects/);
  corrupt((c) => { c.commands.find((entry) => entry.id === 'runtime-connect').effects = ['observe']; }, /commands.runtime-connect.effects/);
});

test('startup preservation and bounded recovery remain explicit distinct effects', () => {
  corrupt((c) => { c.setup.startupFailure = 'rollback-workspace'; }, /setup.startupFailure/);
  corrupt((c) => { c.setup.retryCommandId = 'task-retry'; }, /setup.retryCommandId/);
  corrupt((c) => { c.commands.find((entry) => entry.id === 'backup').effects = ['observe']; }, /commands.backup.effects/);
  corrupt((c) => { c.commands.find((entry) => entry.id === 'restore').effects = ['observe']; }, /commands.restore.effects/);
  corrupt((c) => { c.commands.find((entry) => entry.id === 'recovery').effects = ['observe']; }, /commands.recovery.effects/);
  corrupt((c) => { c.unresolved.find((entry) => entry.id === 'preservation-preflight').requiredBefore = 'CF-CLOSE'; }, /preservation-preflight/);
});

test('dangling or wrongly typed future outputs cannot masquerade as delivered inputs', () => {
  corrupt((c) => { c.setup.inputRef = 'absent'; }, /unknown unresolved reference absent/);
  corrupt((c) => { c.setup.inputRef = 'hosted-auth-protocol'; }, /expected setup-delivery/);
  corrupt((c) => { c.unresolved[0].kind = 'consumer-ack'; }, /workspace-inventory: expected physical-inventory/);
  corrupt((c) => { c.unresolved[0].requiredBefore = 'installed-acceptance'; }, /workspace-inventory: expected physical-inventory/);
  corrupt((c) => { c.unresolved[0].status = 'resolved'; }, /status/);
  corrupt((c) => { c.unresolved[0].digest = 'sha256:' + '1'.repeat(64); }, /Unrecognized key/);
  corrupt((c) => { c.scope.consumerAckRefs = ['sl-ack']; }, /consumerAckRefs/);
  corrupt((c) => { c.evidencePolicy.gatesClaimed = ['CF-M1']; }, /gatesClaimed/);
  corrupt((c) => { c.scope.installedAcceptanceClaim = true; }, /installedAcceptanceClaim/);
});

test('malformed schema, duplicate IDs, unsafe paths, and missing evidence fail closed', () => {
  assert.match(validateContract(null).join('\n'), /expected object/);
  corrupt((c) => { c.unexpected = true; }, /Unrecognized key/);
  corrupt((c) => { c.sourceEvidence[0].sha256 = 'not-a-hash'; }, /sha256/);
  corrupt((c) => { c.sourceEvidence.push(c.sourceEvidence[0]); }, /duplicate ID/);
  corrupt((c) => { c.commands.push(c.commands[0]); }, /commands: duplicate ID/);
  corrupt((c) => { c.commands[0].evidenceRefs = ['missing-source']; }, /unknown evidence reference missing-source/);
  corrupt((c) => { c.sourceEvidence[0].path = '../outside'; }, /contained relative/);
  corrupt((c) => { c.sourceEvidence[0].sha256 = '0'.repeat(64); }, /source SHA-256 mismatch/);
});

test('composition retains all nineteen packs, experimental labels and declared pins', () => {
  corrupt((c) => { c.composition.shippedPacks.pop(); }, /composition.shippedPacks/);
  corrupt((c) => { c.composition.shippedPacks.find((pack) => pack.id === 'wan2gp').stability = 'stable'; }, /wan2gp: incorrect stability/);
  corrupt((c) => { c.composition.externalSources[0].revision = '0'.repeat(40); }, /expected sole declared Hivemind/);
  corrupt((c) => { c.composition.declaredEngineRevision.revision = '0'.repeat(40); }, /changed declared VibeComfy pin/);
  corrupt((c) => { c.composition.observedHeads[0].custodyPin = true; }, /custodyPin/);
});

test('explicit external root verifies observed bytes and rejects source drift', (t) => {
  const directory = temporary(t);
  const contract = clone();
  fixtureSources(contract, directory, 'Astrid');
  seal(contract);
  assert.deepEqual(validateContract(contract, { repoRoots: { Astrid: directory } }), []);
  const source = contract.sourceEvidence.find((entry) => entry.repository === 'Astrid');
  writeFileSync(path.join(directory, source.path), 'changed source');
  assert.match(validateContract(contract, { repoRoots: { Astrid: directory } }).join('\n'), /source SHA-256 mismatch/);
});

test('explicit source roots reject a symlink escape', (t) => {
  const directory = temporary(t);
  const contract = clone();
  fixtureSources(contract, directory, 'Astrid');
  const source = contract.sourceEvidence.find((entry) => entry.repository === 'Astrid');
  const filename = path.join(directory, source.path);
  rmSync(filename);
  symlinkSync(path.join(root, 'package.json'), filename);
  assert.match(validateContract(seal(contract), { repoRoots: { Astrid: directory } }).join('\n'), /escapes repository root/);
});

function diagnostic() {
  return {
    schemaVersion: 1, contractRevision: original.revision, contractDigest: original.digest,
    collectedAt: '2026-09-23T12:00:00Z', versions: { runtime: 'observed-version' },
    workspaceRef: 'workspace-redacted', taskRef: null, runRef: null, attemptRef: null, targetRef: null,
    problemCode: 'runtime_unavailable', rawRuntimeCode: null, failureBoundary: 'runtime-contact', stillWorks: ['local workspace selection'],
    lastContactAt: null, progress: null, uncertainty: 'unknown', limits: { ...original.observation.defaultLimits },
    truncated: false, nextActions: [{ commandId: 'runtime-status', arguments: [], effects: ['observe'], authorizationRequired: false }],
    freshness: { state: 'unknown', observedAt: null, maxAgeMs: 5000 }, terminalResult: null, redacted: true,
    unavailableReasons: { taskRef: 'not selected', runRef: 'not selected', attemptRef: 'not selected', targetRef: 'not selected' },
  };
}

test('diagnostic projection binds contract, bounds, unavailable facts and effect-classified actions', () => {
  assert.deepEqual(validateDiagnostic(diagnostic(), original), []);
  for (const [change, pattern] of [
    [(d) => { d.contractDigest = 'sha256:' + '0'.repeat(64); }, /identity mismatch/],
    [(d) => { d.collectedAt = 'yesterday'; }, /collectedAt/],
    [(d) => { d.nextActions[0].effects = ['may-spend-money']; }, /mismatched effects/],
    [(d) => { d.nextActions[0].commandId = 'invented-repair'; }, /unknown command/],
    [(d) => { d.limits.maxEvents += 1; }, /exceeds contract bound/],
    [(d) => { delete d.unavailableReasons.taskRef; }, /null requires unavailable reason/],
    [(d) => { d.redacted = false; }, /must be redacted/],
    [(d) => { d.progress = { completed: 4, total: 2, unit: 'frames' }; }, /completed exceeds total/],
    [(d) => { d.terminalResult = { source: 'Runtime', state: 'cancel_requested' }; }, /terminalResult.state/],
    [(d) => { d.freshness.state = 'fresh'; }, /fresh requires an observation timestamp/],
    [(d) => { d.nextActions = [{ commandId: 'task-retry', arguments: [], effects: ['may-spend-money', 'write-relocate-change-data'], authorizationRequired: false }]; }, /requires scoped authorization/],
  ]) {
    const packet = diagnostic(); change(packet);
    assert.match(validateDiagnostic(packet, original).join('\n'), pattern);
  }
});

test('CLI emits JSON verification limits and rejects bad arguments with nonzero exit', () => {
  const run = (...args) => spawnSync(process.execPath, [checker, '--json', ...args], { encoding: 'utf8', cwd: tmpdir() });
  const success = run();
  assert.equal(success.status, 0, success.stderr);
  const report = JSON.parse(success.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.installedAcceptance, false);
  assert.equal(report.sourceVerification.verified.length, original.sourceEvidence.filter((entry) => entry.repository === 'reigh-app').length);
  assert.equal(report.sourceVerification.unverified.length, original.sourceEvidence.filter((entry) => entry.repository !== 'reigh-app').length);
  for (const args of [['--unknown'], ['--astrid-root'], ['--runtime-root', '/nonexistent-astrid-cf-fixture']]) {
    const failed = run(...args);
    assert.equal(failed.status, 1);
    assert.equal(JSON.parse(failed.stdout).ok, false);
  }
});
