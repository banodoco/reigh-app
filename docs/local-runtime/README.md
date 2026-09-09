# Local Workspace Runtime Plan Set

This folder is the canonical execution plan for replacing Astrid and REIGH's legacy local authorities with one neutral SQLite/CAS workspace runtime.

> **Concurrency-first subagent execution:** stage and tranche numbers describe dependency and acceptance order, not an instruction to execute every task serially. As soon as a contract or fixture is stable enough to consume, independent work should fan out into separate subagent threads and worktrees. Serial execution is the exception and must name a concrete dependency, shared-state hazard, or integration gate. Parallel subagents use isolated realms, SQLite/CAS roots, ports, credentials, processes, fixtures, and evidence directories.

Every stage therefore identifies independently executable workstreams, their frozen inputs, file/component ownership, isolated test environment, merge point, and acceptance gate. The target is maximum useful concurrency, with protected integration/review capacity whenever more than one thread is active; parallel implementation must never become parallel ownership of the schema, generated clients, live realm, migration activation, or final release evidence.

The execution workforce is **entirely subagents**. One root/coordinator agent owns the machine-readable work graph, contract epochs, dispatch, merge train, and exact release candidate; worker, reviewer, integration, and evidence subagents claim bounded roles beneath it. The plan is elastically executable from one active worker subagent to 100+ worker subagents. Active subagent count changes how many ready packets are claimed, not the architecture, gates, or definition of done. With one subagent, the graph is traversed in order and roles are different hats. At high concurrency, packets are grouped into independently integrating subagent cells, while single-writer surfaces and scarce resources remain serialized. More subagents are useful only while ready isolated packets and review/integration capacity exist.

The current-machine beta is developed and run from editable source checkouts. Astrid's packs and skills remain first-class, user-editable source systems; packaging, installers, and a dynamic pack marketplace are not prerequisites for the beta. Source code may be editable, but workspace authority remains strictly inside the neutral runtime's SQLite/CAS boundary.

Stage 1 deliberately implements the smallest durable boundary: one current-Mac realm, one generic Astrid pack-executor host, typed worker settlement effects, minimal lease-bound resource reservations, and append-only CAS. REIGH-specific domain expansion moves to Stage 2; verified garbage collection, broader platform/lifecycle matrices, and advanced resource scheduling move to Stage 3 or later.

## Current planning state (2026-09-09)

The plan set is a roadmap, not an implementation claim. Phase-C Reigh/Astrid bridge work and selected producer cutovers already exist in the source tree, but the Stage 1 and Stage 2 acceptance gates are not thereby complete. The remaining work is tracked as an audit-backed next-stage sequence in [2026-09-09 next-stage execution](./05-next-stage-execution-20260909.md).

The accepted GPU direction is bounded and unchanged in authority: the Banodoco runtime owns tasks, leases, events, outputs, and settlement; Astrid's `GenericPackHost` is the sole claimant/settler; and the Reigh Worker codebase supplies GPU process/environment/telemetry substrate only. Wan2GP and VibeComfy remain engine libraries behind Astrid's typed pack adapters. This is a local producer proof, not a hosted GPU fleet or RunPod product.

Read in this order:

1. [Long-term product and architecture vision](./vision.md)
2. [Overall strategy and roadmap](./00-overall-strategy.md)
3. [Stage 1 — Astrid beta](./01-astrid-beta.md)
4. [Stage 2 — REIGH next](./02-reigh-plan.md)
5. [Stage 3 — hardening](./03-hardening.md)
6. [Next-stage execution supplement (2026-09-09)](./05-next-stage-execution-20260909.md)

External review records live under [`reviews/`](./reviews/). They explain why key architectural decisions were made, but the five documents above are the current source of truth. Superseded parallel-plan variants are intentionally not retained in the canonical set.
