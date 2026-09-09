# Next-stage execution supplement — 2026-09-09

**Status:** planning supplement; not an acceptance report

This note turns the current roadmap into the next bounded execution sequence. It does not declare Stage 1 or Stage 2 complete, replace the state audit, or reopen the neutral-runtime/GPU authority decisions.

## Planning facts and non-claims

- The accepted GPU authority snapshot is `UNIFIED-PLAN-v3`: **22 accepted, 1 reopened, 22 open**. Those counts are the starting audit ledger, not proof that the integrated composition is accepted. The v3-selected `70872` decision remains selected; any pending receipt/hash correction is an evidence correction, not an architecture reopening.
- Four Fire19 GPU passes are observed non-production evidence. They are useful producer signals, but there is not yet an accepted final composition proof.
- The accepted shape remains one Banodoco runtime authority and one Astrid `GenericPackHost` claimant/settler. Wan2GP and VibeComfy remain engine libraries behind typed Astrid pack adapters; Reigh Worker is GPU process/environment/telemetry substrate only. There is no Worker queue, plugin registry, router, database writer, or second settlement path.
- The ratified v3 plan still requires its bounded live RunPod profile/tests where specified. What remains deferred is a fuller hosted/cloud GPU product, fleet scheduling, or cloud control plane beyond those required proofs.
- Existing Reigh UI and Astrid bridge/client work is partial implementation evidence. It must be reconciled with merged/unmerged receipts before any gate is marked complete.

## First useful shared journey

The first end-to-end slice to make real and restartable is:

```text
Reigh project
  → Astrid task admission
  → GenericPackHost producer execution
  → Reigh gallery/task output observation
  → timeline placement/edit
  → render/export
  → independent runtime/Reigh restart and reload
```

The journey must preserve one project/task/output identity across the clients, use managed media/CAS rather than persistent local paths, and derive terminal state from the runtime. The minimum renderable shot/reference shape remains the shared beta fixture. Backup/restore, migration, and legacy-authority deletion remain blocking safety gates rather than polish.

## Bounded work packets

### N0 — Reconcile the state audit

Consume the 2026-09-09 audit's merged and unmerged branch/run receipts. For every claim, record commit, owner, source/runtime pair, evidence location, and whether it is accepted, observed-only, blocked, reopened, or open. Preserve settled v3 decisions as settled; correct evidence or receipt interpretation without reopening architecture. Reforecast remaining work only after this ledger is complete.

### N1 — Close the shared UI/runtime spine

Implement and evidence the first useful journey above using the generated client/proxy boundary. The existing Phase-C route work can be reused where it is contract-compatible, but missing project/media/timeline/task/render operations must be added to the neutral contract first and regenerated. Unsupported actions remain typed unavailable; they do not fall back to Supabase or fabricated local state.

### N2 — Prove the sole host with bounded producers

Consume the ratified v3 producer order and completion receipts (including P4 checkout, P5 Wan, P6 embedded, and required live RunPod profile work). Rerun only invalidated integration on one exact candidate; do not invent a new Wan-first ordering. The sole `GenericPackHost` proof covers readiness, capability/source digest pinning, materialization, progress, cancellation, restart/lease recovery, staged output, and runtime settlement. Keep Fire19's four observed passes labelled non-production until the complete host/runtime/Reigh composition is rerun on one exact candidate.

### N3 — Reigh → local Astrid Sessions handoff

Reigh should be able to trigger or resume an Astrid Session on the user's machine; this is not a custom hosted or embedded chat server. The work is deliberately split so discovery cannot be mistaken for delivery:

#### N3a — Discover the real local host contract

Before implementation, discover the actual supported launcher/host-agent mechanism and record its contract rather than inventing one:

1. Locate the supported launcher and capability/version probe on the machine.
2. Define create/resume/close, readiness, timeout, unavailable-agent, and reconnect behavior from that real mechanism.
3. Pass only realm/project-scoped context, selected artifact/task IDs, and explicit actor permissions. Never put credentials or secrets in URL query parameters.
4. Correlate session messages/metadata with neutral-runtime task IDs and output IDs; session metadata is non-authoritative.
5. Require all durable changes, task admission, output publication, and retries to cross the neutral runtime.
6. Add a browser callback/reconnect path that survives a Reigh reload and reports actionable launcher errors.

N3a may prepare fixtures and UX decomposition before the basic beta gate, but it cannot claim an Astrid Session integration until the host-agent contract is verified. It does not install software or launch an agent as part of the documentation task.

#### N3b — Implement the bounded handoff

After N3a identifies the supported mechanism, implement only that host-specific launcher/resume adapter and the Reigh UX callback. Pass realm/project-scoped context, selected artifact/task identifiers, and explicit actor permissions through the host contract; keep secrets out of URLs; persist no session state as workspace authority. Reigh records a correlation reference to neutral-runtime tasks/outputs and can reconnect after a browser reload or temporary host disconnect. If no supported launcher is available, surface an actionable unavailable-agent state and do not fabricate a fallback session.

#### N3c — Accept the session journey

Acceptance requires a real on-machine create/resume/close round trip, readiness and failure diagnostics, callback/reconnect after Reigh reload, explicit permission enforcement, and proof that durable task admission, output publication, and workspace mutation still occur only through the neutral runtime. The session may explain or supervise work, but it cannot create a second queue, task record, output store, or authority. N3 is not complete on discovery receipts alone.

### N4 — Safety gates and deletion

Retain the Stage 1 migration backup/activation/rollback gates and Stage 2 backup/restore proof. Before calling the basic journey complete, rerun static/network authority scans, verify no old local queue/storage/bridge authority remains in the supported graph, and restore the post-journey backup into a new realm. Any data-loss or security-critical finding stops the affected lane.

## Gate ordering

N0 is the immediate dependency for status claims and reforecasting. N1 and N2 may proceed in parallel against frozen contract/fixture snapshots; N3 may proceed as discovery and UX decomposition without introducing a new protocol; N4 converges only on one exact candidate composition. The acceptance order is:

```text
audit ledger → contract/fixture freeze → shared journey → host/producer proof
       ↘ Sessions launcher discovery ↗              ↓
          backup/restore + deletion + restart acceptance
```

No item above changes the Stage 1 migration authority, introduces a second executor, or turns observed GPU runs into a production claim.

## Evidence required for the next reforecast

The next estimate should be based on the audit ledger, not the historical Stage 2 estimate. It should report, separately:

- basic shared UI beta remaining (project/media/timeline/task/render/play/export/restart);
- fuller creative domains (gallery variants, shots/composition, audio, extensions, migration);
- bounded GPU producer work still open by accepted receipt;
- Astrid Sessions launcher discovery/integration status; and
- Stage 1 migration/backup/deletion and Stage 3 hardening gates.

Historical estimates in `02-reigh-plan.md` remain useful complexity context only until this breakdown is reconciled against the accepted receipts.
