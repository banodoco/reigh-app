import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { computeContractDigest, validateContract, validateDiagnostic } from './check-astrid-contract-c2.mjs';
import { computeContractDigest as computeC1Digest } from './check-astrid-contract-freeze.mjs';
import { createHash } from 'node:crypto';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const checker = path.join(root, 'scripts/quality/check-astrid-contract-c2.mjs');
const contract = JSON.parse(readFileSync(path.join(root, 'config/contracts/astrid-plan-a-c2.json'), 'utf8'));
const fixture = (name) => JSON.parse(readFileSync(path.join(root, 'tests/fixtures/astrid-plan-a/c2', name), 'utf8'));
const clone = (value) => structuredClone(value);

test('C2 validates and binds immutable C1 raw and canonical identities', () => {
  const result = validateContract(contract);
  assert.deepEqual(result.errors, []);
  assert.equal(computeContractDigest(contract), contract.digest);
  const c1Bytes = readFileSync(path.join(root, contract.predecessor.path));
  const c1 = JSON.parse(c1Bytes);
  assert.equal(createHash('sha256').update(c1Bytes).digest('hex'), contract.predecessor.rawFileSha256);
  assert.equal(computeC1Digest(c1), contract.predecessor.canonicalDigest);
});

test('healthy null/null, failure paired values, and unobserved facts validate', () => {
  for (const name of ['healthy.json', 'runtime-unavailable.json', 'unknown-independent-facts.json']) {
    assert.deepEqual(validateDiagnostic(fixture(name), contract), [], name);
  }
});

test('healthy and failure pairing fails closed', () => {
  const diagnostic = fixture('healthy.json');
  diagnostic.problemCode = 'runtime_unavailable';
  assert.match(validateDiagnostic(diagnostic, contract).join('\n'), /must be paired/);
  diagnostic.problemCode = null;
  diagnostic.failureBoundary = 'runtime-contact';
  assert.match(validateDiagnostic(diagnostic, contract).join('\n'), /must be paired/);
});

test('five-second deadline and bounded capture are total limits', () => {
  const diagnostic = fixture('healthy.json');
  diagnostic.timing.elapsedMs = 5001;
  diagnostic.captured.events = 201;
  const errors = validateDiagnostic(diagnostic, contract).join('\n');
  assert.match(errors, /exceeds total deadline/);
  assert.match(errors, /captured.events/);
});

test('unknown independent facts cannot acquire inferred values', () => {
  const diagnostic = fixture('unknown-independent-facts.json');
  diagnostic.facts.providerExecution.value = 'stopped';
  assert.match(validateDiagnostic(diagnostic, contract).join('\n'), /unobserved fact must preserve null/);
});

test('shared redaction and inert placeholder actions fail closed', () => {
  const diagnostic = fixture('runtime-unavailable.json');
  diagnostic.facts.workspace.value = '/Users/person/private-workspace';
  diagnostic.nextActions[0].executable = true;
  const errors = validateDiagnostic(diagnostic, contract).join('\n');
  assert.match(errors, /shared output contains sensitive material/);
  assert.match(errors, /redacted placeholder must be inert/);
});

test('collection cannot execute effectful actions', () => {
  const diagnostic = fixture('healthy.json');
  diagnostic.actionsExecuted = ['runtime-up'];
  assert.match(validateDiagnostic(diagnostic, contract).join('\n'), /must not start, repair, upload, spend, or execute/);
});

test('projection shape rejects unknown fields and malformed primitive fact values', () => {
  const diagnostic = fixture('healthy.json');
  diagnostic.unexpected = true;
  diagnostic.timing.unexpected = true;
  diagnostic.facts.workspace.unexpected = true;
  diagnostic.facts.workspace.value = { state: 'selected' };
  const errors = validateDiagnostic(diagnostic, contract).join('\n');
  assert.match(errors, /diagnostic.unexpected: unknown field/);
  assert.match(errors, /timing.unexpected: unknown field/);
  assert.match(errors, /facts.workspace.unexpected: unknown field/);
  assert.match(errors, /facts.workspace.value: expected string, boolean, finite number, or null/);
});

test('actions bind command IDs to exact predecessor C1 effects', () => {
  const unknown = fixture('unknown-independent-facts.json');
  unknown.nextActions[0].commandId = 'runtime-probe';
  assert.match(validateDiagnostic(unknown, contract).join('\n'), /unknown C1 command/);

  const mismatch = fixture('unknown-independent-facts.json');
  mismatch.nextActions[0].effects = ['observe', 'write-relocate-change-data'];
  assert.match(validateDiagnostic(mismatch, contract).join('\n'), /must exactly match C1 command effects/);
});

test('contract mutations cannot create duplicate Runtime authority or claim downstream acceptance', () => {
  for (const [change, pattern] of [
    [(c) => { c.authority.runtimeWireOwner = 'Astrid'; }, /duplicate Runtime authority/],
    [(c) => { c.diagnostic.collectionEffects = ['observe', 'start-stop-local-service']; }, /must only observe/],
    [(c) => { c.generatedClientCompatibility.authorityStatus = 'accepted'; }, /must remain held/],
    [(c) => { c.gates.C03Diagnostic = 'PASS'; }, /must remain unclaimed/],
    [(c) => { c.unresolvedAuthority[0].status = 'resolved'; }, /must remain pending/],
  ]) {
    const changed = clone(contract);
    change(changed);
    changed.digest = computeContractDigest(changed);
    assert.match(validateContract(changed).errors.join('\n'), pattern);
  }
});

test('CLI validates declared fixtures and reports no installed/public-output acceptance', () => {
  const result = spawnSync(process.execPath, [checker, '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.deepEqual(report.fixtureCounts, { positive: 3, negative: 11 });
  assert.equal(report.C03Contract, 'PASS');
  assert.equal(report.C03Diagnostic, 'NOT_CLAIMED');
  assert.equal(report.installedAcceptance, false);
});
