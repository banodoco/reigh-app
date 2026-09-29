import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { readGeneratedSchemaDigest, schemaDigestMismatch } from './runtime-schema-guard.mjs';

describe('Runtime schema guard', () => {
  it('reads the generated digest and accepts a matching health response', () => {
    const dir = mkdtempSync(join(os.tmpdir(), 'reigh-runtime-schema-'));
    try {
      const metadataPath = join(dir, 'generated-contract-metadata.ts');
      writeFileSync(metadataPath, 'export const SCHEMA_DIGEST = "sha256:latest";\n');
      const expected = readGeneratedSchemaDigest(metadataPath);
      assert.equal(expected, 'sha256:latest');
      assert.equal(schemaDigestMismatch('sha256:latest', expected), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a Runtime health response from a different contract', () => {
    assert.match(
      schemaDigestMismatch('sha256:stale', 'sha256:latest'),
      /does not match Reigh generated contract sha256:latest/,
    );
  });
});
