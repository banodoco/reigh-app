# Desloppify Issue Drafts (Deduped) — 2026-02-16

Repository checked: `https://github.com/peteromallet/desloppify`  
Method: `gh issue list/view` against open+closed issues.

## Quick conclusion

Most scanner-behavior findings should be filed in `desloppify`, not `Reigh`.

`Reigh` currently has no GitHub issues, while `desloppify` has active issues that already cover part of this:

- `#82` TypeScript edge functions coverage gap
- `#100` runtime entrypoint test_coverage false positives
- `#106` status transparency for suppressed/excluded findings
- `#99` score churn after tool-code drift

## Existing issues to update (no new issue needed)

### 1) Update `#82` with new evidence

Issue: `https://github.com/peteromallet/desloppify/issues/82`

Paste as comment:

```md
Fresh data point from `reigh` (2026-02-16):

Even with full scan scope (`desloppify scan --path .`), edge-function type-safety debt is under-represented in persisted findings.

Repro:

```bash
desloppify detect smells --path supabase/functions/update-task-status --json
# reports any_type entries (12 explicit any usages)

node -e "
const fs=require('fs');
const s=JSON.parse(fs.readFileSync('.desloppify/state-typescript.json','utf8'));
const hits=Object.values(s.findings||{}).filter(f=>String(f.file||'').includes('supabase/functions/update-task-status/index.ts') && f.detector==='smells');
console.log(hits);
"
# no smells::...::any_type entry for this file
```

Aggregate check from same run:
- Supabase files with explicit `any` (`rg`): **38**
- Supabase files with persisted `smells::...::any_type`: **12**
- Missing from persisted state: **26**

This suggests either detector-to-state materialization loss or scan-phase filtering mismatch for `any_type`.
```

### 2) Update `#106` with score-interpretation data

Issue: `https://github.com/peteromallet/desloppify/issues/106`

Paste as comment:

```md
Additional real-project evidence (`reigh`, 2026-02-16):

`desloppify scan --path .` reports:
- raw findings this run: **1314**
- open: **0**
- strict score: **97.0**

State totals:
- fixed: **4290**
- false_positive: **1477**
- auto_resolved: **308**

This reinforces the need for first-class visibility of "triaged but still detected" debt in `status`, not only open findings.
```

### 3) Update `#100` with concrete duplicate entrypoint examples

Issue: `https://github.com/peteromallet/desloppify/issues/100`

Paste as comment:

```md
Confirmed on `reigh` full scan:

`supabase/functions/update-task-status/index.ts` has two coverage findings:
- `test_coverage::supabase/functions/update-task-status/index.ts`
- `test_coverage::supabase/functions/update-task-status/index.ts::untested_module`

Both are false-positive-triaged runtime entrypoint cases (externally invoked by Supabase).

This is a practical signal that entrypoint classification/dedup logic still needs tightening.
```

## New issues to open (not found as existing)

### A) Missing React hook-correctness detection parity with ESLint

Title:
`TypeScript React: add detector support for rules-of-hooks and exhaustive-deps parity`

Body:

```md
## Problem
Desloppify does not currently surface React hook correctness violations comparable to ESLint's `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps`.

## Repro
In `reigh`:

```bash
npm run lint
# includes many react-hooks/rules-of-hooks + exhaustive-deps findings

desloppify detect react --path . --json
# returns count=0, entries=[]
```

Concrete example file from same run:
- `src/shared/components/MediaLightbox/VideoLightbox.tsx` reported many conditional-hook-order errors in ESLint.

## Expected
Either:
1. A dedicated detector for hook-order/dependency correctness, or
2. Optional ESLint ingestion mode that maps these to structured findings.

## Why this matters
These are correctness bugs, not just style/architecture preferences, and currently create a false gap between scanner score and real code safety.

## Acceptance criteria
- Running scan on a repo with known `rules-of-hooks` violations emits corresponding findings.
- Findings include file + line + rule class.
- Detector can be enabled/disabled via config for teams that do not use React.
```

### B) Smells detector/state persistence mismatch for `any_type`

Title:
`Bug: smells any_type findings from detect are not consistently persisted by scan`

Body:

```md
## Problem
`desloppify detect smells` reports `any_type` in files that do not receive corresponding persisted `smells::...::any_type` findings after full `scan`.

## Repro
Project: `reigh`

```bash
desloppify scan --path .
desloppify detect smells --path supabase/functions/update-task-status --json
# shows any_type matches

rg -n "smells::supabase/functions/update-task-status/index.ts::any_type" .desloppify/state-typescript.json
# no match
```

Aggregate from same environment:
- explicit-any files in `supabase/functions`: 38
- files with persisted `smells::...::any_type`: 12
- missing: 26

## Expected
If `detect smells` reports `any_type` for file X under the same scan profile/scope, persisted state should contain `smells::<file>::any_type` (unless explicitly ignored/suppressed with traceable reason).

## Acceptance criteria
- Detector output and scan-persisted findings are consistent for identical scope.
- If filtered, state records why (suppressed, excluded, ignored) with machine-readable reason.
```

### C) Scan-scope clarity: make implicit path explicit in output/status

Title:
`UX: make effective scan scope explicit and warn on implicit non-root default`

Body:

```md
## Problem
The effective scan scope can be implicit (e.g. project default source root), which is easy to misread as whole-repo scanning.

## Repro
Running `desloppify scan` may use configured default scope (e.g. `src`) while `desloppify scan --path .` produces a materially different raw finding count.

## Expected
Scanner output and status should prominently show:
- effective `scan_path`
- whether scope is implicit default vs explicit CLI override
- optional warning when scope is not repository root

## Why this matters
Scope ambiguity leads to false confidence ("all clear") when entire subtrees are out-of-scope.

## Acceptance criteria
- `scan` and `status` print effective scope in first summary block.
- non-root implicit scope emits a warning with suggested `--path .`.
- query/state metadata keeps this explicit for historical comparisons.
```

## Optional repo-local issue (not desloppify)

If desired, create a `Reigh` issue for repository hygiene:

- Control-character filename under `src/pages` (newline in path) can poison tooling output.
- This is a project content issue, not a scanner-engine issue.

