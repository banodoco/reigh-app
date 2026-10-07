#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { VerificationError, verifyFixture } from "./verify.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const fixtureRoot = path.resolve(repoRoot, "../../runs/astrid-2026-09-25/evidence/C01/light-study-v1");
const schemaPath = path.join(repoRoot, "vendor/timeline-schema/python/banodoco_timeline_schema/timeline.schema.json");

function withFixture(mutate, run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "astrid-offline-verifier-"));
  const fixture = path.join(tempRoot, "fixture");
  fs.cpSync(fixtureRoot, fixture, { recursive: true });
  try {
    mutate(fixture);
    run(fixture);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function readJson(root, name) {
  return JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
}

function writeJson(root, name, value) {
  fs.writeFileSync(path.join(root, name), `${JSON.stringify(value, null, 2)}\n`);
}

function rejects(code, fieldPattern, mutate) {
  withFixture(mutate, (fixture) => {
    assert.throws(
      () => verifyFixture({ fixtureRoot: fixture, schemaPath }),
      (error) => {
        assert.ok(error instanceof VerificationError);
        assert.equal(error.code, code);
        assert.match(error.field, fieldPattern);
        return true;
      },
    );
  });
}

function rejectsExact(code, expectedField, mutate) {
  withFixture(mutate, (fixture) => {
    assert.throws(
      () => verifyFixture({ fixtureRoot: fixture, schemaPath }),
      (error) => {
        assert.ok(error instanceof VerificationError);
        assert.equal(error.code, code);
        assert.equal(error.field, expectedField);
        return true;
      },
    );
  });
}

test("canonical light-study-v1 passes with truthful boundary states", () => {
  const report = verifyFixture({ fixtureRoot, schemaPath });
  assert.deepEqual(report.states, {
    offline_integrity: "pass",
    provider_binding: "unbound",
    exported_package_closure: "not-run",
    result: "not-produced",
  });
  assert.equal(report.totals.files, 7);
  assert.equal(report.totals.videos, 3);
  assert.equal(report.totals.thumbnails, 3);
  assert.equal(report.totals.project_posters, 1);
  assert.equal(report.totals.duration_seconds, 28);
});

test("rejects a missing file with its manifest field", () => {
  rejects("missing-file", /manifest\.assets\.first-light\.video/, (fixture) => {
    fs.unlinkSync(path.join(fixture, "media/first-light.mp4"));
  });
});

test("rejects a content hash mismatch", () => {
  rejects("hash-mismatch", /manifest\.assets\.first-light\.video/, (fixture) => {
    fs.appendFileSync(path.join(fixture, "media/first-light.mp4"), "changed");
  });
});

test("rejects path traversal before reading outside the fixture", () => {
  rejects("path-traversal", /manifest\.assets\.first-light\.video/, (fixture) => {
    const manifest = readJson(fixture, "asset-manifest.json");
    manifest.assets[0].video = "../first-light.mp4";
    writeJson(fixture, "asset-manifest.json", manifest);
    const contract = readJson(fixture, "project-contract.json");
    contract.assets["first-light"].path = "../first-light.mp4";
    writeJson(fixture, "project-contract.json", contract);
    const registry = readJson(fixture, "registry-candidate.json");
    registry.assets["first-light"].file = "../first-light.mp4";
    writeJson(fixture, "registry-candidate.json", registry);
  });
});

test("rejects external registry URLs", () => {
  rejects("external-resource-metadata", /registry\.assets\.first-light\.url/, (fixture) => {
    const registry = readJson(fixture, "registry-candidate.json");
    registry.assets["first-light"].url = "https://signed.invalid/video.mp4?token=private";
    writeJson(fixture, "registry-candidate.json", registry);
  });
});

test("rejects duplicate manifest identities", () => {
  rejects("duplicate-identity", /manifest\.assets\.key/, (fixture) => {
    const manifest = readJson(fixture, "asset-manifest.json");
    manifest.assets.push({ ...manifest.assets[0] });
    writeJson(fixture, "asset-manifest.json", manifest);
  });
});

test("rejects unresolved clip asset identities", () => {
  rejects("unresolved-identity", /timeline\.clips\[0\]\.asset/, (fixture) => {
    const timeline = readJson(fixture, "timeline-candidate.json");
    timeline.clips[0].asset = "missing-asset";
    writeJson(fixture, "timeline-candidate.json", timeline);
    const contract = readJson(fixture, "project-contract.json");
    contract.clips["light-study-01"].asset_id = "missing-asset";
    writeJson(fixture, "project-contract.json", contract);
  });
});

test("rejects unknown resource-bearing dependency metadata", () => {
  rejects("unsupported-resource-kind", /^\/clips\/0\/params\/bundle_file$/, (fixture) => {
    const timeline = readJson(fixture, "timeline-candidate.json");
    timeline.clips[0].params = { bundle_file: "media/undeclared.bundle" };
    writeJson(fixture, "timeline-candidate.json", timeline);
  });
});

test("rejects the reproduced camelCase sourceUrl fail-open at its original pointer", () => {
  rejectsExact("unsupported-resource-kind", "/clips/0/params/sourceUrl", (fixture) => {
    const timeline = readJson(fixture, "timeline-candidate.json");
    timeline.clips[0].params = { sourceUrl: "https://remote.invalid/private.mp4" };
    writeJson(fixture, "timeline-candidate.json", timeline);
  });
});

const resourceKeyVariants = [
  "sourceUrl",
  "sourceURL",
  "assetPath",
  "resourceUrl",
  "videoURI",
  "SourceURL",
  "URLSource",
  "source_url",
  "source-url",
  "source.url",
];

for (const [index, key] of resourceKeyVariants.entries()) {
  test(`rejects nested timeline metadata key ${key} at its original pointer`, () => {
    const value = index % 2 === 0 ? "https://remote.invalid/private.mp4" : "media/undeclared.mp4";
    rejectsExact("unsupported-resource-kind", `/clips/0/params/wrapper/0/${key}`, (fixture) => {
      const timeline = readJson(fixture, "timeline-candidate.json");
      timeline.clips[0].params = { wrapper: [{ [key]: value }] };
      writeJson(fixture, "timeline-candidate.json", timeline);
    });
  });

  test(`rejects nested manifest metadata key ${key} at its original pointer`, () => {
    const value = index % 2 === 0 ? "media/undeclared.mp4" : "https://remote.invalid/private.mp4";
    rejectsExact("unsupported-resource-kind", `/assets/0/metadata/wrapper/0/${key}`, (fixture) => {
      const manifest = readJson(fixture, "asset-manifest.json");
      manifest.assets[0].metadata = { wrapper: [{ [key]: value }] };
      writeJson(fixture, "asset-manifest.json", manifest);
    });
  });
}

test("allows ordinary nested metadata in both open walkers", () => {
  withFixture((fixture) => {
    const timeline = readJson(fixture, "timeline-candidate.json");
    timeline.clips[0].params = { easingCurve: "linear", notes: [{ labelText: "quiet" }] };
    writeJson(fixture, "timeline-candidate.json", timeline);
    const manifest = readJson(fixture, "asset-manifest.json");
    manifest.assets[0].metadata = { displayLabel: "First light", notes: [{ roleName: "opening" }] };
    writeJson(fixture, "asset-manifest.json", manifest);
  }, (fixture) => {
    const report = verifyFixture({ fixtureRoot: fixture, schemaPath });
    assert.equal(report.states.offline_integrity, "pass");
  });
});

test("rejects ignored resource-like manifest extras", () => {
  rejects("unsupported-resource-kind", /^\/assets\/0\/bundle_path$/, (fixture) => {
    const manifest = readJson(fixture, "asset-manifest.json");
    manifest.assets[0].bundle_path = "media/undeclared.bundle";
    writeJson(fixture, "asset-manifest.json", manifest);
  });
});

test("rejects unresolved scripted-example clip identities", () => {
  rejects("unresolved-identity", /scriptedExample\.steps\[1\]\.clip_ids\[0\]/, (fixture) => {
    const scripted = readJson(fixture, "scripted-example.json");
    scripted.steps[1].clip_ids[0] = "missing-scripted-clip";
    writeJson(fixture, "scripted-example.json", scripted);
  });
});

test("same fixture and environment produce byte-identical JSON", () => {
  const first = `${JSON.stringify(verifyFixture({ fixtureRoot, schemaPath }), null, 2)}\n`;
  const second = `${JSON.stringify(verifyFixture({ fixtureRoot, schemaPath }), null, 2)}\n`;
  assert.equal(second, first);
});
