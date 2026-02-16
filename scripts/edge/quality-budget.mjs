import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);
const repoRoot = path.resolve(thisDir, "../..");
const edgeRoot = path.join(repoRoot, "supabase/functions");
const baselinePath = path.join(edgeRoot, "_quality-budget.json");

function collectTsFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "_tests") continue;
      out.push(...collectTsFiles(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith(".ts")) {
      out.push(fullPath);
    }
  }

  return out;
}

function countMatches(text, regex) {
  return (text.match(regex) ?? []).length;
}

function collectMetrics() {
  const files = collectTsFiles(edgeRoot);
  const metrics = {
    tsFiles: files.length,
    explicitAny: 0,
    denoLintIgnoreFile: 0,
    fileLevelEslintDisable: 0,
    tsIgnoreDirectives: 0,
    noExplicitAnySuppressions: 0,
  };

  for (const filePath of files) {
    const text = fs.readFileSync(filePath, "utf8");

    metrics.explicitAny += countMatches(text, /:\s*any\b/g);
    metrics.explicitAny += countMatches(text, /\bas\s+any\b/g);
    metrics.explicitAny += countMatches(text, /<any>/g);
    metrics.explicitAny += countMatches(text, /\bany\[\]/g);

    metrics.denoLintIgnoreFile += countMatches(text, /deno-lint-ignore-file/g);
    metrics.fileLevelEslintDisable += countMatches(text, /^\s*\/\*\s*eslint-disable\s*\*\//gm);
    metrics.tsIgnoreDirectives += countMatches(text, /@ts-ignore|@ts-expect-error/g);
    metrics.noExplicitAnySuppressions += countMatches(
      text,
      /eslint-disable-next-line\s+@typescript-eslint\/no-explicit-any/g,
    );
  }

  return metrics;
}

function writeBaseline(metrics) {
  const payload = {
    generatedAt: new Date().toISOString(),
    limits: {
      explicitAny: metrics.explicitAny,
      denoLintIgnoreFile: metrics.denoLintIgnoreFile,
      fileLevelEslintDisable: metrics.fileLevelEslintDisable,
      tsIgnoreDirectives: metrics.tsIgnoreDirectives,
      noExplicitAnySuppressions: metrics.noExplicitAnySuppressions,
    },
  };

  fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote baseline to ${baselinePath}`);
}

function checkBaseline(metrics) {
  if (!fs.existsSync(baselinePath)) {
    console.error(`Missing baseline file: ${baselinePath}`);
    process.exit(1);
  }

  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const limits = baseline.limits ?? {};

  const keys = [
    "explicitAny",
    "denoLintIgnoreFile",
    "fileLevelEslintDisable",
    "tsIgnoreDirectives",
    "noExplicitAnySuppressions",
  ];

  let hasFailure = false;
  for (const key of keys) {
    const current = metrics[key];
    const limit = limits[key];
    if (typeof limit !== "number") {
      console.error(`Missing numeric limit for ${key} in ${baselinePath}`);
      hasFailure = true;
      continue;
    }

    if (current > limit) {
      hasFailure = true;
      console.error(`Budget exceeded for ${key}: current=${current}, limit=${limit}`);
    }
  }

  if (hasFailure) {
    process.exit(1);
  }
}

const mode = process.argv.includes("--write") ? "write" : "check";
const metrics = collectMetrics();

console.log("Edge quality metrics");
console.log(JSON.stringify(metrics, null, 2));

if (mode === "write") {
  writeBaseline(metrics);
} else {
  checkBaseline(metrics);
}
