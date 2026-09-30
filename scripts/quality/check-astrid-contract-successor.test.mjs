import assert from 'node:assert/strict';
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import {
  computeSuccessorDigest,
  validateSuccessorContract,
} from './check-astrid-contract-successor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const contractPath = path.join(root, 'config/contracts/astrid-plan-a-c1-s1.json');
const checkerPath = path.join(root, 'scripts/quality/check-astrid-contract-successor.mjs');
const runtimeRoot = path.resolve(root, '../banodoco-workspace-runtime');
const original = JSON.parse(readFileSync(contractPath, 'utf8'));

function validate(contract, options = {}) {
  return validateSuccessorContract(contract, { runtimeRoot, ...options });
}

function exactRuntimeFixture() {
  const parent = mkdtempSync(path.join(tmpdir(), 'astrid-runtime-census-'));
  const fixture = path.join(parent, 'runtime');
  execFileSync('git', ['clone', '--shared', runtimeRoot, fixture], { stdio: 'ignore' });
  execFileSync('git', ['-C', fixture, 'remote', 'set-url', 'origin', 'https://github.com/banodoco/banodoco-workspace-runtime.git']);
  const entries = execFileSync('git', ['-C', runtimeRoot, 'status', '--porcelain=v1', '-z'])
    .toString('utf8').split('\0').filter(Boolean);
  for (const entry of entries) {
    const relative = entry.slice(3);
    const destination = path.join(fixture, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(runtimeRoot, relative), destination);
  }
  return fixture;
}

function cloneContract() {
  return structuredClone(original);
}

function reseal(contract) {
  contract.digest = computeSuccessorDigest(contract);
  return contract;
}

test('C1-S1 validates as a pending successor and keeps host-boundary governance separate', () => {
  assert.deepEqual(validate(original), []);
  assert.equal(original.predecessor.immutable, true);
  assert.equal(original.change.hostApiEntrypoints, undefined);
  assert.equal(original.change.architectureGovernance, undefined);
  assert.equal(original.consumerAcknowledgements.every((ack) => ack.status === 'pending-exact-consumer-ack'), true);
});

test('successor rejects predecessor drift, missing source evidence, and premature acknowledgement', () => {
  const predecessorDrift = cloneContract();
  predecessorDrift.predecessor.digest = `sha256:${'0'.repeat(64)}`;
  assert.match(validate(reseal(predecessorDrift)).join('\n'), /predecessor.digest/);

  const predecessorBytesDrift = cloneContract();
  predecessorBytesDrift.predecessor.rawFileSha256 = `0${predecessorBytesDrift.predecessor.rawFileSha256.slice(1)}`;
  assert.match(validate(reseal(predecessorBytesDrift)).join('\n'), /predecessor.rawFileSha256/);

  const missingEvidence = cloneContract();
  missingEvidence.change.sourceEvidence = missingEvidence.change.sourceEvidence.filter(
    (entry) => entry.id !== 'product-credential-tests',
  );
  assert.match(validate(reseal(missingEvidence)).join('\n'), /sourceEvidence: launcher, helper, connector, tests, Runtime census, Vite proxy, and environment example surfaces are required/);

  for (const evidenceId of [
    'runtime-proxy-config',
    'runtime-proxy-policy',
    'runtime-proxy-regression-tests',
    'runtime-proxy-environment-example',
  ]) {
    const missingProxyEvidence = cloneContract();
    missingProxyEvidence.change.sourceEvidence = missingProxyEvidence.change.sourceEvidence
      .filter((entry) => entry.id !== evidenceId);
    for (const acknowledgement of missingProxyEvidence.consumerAcknowledgements) {
      acknowledgement.sourceEvidenceRefs = acknowledgement.sourceEvidenceRefs
        .filter((id) => id !== evidenceId);
    }
    assert.match(validate(reseal(missingProxyEvidence)).join('\n'), /Vite proxy, and environment example surfaces are required/);
  }

  const acknowledged = cloneContract();
  acknowledged.consumerAcknowledgements[0].status = 'acknowledged';
  assert.match(validate(reseal(acknowledged)).join('\n'), /consumerAcknowledgements/);

  const wrongConsumer = cloneContract();
  wrongConsumer.consumerAcknowledgements[0].consumer = 'EW';
  assert.match(validate(reseal(wrongConsumer)).join('\n'), /must bind to SL/);

  const duplicateAck = cloneContract();
  duplicateAck.consumerAcknowledgements[1].id = duplicateAck.consumerAcknowledgements[0].id;
  assert.match(validate(reseal(duplicateAck)).join('\n'), /duplicate ID/);

  const missingProxyAckRef = cloneContract();
  missingProxyAckRef.consumerAcknowledgements[0].sourceEvidenceRefs =
    missingProxyAckRef.consumerAcknowledgements[0].sourceEvidenceRefs
      .filter((id) => id !== 'runtime-proxy-config');
  assert.match(validate(reseal(missingProxyAckRef)).join('\n'), /Vite proxy, and environment example evidence row must be bound exactly/);

  const missingEnvironmentAckRef = cloneContract();
  missingEnvironmentAckRef.consumerAcknowledgements[1].sourceEvidenceRefs =
    missingEnvironmentAckRef.consumerAcknowledgements[1].sourceEvidenceRefs
      .filter((id) => id !== 'runtime-proxy-environment-example');
  assert.match(validate(reseal(missingEnvironmentAckRef)).join('\n'), /Vite proxy, and environment example evidence row must be bound exactly/);
});

test('successor schema rejects unknown fields, missing fields, duplicate IDs, path escape, and digest mutation', () => {
  const unknown = cloneContract();
  unknown.unexpected = true;
  assert.match(validate(reseal(unknown)).join('\n'), /contract: unknown field unexpected/);

  const missing = cloneContract();
  delete missing.change.reason;
  assert.match(validate(reseal(missing)).join('\n'), /change: missing field reason/);

  const duplicate = cloneContract();
  duplicate.change.sourceEvidence[1].id = duplicate.change.sourceEvidence[0].id;
  assert.match(validate(reseal(duplicate)).join('\n'), /sourceEvidence: duplicate ID/);

  const escape = cloneContract();
  escape.change.sourceEvidence[0].path = '../package.json';
  assert.match(validate(reseal(escape)).join('\n'), /sourceEvidence.local-launcher-current/);

  const digest = cloneContract();
  digest.digest = `sha256:${'0'.repeat(64)}`;
  assert.match(validate(digest).join('\n'), /digest: canonical SHA-256 mismatch/);
});

test('successor requires the exact Runtime census and complete C1 supersession coverage', () => {
  assert.match(validateSuccessorContract(original).join('\n'), /live Runtime root is required/);

  const missingCensus = cloneContract();
  delete missingCensus.change.runtimeSourceCensus;
  assert.match(validate(reseal(missingCensus)).join('\n'), /runtimeSourceCensus/);

  const driftedCensus = cloneContract();
  driftedCensus.change.runtimeSourceCensus.rawFileSha256 = `0${driftedCensus.change.runtimeSourceCensus.rawFileSha256.slice(1)}`;
  assert.match(validate(reseal(driftedCensus)).join('\n'), /bound artifact bytes changed/);

  const incompleteSupersession = cloneContract();
  incompleteSupersession.change.runtimeSourceSupersessions.pop();
  assert.match(validate(reseal(incompleteSupersession)).join('\n'), /exact six inherited Runtime mismatches/);

  const duplicateSupersession = cloneContract();
  duplicateSupersession.change.runtimeSourceSupersessions[5] = structuredClone(
    duplicateSupersession.change.runtimeSourceSupersessions[0],
  );
  assert.match(validate(reseal(duplicateSupersession)).join('\n'), /duplicate ID/);

  const missingAppSupersession = cloneContract();
  missingAppSupersession.change.appSourceSupersessions.pop();
  assert.match(validate(reseal(missingAppSupersession)).join('\n'), /exact local-launcher and runtime-proxy successor mappings required/);

  const duplicateAppSupersession = cloneContract();
  duplicateAppSupersession.change.appSourceSupersessions[1] = structuredClone(
    duplicateAppSupersession.change.appSourceSupersessions[0],
  );
  assert.match(validate(reseal(duplicateAppSupersession)).join('\n'), /appSourceSupersessions: duplicate ID/);

  const driftedAppSupersession = cloneContract();
  driftedAppSupersession.change.appSourceSupersessions[1].successorSha256 = '0'.repeat(64);
  assert.match(validate(reseal(driftedAppSupersession)).join('\n'), /successor SHA-256 mismatch/);
});

test('live Runtime drift fails the ordinary accepting checker', () => {
  const fixture = exactRuntimeFixture();
  assert.deepEqual(validateSuccessorContract(original, { runtimeRoot: fixture }), []);
  appendFileSync(path.join(fixture, 'runtime_protocol/server.py'), '\n# deliberate census drift\n');
  assert.match(
    validateSuccessorContract(original, { runtimeRoot: fixture }).join('\n'),
    /live Runtime (NUL-status|tracked diff|source) drift/,
  );

  const untrackedFixture = exactRuntimeFixture();
  assert.deepEqual(validateSuccessorContract(original, { runtimeRoot: untrackedFixture }), []);
  appendFileSync(path.join(untrackedFixture, 'runtime_protocol/handoff_recovery.py'), '\n# deliberate untracked drift\n');
  assert.match(
    validateSuccessorContract(original, { runtimeRoot: untrackedFixture }).join('\n'),
    /live untracked source drift/,
  );
});

test('successor checker CLI stays green independently of immutable C1 and C2 checkers', () => {
  const rootlessEnvironment = { ...process.env };
  delete rootlessEnvironment.ASTRID_RUNTIME_SOURCE_ROOT;
  const rootless = spawnSync(process.execPath, [checkerPath, '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: rootlessEnvironment,
  });
  assert.notEqual(rootless.status, 0);
  assert.match(rootless.stdout, /live Runtime root is required/);

  const result = spawnSync(process.execPath, [checkerPath, '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ASTRID_RUNTIME_SOURCE_ROOT: runtimeRoot },
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.revision, 'C1-S1');
  assert.equal(report.digest, original.digest);
});
