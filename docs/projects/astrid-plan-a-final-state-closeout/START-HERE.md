# Astrid Plan A final-state handover

This package is the portable handover for the remaining Plan A closeout work.
It is a delivery handover: the receiving agent should pull the four public
repositories at the pinned refs below, implement and validate the plan, then
push the resulting implementation branches to their configured GitHub remotes.

This package does not claim that the closeout work is complete. It packages the
current baseline, the agreed target, the cross-repository test strategy, and the
finish/push contract. It does not contain credentials, caches, raw agent logs,
or machine-local `.otto` state.

Read in this order:

1. [source-state.md](source-state.md) — public clone URLs, exact refs, custody,
   dirty-state boundaries, and push destinations.
2. [northstar.md](northstar.md) — durable end state and non-goals.
3. [agent_goal.md](agent_goal.md) — authority, scope, delivery mode, and finish
   conditions.
4. [plan.md](plan.md) — implementation and qualification plan.
5. [tasklist.md](tasklist.md) — dependency-ordered normal/XHARD tasks.
6. [assets/handover-message.md](assets/handover-message.md) — copy/paste
   instructions for the receiving manager.

The historical source run is:

`astrid-dirty-main-integration-publish-20260924`

It lives in ignored local `.otto` storage in the source checkout. Its accepted
Plan A work and review counters are historical inputs, not a substitute for the
fresh final-state qualification described here. The handover is intentionally
self-contained so the recipient does not need that absolute local path.

## Finish contract

At the end, the receiving agent must:

- run the affected source, cross-repository, and installed no-GPU suites;
- write the listed evidence receipts;
- commit only reviewed source/docs/tests and sanitized evidence;
- push each implementation branch to the public `origin` shown in
  [source-state.md](source-state.md) with no force push;
- verify each remote ref resolves to the pushed commit;
- report the pushed SHAs, test/evidence results, omitted local artifacts, and
  any unresolved risk.

Do not push credentials, `.otto` control state, build outputs, RunPod metadata,
generated media, or unrelated local artifacts. Merging into `main` or cutting
over production is not implied by this handover; use a PR or explicit merge
authorization after the pushed branches are reviewed.
