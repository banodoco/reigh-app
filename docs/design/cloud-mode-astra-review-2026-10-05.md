# Reigh / Astrid Cloud: Astra architecture sense-check

**Shared metaplan:** [Reigh Cloud — coordinated projects and execution schedule](/Users/peteromalley/Documents/reigh-workspace/reigh-app/docs/design/cloud-mode-megado-projects-2026-10-05.md).

**2026-10-05 — independent design review; proposals, not implementation decisions**

The architecture is coherent under the user's settled constraints. Keep Supabase identity/accounts/billing/control, one Turso workspace database per user, Runtime as task and workspace authority, native OMP sessions through the existing storage interface in both modes, private media, native Cloud profiles, hosted agents, API generation first and separate CPU rendering. The biggest risks are durability at the boundaries and adapting Runtime's local assumptions. They are not a reason to add a general cloud platform.

This review read the [overview](cloud-mode-project-overview-2026-10-05.md), [integration plan](cloud-mode-integration-plan-2026-10-05.md), [readiness register](cloud-mode-specification-readiness-2026-10-05.md) and selected supporting evidence. Targeted local source checks substantiated OMP write semantics, Runtime ownership and task claiming. No deployed configuration, production data, credentials, implementation or paid calls were inspected or changed. Vendor selection and capacity claims remain unverified.

## Highest-priority findings

| Severity | Finding | Smallest corrective action |
|---|---|---|
| Launch blocker | Durable OMP sessions do not alone guarantee reliable turn acceptance, tool execution or recovery. | Add durable turn acceptance and stable tool-intent correlation; wait for remote persistence at consequential boundaries. Mark interrupted turns explicitly. |
| Launch blocker | A one-writer conversation lease is insufficient if an expired writer can still append or submit work. | Fence session mutations and new task submissions by the current conversation writer generation. Keep that authority with Runtime's conversation state. |
| Launch blocker | Runtime claim fencing cannot prevent a duplicate external provider submission after an ambiguous network outcome. | Define provider-specific uncertainty handling and retain the original operation identity. Quarantine unknown submissions for reconciliation/manual resolution; do not automatically resubmit. |
| High | Native login, per-user realm provisioning and schema lifecycle are underspecified. | Specify one native authentication handoff and idempotent realm provisioning, plus a versioned migration path for many user databases. |
| High | Single-owner Runtime is being conflated with potentially elaborate per-user hosting. | Start with one Cloud service deployment and bounded active realms; prove multi-realm hosting or use a small supervised process pool. No permanent service fleet per user. |
| High | Import is one-way in the plan, while “disposable machine” leaves some agent files outside durable storage. | Define supported durable project artifacts and Cloud export. Restrict initial import to inactive work and explicit ID mapping. |

“Launch blocker” means the behavior must be defined and demonstrated before real users depend on it, not that a large subsystem must be built before the first prototype.

## 1. Conversation durability is not reliable turn delivery

Reusing OMP's native storage is the right decision. It avoids a second transcript and preserves branches, compaction and session semantics. But its indexed storage updates a local index synchronously and queues remote publication. `appendSync` returning is not a Cloud durability acknowledgement. The current interface explicitly documents this; `SessionManager.flush()` waits for writer flush and storage drain. A successful graceful shutdown test therefore does not prove hard-kill recovery. See [storage interface](/Users/peteromalley/Documents/oh-my-pi/packages/coding-agent/src/session/session-storage.ts:15), [indexed append](/Users/peteromalley/Documents/oh-my-pi/packages/coding-agent/src/session/indexed-session-storage.ts:519) and [session flush](/Users/peteromalley/Documents/oh-my-pi/packages/coding-agent/src/session/session-manager.ts:1718).

**Proposal:** keep canonical OMP records and add only the execution metadata needed to answer: was this user turn accepted, which writer owns it, and did it finish or become interrupted? Give each submitted turn a stable client operation ID, acknowledge it only after durable acceptance, and reconnect by that ID. This can be a small Runtime record or extension of existing session metadata; it need not be a new queue service or duplicate chat store. Define how that receipt correlates with the OMP user entry so a crash between the two does not duplicate the prompt.

Before a side-effecting tool call, durably establish its stable tool-intent ID; admission retries reuse it across sandbox restarts and grant rotation. Do not rely on a regenerated LLM turn inventing the same ID. Persist the completion reference before presenting a completed turn as durable. After a mid-turn crash, the minimal safe behavior is to display “interrupted,” recover admitted tasks/results, and let the user continue. Automatic replay of the whole agent turn is optional and can repeat edits or paid work.

A second device should reload committed native records plus turn status. Token chunks may stream transiently; losing an unfinished sentence on reconnect is acceptable if the UI clearly rebuilds from canonical state. A durable log of every ACP notification/token is unnecessary for the first release. Use ordered durable session revisions or committed entry cursors; add broader event replay only where a real event cannot be reconstructed.

Put the conversation writer generation beside the canonical session in Runtime. Every append/rewrite and new task submission from that writer must check it. Sandbox placement in Supabase can refer to this generation but should not independently determine who owns the transcript. Lease expiry, credential expiry and stopping a process are different mechanisms. An old native client may remain alive after takeover. Already-admitted tasks continue under their task identity; rejecting an old conversation writer must not accidentally cancel their results.

Native Cloud mode also needs a network-loss policy: fail or pause Cloud mutations visibly, preserve a clearly unsent local draft, and never silently fork into Local mode. Native local shell commands cannot be remotely fenced, so takeover guarantees must be scoped to Cloud workspace mutations and task submission.

## 2. Keep the failure protocol; shrink its implementation surface

The split between Runtime tasks and Supabase execution jobs is justified by the settled design. It inevitably needs reconciliation because no transaction spans Runtime, Supabase and a provider. Two database records are acceptable when they represent different things. Two independently authoritative task lifecycles are not.

**Proposal:** implement the gateway, realm router, dispatch loop, result ingestion and reconciler as modules of one trusted Cloud service initially. Use the Supabase execution-job table as the delivery queue, with an atomic hold-plus-job RPC. Use Runtime outbox rows as durable intents, not as an additional queue product. Run API execution in a separate worker process; add CPU workers later. An Edge Function may remain a thin existing ingress where useful, but an Edge Function → gateway → admission bridge → dispatcher chain need not become four deployments or four authorization protocols.

The claim-order correction is valid. `claim_next` accepts executor, capabilities, epoch and optional target, not a task ID; it selects an eligible queued task. Use the returned task to bind its quote and delivery. See [claim implementation](/Users/peteromalley/Documents/reigh-workspace/banodoco-workspace-runtime/runtime_protocol/service.py:5866). A targeted-claim API is not an MVP prerequisite.

Explicitly close four remaining recovery cases:

1. **Who renews the Runtime lease?** Assign one dispatcher/coordinator owner while execution is queued/running and define how restart resumes reconciliation. Do not let worker and coordinator independently invent attempt transitions.
2. **Provider accepted, acknowledgement lost.** A request ID cannot always be recorded before submission: some providers generate it. Where caller idempotency or lookup is absent, exact automatic recovery is impossible. Hold an explicit unknown state, prevent automatic new submission, and provide an operator resolution path. Fencing only blocks stale publication; it does not undo external spending.
3. **Runtime restarts while a provider runs.** Recover or reconcile the existing provider operation before claiming/retrying into another paid submission. A stale output should be quarantined as recoverable evidence, not immediately deleted. Define a narrow trusted recovery path to reuse verified output for an eligible current attempt, or resolve/refund manually.
4. **Cancellation after provider acceptance.** Separate cancellation of user-visible work from whether provider cost can still accrue. Under the proposed charge-only-on-success policy the platform may absorb cancelled/failed provider spend. Record that explicitly and cap cancellation/unknown exposure; do not quietly change the user's quote policy.

Fixed quotes are simpler than actual-cost billing for v1. Reserve the full quote, settle once on successful canonical delivery, and release according to a documented terminal/unknown policy. Internal retries consume platform margin, with bounded retries. Add operator visibility into aged holds, unknown submissions and undelivered verified outputs. This is more useful than generalized workflow orchestration.

## 3. Identity is correct; provisioning and native sign-in need closure

Supabase user UUID is the right realm key. “Same Discord login” resolves the same realm only while it resolves the same application account in the same Supabase environment. Do not silently merge by email, Discord name or provider ID. Account linking/recovery can stay outside v1, but account deletion and recreation must not accidentally attach to an old realm.

**Proposal:** define an idempotent `ensureCloudRealm` operation with a unique account mapping and provisioning states such as pending, ready and failed. Concurrent first logins from two devices must produce one adopted database. A database created just before a failed mapping write must be discoverable/reconcilable. Do not create a new empty realm on every failed open or unsupported schema version.

For browsers, restore the existing Supabase session behavior. For native Astrid, choose one concrete browser-based sign-in handoff: for example, a PKCE flow with an approved native callback or a short-lived one-use device handoff. The exact supported OAuth configuration needs verification; copying the browser callback path is not an implementation plan. Store refresh credentials in the native credential store, then issue scoped Runtime grants to the agent. Do not make users copy service keys or tokens into prompts.

Keep mode selection as a device/profile preference, as the overview says. The readiness register's recommendation of an account-wide mode preference conflicts with this. An account-wide toggle could unexpectedly redirect another device's work. In either case, each active operation binds its realm immutably.

Distinguish logout from stop/cancel. A native or browser logout should remove that device's access and terminate its active writer as appropriate, while already-admitted tasks remain retrievable on later login. Decide whether a hosted turn continues after its originating browser logs out; do not accidentally revoke every account session on one-device logout. Account disable/deletion is the separate global revocation operation.

## 4. One database per user does not require one permanent machine per user

Runtime really does own a local `owner.lock`, SQLite connection, local staging and CAS paths. The Turso adaptation is substantial. The [store implementation](/Users/peteromalley/Documents/reigh-workspace/banodoco-workspace-runtime/runtime_protocol/store.py:367) establishes sole realm ownership, not a product requirement for a permanently provisioned process or container for every registered user.

**Proposal:** first prove one service can hold a bounded set of isolated realm contexts. If existing global state makes that risky, use a bounded supervised subprocess per active realm on one host for the beta. Measure before choosing. Either arrangement must keep realms with live dispatch/leases serviced; idle eviction cannot abandon execution. Use one deployment replica and explicit stop-before-start upgrades if that is the tested ownership model. Do not introduce distributed placement, actor infrastructure, per-user DNS or automatic failover yet. Do not claim high availability with this deployment.

One database per user creates a real schema-operations requirement even at small scale: record schema version, provision at the current version, migrate under sole ownership, block incompatible opens and report per-realm failures. Use additive compatible upgrades initially and reuse Runtime's migration logic where its semantics survive. No general migration platform is needed. A failed Turso proof is a gate to revisit with the user, not permission to silently replace their chosen Cloud datastore with hosted SQLite.

## 5. Security and durable files: minimum boundaries, not a platform matrix

Keep tenant authorization on every Runtime operation, private signed media access, scoped expiring grants, server-held provider/Turso/service credentials, isolated hosted agents, output size limits, and account/global spend and resource caps. Workspace mutation APIs need authorization too; protecting only generation submission leaves broad shell/CLI routes to privileged Runtime operations.

Treat native and hosted agents as different execution environments using the same Cloud authorization contract. A native agent runs on the user's machine; a hosted agent runs untrusted tenant instructions on the service's infrastructure. For hosted agents, choose one sandbox provider and image and validate the actual Astrid tool path. Do not require a whole new tool-only agent framework if existing skills need CLI execution. Remove privileged credentials and dangerous administrative endpoints, enforce scopes at the server, and give the sandbox only the data its granted project requires. Egress restrictions are useful but should follow the actual threat boundary and supported tools, not become an unexplained all-or-nothing platform comparison.

Persisting a transcript does not persist files it mentions. Declare which outputs are durable: project artifacts, attachments and referenced media must become managed Runtime objects or records; arbitrary temporary checkout/scratch files are disposable. On a fresh native device, resolve logical project/media IDs into new local staging paths. Preserve the native OMP records, but do not promise that old absolute paths, interactive terminal processes or arbitrary local working directories survive a move.

For private object storage, avoid cross-user existence leaks through global content-hash lookups. Tenant authorization still applies to every association/read even if byte storage deduplicates. Reject unsafe provider-output URLs or otherwise constrain server-side retrieval so ingest cannot become an internal-network fetch proxy. Apply output limits before unbounded downloads. Start orphan cleanup conservatively with age thresholds and reference checks; no sophisticated distributed garbage collector is needed.

## 6. Import, export and rollout

Explicit Local-to-Cloud import is correct, but do not make a general live migration engine a prerequisite for proving the product. **Proposal:** start pilot accounts with new Cloud projects; next support a resumable import of inactive projects/conversations and verified media. Do not move running tasks or live writers. Namespace import identities by source realm and source record, rewrite references consistently, preserve provenance and exclude machine credentials. Historical task records must never recreate executable jobs or billing events.

Add a portable Cloud export path before asking users to trust irreplaceable work to the beta. Reuse Runtime export/manifest primitives where suitable, include native OMP data and managed media, and demonstrate a supported Local restore. That is data portability, not bidirectional synchronization. State account/project deletion and retention behavior, including outstanding jobs, holds and referenced objects. Operational recovery policy is also required before real-user rollout; this review does not authorize creating backups or workspace copies.

Recommended rollout order:

1. Select clean source pins and verify the deployed auth/billing baseline. In parallel, run only the decisive Runtime/Turso and OMP remote-durability probes. Define the interruption and provider-unknown policies now.
2. Build one authenticated Cloud service: account-to-realm provisioning, schema version checks, private object storage and native Cloud authentication. Demonstrate the same realm from two devices.
3. Wire the native OMP storage backend in both Local and Cloud entry points. Prove acknowledged turn durability, takeover fencing and hard-kill recovery with a fake model. Add the hosted sandbox using this same contract.
4. Complete one fake provider task from native and hosted agents through claim, atomic hold/job, verified output and settlement. Kill components at the consequential boundaries. Show recovered results in Reigh.
5. Release a bounded API-generation pilot with one capability, explicit inference/provider caps and an operator reconciliation runbook. Add inactive-project import and portable export before broad migration.
6. Add the separate measured CPU rendering lane. Broaden capability support only after actual usage and failure evidence justify it.

The smallest coherent first release includes the user's Local/Cloud choice, browser and native sign-in, one personal Turso realm, one-writer cross-device native OMP sessions, a hosted agent, one API generation capability, private results, fixed-quote credit recovery and visible interrupted/unknown states. It does not require automatic turn continuation, token-perfect stream replay, team tenancy, real-time Local/Cloud sync, multiple sandbox/storage backends, per-user always-on services, general scheduling or inference billing. CPU rendering is the next discrete lane, not part of the interactive sandbox.

Remaining decisions are concrete: native login handoff; tested Turso driver and bounded realm-hosting model; sandbox and storage provider; exact first capability and quote; writer takeover and logout behavior; inference/provider/resource caps; the timeout/escalation policy for unknown provider outcomes; and supported import/export plus retention scope. These can be short decision records backed by narrow proofs. A broad platform matrix or an exhaustive protocol suite before the first vertical slice would slow the project without resolving its most important risks.
