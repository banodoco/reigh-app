# Reigh Cloud: maximising parallel delivery

**Shared metaplan:** [Reigh Cloud — coordinated projects and execution schedule](/Users/peteromalley/Documents/reigh-workspace/reigh-app/docs/design/cloud-mode-megado-projects-2026-10-05.md).

**2026-10-05 — independent Astra scheduling advice, planning only.** This interprets “synchronous work” as simultaneous work across the six existing Megado projects. It proposes changes to scheduling and task dependencies; it does not change the existing plans, authorize implementation, certify execution, bind future model budgets, or constitute an oracle review.

The best pattern is **one coordinator, three active implementation slots, and six persistent project backlogs**. Keep a worker on the Runtime critical path, rotate the other two through the nearest useful consumer slices, and integrate those slices continuously. Six dedicated workers plus a coordinator is a possible higher-capacity arrangement, but the current native tool limit is four active agents including the root: only three worker slots. Six project names do not create six independent workstreams.

The largest gain comes from replacing “wait for project completion” with “start against this particular contract, then join this particular real backend.” It does not come from writing six large implementations against unrelated mocks. Preserve all six deliverables, including CPU rendering and import/export; a generation pilot remains a partial milestone.

## 1. The small amount of contract work that unlocks overlap

Use the existing IAM-01, WSP-01, EXE-01 and CONV-01/02 tasks to record the agreements below. Do not add a seventh planning project, a separate contract service, or a new review hierarchy. “Frozen” here means a versioned initial interface with explicit amendments, not a claim that design will never change.

| Initial agreement | Accountable owner and contributor | Minimum content needed by consumers |
|---|---|---|
| Identity and realm opening | IAM-01 owns account mapping/grants; WSP-01 supplies Runtime lifecycle constraints | Supabase UUID, opaque realm ID, ensure/open operation identity, pending/ready/failed result, authenticated endpoint, scope/expiry/revoke errors. No DB locator or credentials in consumer DTOs. |
| Runtime persistence and object boundary | WSP-01 owns transaction/commit/fence semantics; WSP-03/04 define gateway/object surface | A durable receipt and error classification; schema compatibility; current writer/attempt fencing; opaque verified object reference; begin/finalize/read behavior. SDK selection can remain unresolved while the external DTO is agreed. |
| Turn → intent → task → delivery → billing identity | CONV-02 owns stable accepted-turn/tool-intent production; EXE-01 owns admission/outbox/claim/delivery/hold semantics | IDs and their scopes, replay behavior, actual returned claim binding, fixed quote, attempt/lease/fence/epoch, coordinator heartbeat ownership, provider-unknown/cancel behavior, verified result and settlement identity. |
| UI and render consumption | PROD-01/03 and CPU-02 consume the above | Exhaustive visible states and errors; realm pinning; read-only task/result views; frozen render input and common delivery envelope. Neither consumer creates a second task or billing lifecycle. |

Agree identity/realm handles first; settle execution and conversation correlation together as soon as EXE-01 and CONV-02 start. Do not make renderer packaging, OMP storage discovery, or the Turso experiment wait for every row of this table. Conversely, do not freeze EXE-01 without CONV-02’s stable tool-intent semantics and then ask the conversation project to retrofit them.

WSP-01 currently combines two distinct outputs: an interface and actual remote SQL conformance. Label these separately within that task. An agreed interface unlocks consumer implementation, but only the real driver proof unlocks claims about remote durability, migration safety and competing writers. A rejected Turso driver is a real blocker for Cloud persistence, not permission to silently substitute another datastore.

The settled architecture remains unchanged: Supabase accounts/control/billing; personal Turso DBs owned by Runtime; agent-only submission; private blobs; native OMP storage shared across Local/Cloud and native/hosted entry points; one small trusted Cloud service; isolated agent sandboxes and a separate CPU renderer. Project divisions are code ownership, not six services.

## 2. Concrete changes to dependency lines

These are **proposed replacements**, leaving task IDs and final outcomes intact. Split `Start` from `Complete` inside the existing task description where necessary. This prevents an early partial slice from being mistaken for a completed task.

| Task | Current dependency | Proposed dependency wording |
|---|---|---|
| IAM-01 | None; agree with WSP-01 | Keep. Publish the opaque handle/grant/provisioning contract without waiting for the full SQL proof. |
| IAM-02 | IAM-01 | Keep contract dependency for Cloud binding. Existing auth restoration and device preference/cache behavior can start immediately; join WSP-03/05 before claiming real Cloud switching. |
| IAM-03 | IAM-01 and bounded callback spike | Start the bounded handoff/credential-store work immediately. Cloud profile binding requires IAM-01; actual login proof requires supported auth configuration. |
| IAM-04 | IAM-01 and WSP-01 interface | Keep. Distinguish implemented mapping/grant control from real DB provisioning convergence, which remains WSP-05. |
| IAM-05 | IAM-02/03/04 and WSP-05 | Keep; this is real two-device acceptance, not a mock task. |
| WSP-01 | None | Keep; export the interface separately from the engine/SDK conformance result. |
| WSP-02 | WSP-01, IAM-01 interface | Keep actual SQL proof for remote lifecycle completion. Migration structure and local contract adaptation may start during WSP-01. |
| WSP-03 | WSP-02 and IAM-01 | Start after IAM-01 grant/realm and WSP-01 lifecycle interfaces. Build gateway authorization/routing against an isolated realm adapter. Complete against WSP-02 and real IAM-04 grants; do not call mock grant validation production authorization. |
| WSP-04 | WSP-01 interface; prototype independently | Start provider selection, resumable bytes and verification independently. Metadata publication/GC completion requires the real WSP-02 store and WSP-03 authorization. |
| WSP-05 | IAM-04 and WSP-02 complete | Keep for convergence; failure fixtures can be prepared before either completes. |
| WSP-06 | WSP-03/04/05 | Keep final matrix; run available isolation/restart cases incrementally. |
| EXE-01 | IAM-01/WSP-01 interfaces; fakes | Keep interfaces, not WSP-01’s completed remote proof. Add agreement with CONV-02 on durable intent identity as an interface contribution, not a dependency on completed CONV-02. |
| EXE-02 | EXE-01 and IAM-04 interface | Keep for hold/job implementation; real cross-store completion requires WSP-02/03 and actual mapping/grants. A fake ledger cannot prove atomic credit reservation. |
| EXE-03 | EXE-01 fake contract | Keep. Port handlers/remove the old executable path in the selected delivery checkout; do not wait for the full Runtime project. Integrated managed-result proof needs WSP-04 and EXE-02. Production cutover remains separate. |
| EXE-04 | EXE-02/03 and WSP-02 | Start state-machine/crash-case implementation after EXE-01; complete the real saga after EXE-02/03, WSP-02/03/04. Include CONV-02 stable intent and CONV-03 stale-submit checks in the joined proof. |
| EXE-05 | EXE-03/04; live inventory future gate | Start source removal inventory and preservation criteria immediately. Final disposition/removal evidence requires EXE-03/04; deployed inventory still requires the applicable access and baseline. |
| CONV-01 | IAM-01/WSP-01 interfaces; fake allowed | Start native OMP storage wiring, Local behavior and delayed-write/hard-kill probe immediately. Cloud adapter binding needs those interfaces; real remote persistence needs WSP-02/03. |
| CONV-02 | CONV-01; WSP-03 mockable contract | Start turn/tool identity and commit-boundary design alongside CONV-01 and EXE-01. Implement against the WSP-03 contract; complete remote durability proof against WSP-02/03. |
| CONV-03 | CONV-02 and WSP-03 enforcement | Start fencing logic and stale-writer cases against their contracts. Complete with real Runtime enforcement; include EXE-01 admission seam so an expired writer cannot submit a new paid intent. |
| CONV-04 | IAM-03/04 and WSP-03 interfaces | Start host/image/controller smoke independently. Authenticated hosted use needs IAM-04 grants and WSP-03; resume needs CONV-01/02/03. IAM-03 native OAuth is not a prerequisite for hosted sandbox construction. Native-to-hosted acceptance still needs IAM-03. |
| CONV-05 | CONV-01..04, IAM-05, WSP-05 | Keep final matrix; run hard-kill/reopen and stale writer cases as each real seam lands. |
| CPU-01 | WSP-01 and EXE-01 interfaces | **Start: none for packaging and deterministic local render.** Use the existing adapter. Delivery wiring belongs to CPU-02, so its contract must not block image/dependency proof. |
| CPU-02 | WSP-03 and EXE-02 APIs | Start against EXE-01 delivery/heartbeat/cancel contract. Complete against real WSP-03 and EXE-02/04. Never add a second claimant, heartbeat owner or settlement path. |
| CPU-03 | WSP-03/04 | Start frozen snapshot, input manifest/hash validation and scratch cleanup against object fixtures. Complete private input/output publication against real WSP-03/04 and the CPU-02 attempt fence. |
| CPU-04 | CPU-01..03 | Start resource measurement after CPU-01. Complete crash/retry/cancel/settlement evidence after CPU-02/03. |
| PROD-01 | IAM-01/WSP-01 interfaces; fakes | Start display components and state fixtures immediately. Auth/mode and provider wiring require IAM-02/WSP-03 interfaces; real cross-user/cache isolation requires the implementations. IAM-02 owns preference/auth switching; PROD-01 consumes it. |
| PROD-02 | WSP-04 and CONV-02 APIs | Start manifest, namespaced ID/reference mapping and inactive-data fixtures immediately; record format needs CONV-01/02 agreement. Complete supported Cloud export/import and Local restore with real WSP-02/03/04 and CONV-02, including no job/hold creation. |
| PROD-03 | IAM-02, WSP-03, EXE-04, CONV-04 contracts | Start after agreed IAM/WSP/EXE/CONV DTOs; do not wait for completed EXE-04 or CONV-04. Complete canonical presentation/reconnect against real implementations. |
| PROD-04 | IAM-05, WSP-06, EXE-05, CONV-05, CPU-04 | Keep these final acceptance dependencies. Add progressive joined checkpoints under PROD-04 now; the first narrow real slice does not wait for every upstream full matrix. |
| PROD-05 | PROD-04 and ops inputs | Start the readiness record/unknowns immediately. Final readiness still requires PROD-04 and the actual ops decisions; real-provider canary remains separately authorized and budgeted. |

This removes false waiting while adding explicit completion dependencies where the current shorthand could hide risk. It should not turn “fake passes” into permission to mark Cloud behavior done.

## 3. What to run with three worker slots

This is a priority rotation, not a calendar estimate or a sequence of global barriers. Rotate at a merged slice, a durable probe conclusion, or a genuine external wait. Preserve a short handoff under the same existing run/task. Do not retain six idle subagents or create another run forest.

| Window | Slot A: protect the Runtime path | Slot B | Slot C | Convergence sought |
|---|---|---|---|---|
| Opening | WSP-01 exact remote SQL proof; publish lifecycle contract early | IAM-01, then IAM-02/03/04 foundation | CONV-01 delayed remote write/hard-kill probe; CONV-02 intent/receipt contract | Discover Turso and OMP feasibility issues before broad consumer code. EXE-01 owner receives the agreed intent semantics. |
| First usable backend | WSP-02 and narrow WSP-03 | Finish IAM-04/03 as needed; contribute WSP-05 join | EXE-01/02 and one new-contract EXE-03 handler | One real account mapping, realm, grant and atomic hold/job path. CONV probe results already constrain delivery. |
| First durable task | WSP-04 plus WSP-03/05 fixes | CONV-01/02/03 against real Runtime; begin CONV-04 | EXE-03/04; narrow PROD-03 read view when useful | Accepted OMP turn → durable tool intent → claimed task → real hold/job → fake provider → private verified result → settlement. |
| Broaden clients | Runtime bottlenecks/WSP-06; release slot when clear | CONV-04/05 and IAM-05 | PROD-01/03 and progressive PROD-04 | Native and hosted reopen the same durable state; real mode/account isolation. |
| Complete remaining deliverables | CPU-01..04, if Runtime path no longer needs full slot | PROD-02 import/export/Local restore | Remaining EXE-04/05, PROD-04 integration and targeted failures | CPU uses the same delivery protocol; portability never re-executes history. |
| Close | Fix the highest-severity remaining integration defect | Finish the corresponding component evidence | PROD-04/05 completion | Full six-project acceptance and an honest remaining rollout record. |

CPU-01 is immediately ready even though the default rotation schedules it later: early readiness is not a reason to displace Turso/OMP/billing risk work. Pull CPU-01 or PROD-02 forward whenever a slot would otherwise wait for credentials, SDK results, a shared-file merge, or a backend. Once the first task slice works, explicitly reserve slots for CPU and portability so a perpetual generation polish queue cannot starve them.

The coordinator owns dispatch, dependency amendments, source integration order and the PROD-04 joined view. It should not become a fourth full-time implementer of `service.py`; that would remove integration capacity and collide with the critical-path owner. Nor should every slice trigger another broad architecture review. Use the existing projects’ actual review requirements when delivery starts.

With six worker slots plus a coordinator, dedicate one worker to each project after initial contract agreement. Initially the additional slots are best spent on WSP-04 bytes, CPU-01 packaging and PROD-01/02 fixtures, while 01/02/03/04 establish real seams. A seventh implementer has no obvious independent critical-path work. Extra agents can shorten off-path packaging/UI/provider adaptation; they cannot divide a transaction decision or shared migration into six independent tasks. No measured speedup or calendar compression can be inferred from the 41–67 engineer-day planning total.

## 4. Exact shared-source hotspots and ownership

The paths below were checked locally, with selected contents inspected. They locate contention; they are not selected clean delivery pins. The source-state record still governs kickoff custody.

| Shared surface | Proposed owner and parallel contribution rule |
|---|---|
| Runtime `runtime_protocol/store.py`, `canonical_schema.py`, `upgrade.py` | 02 owns storage adapter, transaction/lifecycle mechanics and migration ordering. 03 supplies outbox/settlement additions; 04 supplies session/turn/fence additions; 06 supplies portability requirements. Contributors may prepare bounded changes, but one integrator lands a coherent schema/version change. |
| Runtime `runtime_protocol/service.py`, `server.py` | 02 owns gateway/realm and transaction seams; 03 owns task/dispatch behavior; 04 owns conversation semantics. Allocate method/module regions for each slice and serialize edits at shared transaction/authorization entry points. Do not have all three refactor this large service file concurrently. Extract only a narrow module needed for the change, not a new general framework. |
| Runtime `contract/openapi/workspace-v1.yaml`, `contract/manifest.json`, `contract/component-manifest.json`, `generators/generate.py`, `generators/python_client_template.py`, `packages/python/banodoco_workspace_client/generated.py`, `packages/typescript/src/generated.ts` | 02 owns the common protocol landing sequence. Domain owners provide endpoint/schema changes. Merge canonical changes, then update clients and metadata together; consumers use the same contract revision. The current Python generator renders a template and embeds digests; TypeScript generation is partly source-preserving, so do not assume regenerating automatically implements every new TS method. Check that explicitly. |
| Reigh `src/integrations/runtime/generated.ts`, `client.ts`, `dataProvider.ts`; Astrid `astrid/sdk/workspace_client.py` | 02 owns shared transport/protocol consumption; 01 contributes authenticated profile behavior; 03/04 add their supported operations; 06 owns presentation-facing data integration. Advance client/package pins as one coherent slice. Current Astrid imports `banodoco_workspace_client` as a package; an older report’s in-tree `astrid/banodoco_workspace_client` path is absent here. Do not patch a stale copy. |
| Reigh `src/shared/contexts/AuthContext.tsx`, `src/app/runtime/dataAuthority.ts`, `src/shared/components/AppHeader.tsx` | 01 owns auth state and device preference/provider-switch semantics. 06 owns Cloud view components and consumes the published context. Assign the header/mode-selector edit to one owner per slice. Current authority is a build-time `astrid`/`supabase-deferred` choice; simply enabling that flag is not account-to-Turso Cloud mode. |
| Reigh `supabase/migrations/`, `src/integrations/supabase/types.ts` | 01 owns account/mapping/grants migrations; 03 owns hold/job/ledger migrations. Reserve distinct migration filenames, agree ordering and schema references, land serially, then refresh the common type artifact once from the resulting schema. Do not edit applied historical migrations to retire old behavior. |
| OMP `packages/coding-agent/src/session/session-storage.ts`, `indexed-session-storage.ts`, `session-manager.ts`; Astrid `astrid/omp_agent.py` | 04 owns native SessionStorage/turn commit/writer semantics and all launcher wiring; 01 provides native credentials/profile contract. Do not let 06 invent a separate transcript to unblock UI. |
| Reigh `scripts/reigh-acp-bridge.ts`, `scripts/reigh-project-chat.ts`, `src/tools/video-editor/hooks/useAgentSession.ts` | 04 owns ACP transport/controller and session identity; 06 owns display/state projection. Publish the transport seam before simultaneous edits to the hook. |
| Orchestrator `api_orchestrator/main.py`, `database.py`, `task_utils.py`, `task_handlers.py`, `handlers/`, `Dockerfile`, `railway.json` | 03 owns replacement/removal and deployment contract. 05 consumes the new delivery interface; it does not fork the old queue worker. Preserve useful provider handlers and historical references while deleting the obsolete executable path. |
| Astrid `astrid/packs/rendering/`, `astrid/core/rendering/`, `astrid/sdk/rendering.py` | 05 owns packaging and the CPU worker adapter. 02 supplies private objects, 03 delivery/coordinator behavior. The CPU plan’s phrase “claim only render capability” must mean delivery consumption under CPU-02’s coordinator-owned Runtime attempt, not a new independent Runtime claimant. |

Worktrees isolate filesystem edits and allow independent checks. They do not isolate a changing OpenAPI digest, migration order, record format, token semantics or billing policy. At delivery kickoff, choose custody per repository without overwriting the existing dirty trees; no worktrees are created by this advice. Each slice should name its source pins and consumed contract revision. Rebase consumers promptly when a shared seam lands, regenerate/update shared artifacts once on the integrated revision, and rerun the affected boundary checks. Do not solve conflicts by retaining compatibility queues, dual writes or an old orchestrator fallback.

## 5. Fixtures, first convergence and integration cadence

Fixtures are useful for browser state projection, OAuth callback handling, deterministic render packaging, object digest/manifest checks, OMP record preservation, duplicate-intent logic, and provider ambiguity transitions. Make them adversarial: delayed persistence, response lost after commit, out-of-order visibility, stale generation, interrupted upload and a provider that accepted work without returning an ID. A successful in-memory append should never stand in for remote durability.

Fixtures cannot establish Turso transaction/rollback/CAS semantics, Supabase hold/job atomicity, grant enforcement, remote OMP acknowledgement durability, private object authorization or real provider recovery. A fake provider is appropriate for the first end-to-end slice, but pair it with the actual selected database implementations and real persistence boundaries in isolated development environments when that work is authorized. Keep model output deterministic for the crash proof. A live paid provider call remains a later separately authorized canary.

Under PROD-04, converge the following narrow slice **before** completing every UI, sandbox feature or component matrix:

1. Two isolated account identities resolve distinct realms; repeated ensure/open for one account adopts one realm, including a mapping-write failure. A client cannot open the other realm or its private object.
2. An OMP native session accepts one durable turn through Runtime on the selected Turso backend. Hard-kill after acknowledgement, reopen in a fresh process and recover the same record/turn/tool-intent IDs. A remote write delayed behind `appendSync` must not be acknowledged prematurely. Take over writer generation and reject the old writer’s append and new task submission.
3. Admit two same-capability intents and bind the quote, hold and delivery to the task/attempt actually returned by Runtime claim. Lose the RPC acknowledgement and replay: one Supabase hold/job, no overspend. The provider fixture accepts one operation and loses its acknowledgement: recover or remain explicitly unknown without submitting a second paid operation.
4. Upload and verify private output, then cut execution between Runtime result commit and Supabase settlement. Restart and converge to one canonical result and one settlement. The already-admitted task survives conversation takeover; stale attempt publication fails. Fresh client reads the result after the original agent process is gone.

This exposes the three principal hazards together: remote SQL semantics, OMP’s asynchronous backing writes, and non-atomic Runtime/Supabase/provider ordering. It is stronger than six passing fake demos and still much smaller than full release acceptance. Next add the real hosted sandbox teardown/recreate path, second-device native login, CPU delivery, and inactive import/export/Local restore. Full PROD-04 dependencies remain intact.

Integrate at the end of each small contract/behavior slice and at least at a regular working-day checkpoint during sustained delivery. Consumers should not sit several completed slices behind the shared contract. If a boundary is broken, the next available slot fixes it before producing more code that depends on it. The coordinator can track only existing task IDs, current contract revision, next required producer slice and joined evidence in the existing statuses; a new governance dashboard is unnecessary.

## 6. Critical path and expected limits

The likely path is **WSP-01 remote semantics → WSP-02 lifecycle plus WSP-03 auth → joined CONV-02/03 and EXE-02/04 → native/hosted recovery → PROD-04**. WSP-04 joins the result/settlement path and must start early enough not to become its tail. IAM-04/WSP-05 is a short but unavoidable identity/provisioning join. CPU-04 and PROD-02 are separate completion tails and must be scheduled deliberately, not postponed until all generation work is polished.

The largest uncertainty is not the number of typing agents: it is whether the selected Turso driver can preserve the existing Runtime transaction/owner semantics, where OMP can safely wait for remote commits, and what recovery is possible when a provider accepts work ambiguously. Source shows direct `store.conn` use, local ownership locking and nested transaction/savepoint behavior; there is no already-proven generic remote repository layer. OMP explicitly queues remote writes and drains them asynchronously. Runtime claim does not accept arbitrary task IDs. These are concrete reasons to keep the three early risk slices ahead of broad parallel UI work.

Use additional workers only when there are additional ready, bounded ownership areas and integration capacity. If shared contract changes are arriving faster than consumers can absorb them, fewer simultaneous slices will finish sooner. The useful throughput measure is accepted joined behavior, not agents active or tasks marked mock-complete.

## Evidence consulted

- [Six-project index](cloud-mode-megado-projects-2026-10-05.md), and each existing run’s `tasklist.md` and `plan.md` under `/Users/peteromalley/Documents/reigh-workspace/Astrid/.otto/runs/{01-identity-access,02-workspace-storage,03-execution-billing,04-agent-conversations,05-cpu-rendering,06-product-integration}-reigh-cloud/`.
- [Reviewed product overview](cloud-mode-project-overview-2026-10-05.md), [Astra architecture review](cloud-mode-astra-review-2026-10-05.md), and selected Runtime/agent evidence in [the research directory](cloud-mode-research-2026-10-05/). Settled overview/review constraints take precedence over older research suggestions such as broad token-event persistence or alternate datastore fallback.
- Selected local source reads: Runtime `store.py` transaction/owner handling, `canonical_schema.py`, `service.py` claim path, and `generators/generate.py`; OMP `session-storage.ts` append semantics and `session-manager.ts` flush/drain; Reigh `AuthContext.tsx`, `dataAuthority.ts`, `integrations/runtime/dataProvider.ts`; Astrid `sdk/workspace_client.py` and launcher references. No implementation, tests, credentials, deployed schema, worktree creation, paid calls or live services were used for this scheduling review.
