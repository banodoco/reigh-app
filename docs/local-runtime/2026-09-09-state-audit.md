# Reigh state audit — 2026-09-09

Read-only audit of the Reigh application, preserved Otto runs, cross-repository
refs, and the binding `UNIFIED-PLAN-v3` snapshot. This is a state inventory, not
a claim that isolated work is promoted.

## Executive state

- Reigh `main` is `3e5115e79` (also `origin/main`). The Stage 2 branch
  `otto/reigh-stage2-app-20260901` is `62518e9dd`, an ancestor of `main`; it
  has no implementation commits beyond `main`. Its run was explicitly paused
  before pre-execution review/source execution, with no Stage 2 source edits.
  See `reigh-app/.otto/runs/reigh-stage2-full-20260901/status.md` and
  `reigh-app/.otto/runs/reigh-stage2-full-20260901/plan.md`.
- `UNIFIED-PLAN-v3.md` is the binding later adjudication: **22 accepted
  historical closures, 1 reopened (`R1-B03-T01` HC-04), and 22 open rows**.
  The five B03-T05a–e receipts are blocked, not completed. Therefore the
  23/45 number in the older single-path handoff must not be used as current
  acceptance. See `c12-safety-snapshot-20260908/UNIFIED-PLAN-v3.md` lines 9–15.
- The currently usable Reigh code is the HC-04 implementation at
  `9dc9d6447`, followed by test/bridge checkpoint `cf9d772be`, both reachable
  from `main`. The formal plan still requires the corrected HC-04 handoff and
  receipt before downstream producer migrations; code presence is not formal
  acceptance.

## What is implemented and reusable

- Reigh HC-04 admission and Runtime transport foundations are in `main` via
  `9dc9d6447` and `cf9d772be` (task typing, ordered CAS IDs, idempotency,
  response/transport tests, and Astrid transport/bridge changes). Reuse these
  files as the starting surface, but preserve the reopened-T01 gate and do not
  call the branch accepted until the correction receipt is valid.
- Accepted isolated Astrid implementation refs remain available:
  `ffef517a5` (B03/B04 composition), `bcc2ad5d9` (capability manifest),
  `45bd5f61d` (direct image packs), `0cb2d2850` (direct media packs),
  `7f8582454` (VACE), `4a35c5328` (LTX), and `f614d6d7f` (orchestration).
  Their receipts/evidence are in
  `reigh-app/.otto/runs/astrid-gpu-single-path-20260905/`; they are not on
  Astrid `main` (`8150c3b7`). Astrid `main` is also dirty, so it is not a
  clean promotion candidate.
- Accepted Worker composition `d8fb28875` and accepted CPU lifecycle evidence
  are preserved in the same run root, but Worker `main` remains `68b70149`.
  Do not infer Worker promotion from the composition ref.
- Runtime historical Stage 1/main is `8ca859088`; v3 selects `70872d03e`
  for the composition. The older handoff's rejected correction receipt still
  needs corrected evidence; this does not reopen the settled SHA-256 object-ID
  decision or replace v3's selected dependency.

## What remains blocked or unproven

- The Stage 2 run is a plan/custody artifact, not executed Stage 2 product
  work. Its status says the next action was pre-execution contract review and
  the current blocker was external target capacity.
- In the single-path run, B03-T05a–e (five Reigh producer cutovers), B03-T08
  paired direct-family deletion, B04-T04/T05/T06/T07 shared travel and
  dimensional deletion, B05 residual closure/CR2, and all B06 final
  composition/CPU/GPU/promotion rows remain open under v3.
- No accepted final four-repository composition exists. Fire19 has four
  observed non-production passes, but no accepted final live GPU proof,
  selected-user-realm migration proof, final forbidden-reachability closure,
  merge, deployment, or push of the isolated GPU composition was found.
- The meta GPU run `astrid-gpu-meta-20260901` remains at frozen local M0
  handoff preparation; cloud registration, provider/model custody, child
  receipts, and M0 execution evidence are absent. Its status and evidence are
  under `reigh-app/.otto/runs/astrid-gpu-meta-20260901/`.

## Plan update implications

Subsequent Reigh plans should start from the reachable HC-04 code and the
accepted isolated Astrid/Worker artifacts, while making the reopened HC-04
correction a hard dependency. The next executable Reigh work is the five
disjoint B03 producer migrations, then the serialized shared travel/join/edit
cutover and paired deletion proofs. Keep all composition, GPU, migration, and
promotion claims explicitly pending until B05/CR2 and the B06 immutable
composition gates pass.

## Evidence paths inspected

These are local-only provenance references, not portable links or additional
execution authorities. The public commit identities above identify source;
the private handover carries selected evidence. v3 remains the GPU authority.

- `reigh-app/.otto/runs/reigh-stage2-full-20260901/status.md`
- `reigh-app/.otto/runs/reigh-stage2-full-20260901/plan.md`
- `reigh-app/.otto/runs/astrid-gpu-single-path-20260905/status.md`
- `reigh-app/.otto/runs/astrid-gpu-single-path-20260905/tasklist.md`
- `reigh-app/.otto/runs/astrid-gpu-single-path-20260905/acceptance-ledger.md`
- `c12-safety-snapshot-20260908/UNIFIED-PLAN-v3.md`
