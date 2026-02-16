# Edge Functions Remediation Plan

Date: 2026-02-16
Scope: `/Users/peteromalley/Documents/reigh/supabase/functions`

## Baseline

- Entry points: 32
- Edge tests: 0
- ESLint issues in edge functions: 212 (205 errors, 7 warnings)
- Explicit `any` count in edge functions: 190 across 39 files
- Largest hotspot: `complete_task/` (3,150 LOC, 109 lint issues, 82 explicit `any`)

## Outcomes We Want

1. Add automated coverage for all 32 edge entry points.
2. Add deep integration tests for task lifecycle and billing-critical flows.
3. Reduce edge `any` debt and suppression usage in a controlled, measurable way.
4. Add CI gates so regressions are blocked automatically.

## Workstream A: Testing Harness (Day 1)

1. Add an edge test suite directory:
   - `/Users/peteromalley/Documents/reigh/supabase/functions/_tests/`
2. Add shared test utilities:
   - function URL builder
   - auth header helper (service role, PAT, missing auth)
   - request helper for JSON + CORS preflight
3. Add npm scripts:
   - `lint:edge`: `eslint supabase/functions --ext ts`
   - `test:edge`: run edge function tests
   - `test:edge:smoke`: only smoke tests
4. Decide one runtime path and lock it:
   - preferred: local Supabase stack + `supabase functions serve`

Acceptance criteria:
- A single command can run edge smoke tests locally.
- A single command can lint edge functions locally.

## Workstream B: Coverage Floor for All Functions (Days 2-3)

Goal: every entry point has at least one contract/smoke test.

Test pattern per function:
1. CORS preflight behavior (`OPTIONS`) where applicable.
2. Method guard (`GET`/invalid method returns expected status).
3. Missing or invalid auth returns expected status.

Priority order:
1. `complete_task`
2. `update-task-status`
3. `calculate-task-cost`
4. `claim-next-task`
5. `create-task`
6. `task-counts`
7. remaining functions

Acceptance criteria:
- 32/32 edge entry points covered by at least one automated test.
- Smoke suite is green in local CI-like run.

## Workstream C: Critical Integration Tests (Days 4-6)

Add end-to-end function-level tests for these flows:

1. Task lifecycle:
   - `create-task -> claim-next-task -> update-task-status -> complete_task`
2. Billing path:
   - `complete_task` and `update-task-status` trigger/handle billing correctly
3. Cancellation cascade:
   - orchestrator and child tasks update to correct terminal states
4. Cost calculation path:
   - `calculate-task-cost` handles orchestrator/subtask scenarios
5. Payment/topup path:
   - `setup-auto-topup`, `trigger-auto-topup`, `process-auto-topup`
6. Auth/token path:
   - `generate-pat`, `revoke-pat`, protected endpoint access checks

Acceptance criteria:
- Critical flows have deterministic pass/fail integration tests.
- Failures return actionable assertions (status + payload contract).

## Workstream D: Type Debt and Suppression Cleanup (Days 7-10)

Phase the cleanup by risk:

1. Tier 1 (highest risk):
   - `/complete_task/*`
   - `/update-task-status/index.ts`
   - `/calculate-task-cost/index.ts`
   - `/_shared/auth.ts`
2. Tier 2:
   - `create-task`, `claim-next-task`, `task-counts`, `update-shot-pair-prompts`
3. Tier 3:
   - remaining edge functions and shared helpers

Rules:
1. No file-level `eslint-disable` in touched files.
2. Remove `deno-lint-ignore-file` in touched files when feasible.
3. Replace `any` with explicit request/response/db row types.
4. Keep suppressions only with a one-line reason and issue link.

Acceptance criteria:
- `@typescript-eslint/no-explicit-any` count reduced from 190 to <= 120 in first milestone.
- No net-new blanket suppressions in edge code.

## Workstream E: CI and Regression Gates (Days 11-12)

1. Add GitHub workflow:
   - `.github/workflows/edge-functions.yml`
2. CI job steps:
   - install deps
   - start local Supabase services
   - run `npm run lint:edge`
   - run `npm run test:edge:smoke`
   - run critical integration subset on main or nightly
3. Add a debt budget check:
   - fail on increased edge `any` count
   - fail on increased edge suppression count

Acceptance criteria:
- PRs cannot merge if edge lint/smoke gates fail.
- Debt budgets only move downward.

## Workstream F: Issue Tracking Structure (Do Now)

Create these issues (no existing open issues currently cover them):

1. Edge smoke coverage floor for all 32 functions.
2. Edge critical integration tests for task and billing lifecycle.
3. Tier-1 type debt reduction (`complete_task`, `update-task-status`, `calculate-task-cost`, `_shared/auth`).
4. Remove blanket suppressions from edge functions.
5. Add CI workflow and debt budget enforcement for edge functions.

For each issue include:
1. current baseline metric
2. clear acceptance criteria
3. out-of-scope list
4. rollback plan for risky function changes

## Definition of Done

1. 32/32 entry points have automated tests.
2. Critical lifecycle flows are integration-tested.
3. Edge lint issues reduced materially, with trend tracked.
4. Edge explicit `any` debt reduced to agreed budget.
5. CI blocks regressions automatically.

## Immediate Next Actions (Today)

1. Open the 5 issues above.
2. Implement Workstream A harness.
3. Land smoke tests for top 6 priority functions.
4. Run baseline report and attach it to issue #1.
