# Astrid Plan A contract freeze

Purpose: give Setup/Lifecycle (SL) and Execution/Worker (EW) one reviewable CF
input, without implementing either lane. The source of truth is
[`C1`](../../../config/contracts/astrid-plan-a-c1.json), a versioned JSON
composition governed by `scripts/quality/check-astrid-contract-freeze.mjs`.
This is a semantic contract awaiting consumer acknowledgement, not an installed
release, an auth service, a Runtime schema replacement, or a passed CF-M1 gate.

The current-source launcher update is recorded separately in the pending
successor [`C1-S1`](../../../config/contracts/astrid-plan-a-c1-s1.json). C1-S1
binds the exact launcher, product-credential helper, paired connector, and
credential test bytes. Runtime's authenticated handshake is the authority for
the token-derived product actor and exact negotiated scopes. The helper binds
the credential file's generation, ownership, restrictive mode, metadata, and
content fingerprint, then rechecks that binding after authentication and all
scope probes so file or token rotation fails closed. Runtime does not
expose its complete stored scope set. For the exact pinned Runtime API, the app
fails closed unless an authorization-before-validation backup probe proves the
bearer lacks `admin` and read-only handshake negotiations prove it lacks
`credentials:provision`, `worker:execute`, and `worker:register`. Those are all
authorities the pinned API recognizes outside the seven product scopes.
Unknown inert scope strings are not disclosed and are outside that authority
claim; any change to the Runtime source census requires a successor refresh.
The successor binds the exact Runtime repository, remote, HEAD, tree, NUL
status, tracked binary diff, authority files, and every untracked path plus its
content digest in
`config/contracts/astrid-plan-a-runtime-scope-census.json`. It also explicitly
supersedes the six drifted immutable-C1 Runtime evidence rows. Accepting
successor validation requires `--runtime-root` or
`ASTRID_RUNTIME_SOURCE_ROOT`; artifact-only or rootless validation is
non-accepting. The Runtime-backed credential fixture runs that live census
check before starting Runtime.
After authentication, the launcher passes the exact validated bearer bytes to
Vite through server-only `WORKSPACE_RUNTIME_TOKEN`. The `/api/runtime` proxy
does not read `ASTRID_PRODUCT_TOKEN_FILE` or the retired
`WORKSPACE_RUNTIME_TOKEN_FILE`, and it rejects a configured Runtime target when
the validated token is absent. This closes credential replacement between the
helper's final source-generation check and Vite configuration evaluation.
Local actor metadata and `REIGH_PAIRED_PRODUCT_ACTOR` are consistency assertions
only.
Both SL and EW acknowledgements remain pending. The active
`npm run check:astrid-contract-freeze` alias validates C1's immutable rules
together with C1-S1. The raw frozen C1 audit remains available as
`npm run check:astrid-contract-freeze:c1` and is expected to report the known
launcher source drift until consumers accept the successor. Host-facing video
editor entrypoints and the 58-import architecture migration are governed by
`config/governance/video-editor-sdk-import-allowlist.json` and are intentionally
outside C1-S1's credential and launcher scope.

The command examples in this frozen contract are proposal-era consumer wording;
they are not installed qualification evidence. The current installed operator
path is `astrid-local` with `ASTRID_LOCAL_DATA_ROOT`. `banodoco-local` and
`astrid-runtime` remain deprecated compatibility aliases and emit warnings;
`ASTRID_LOCAL_SOURCE_MANIFEST` is the explicit editable-development surface.

## Consume and verify

Set `ASTRID_RUNTIME_SOURCE_ROOT` to the exact Runtime worktree, then run
`npm run check:astrid-contract-freeze` or append `-- --json` for the active
composition report. Run `npm run check:astrid-contract-successor` for the
successor-only validator. Run `npm run check:astrid-contract-freeze:c1` for
the historical immutable C1 audit. Run `npm run test:astrid-contract-freeze`
and `npm run test:astrid-contract-successor` for deterministic positive and
negative cases.
The normal `npm run check:contracts` gate includes this check.

C2 is the immutable-successor diagnostic projection at
`config/contracts/astrid-plan-a-c2.json`. It repairs the C1 diagnostic shape so
a healthy checked scope has paired `problemCode: null` and
`failureBoundary: null`, while an observed failure has both values and an
unobserved independent fact remains explicitly unknown. Run
`npm run check:astrid-contract-c2` and `npm run test:astrid-contract-c2` for its
deterministic source, schema, fixture, bound, redaction and action-effect gates.
C2 rejects undeclared projection fields and malformed primitive fact/action
values, and resolves every suggested action ID against the exact ordered effect
list in C1's `commands` table; unknown commands and effect mismatches fail closed.
C2 does not replace `workspace.v1`, bless installed behavior, or rewrite C1;
Runtime remains the sole request/binding/attempt/settlement authority.

For an optional read-only comparison with the inspected external declarations:

```sh
npm run check:astrid-contract-freeze -- \
  --astrid-root /path/to/Astrid \
  --runtime-root /path/to/banodoco-workspace-runtime --json
```

The checker reads declaration files only. It does not inspect credential files,
contact services, run parsers, install dependencies, start processes, or mutate
workspace data. Without explicit external roots it reports those sources as
unverified. Passing checks validates the contract and available source bytes;
it does not qualify installed behavior or prove source publication.

`digest` is `sha256:` plus the SHA-256 of UTF-8 JSON with recursively sorted
object keys, array order preserved, no whitespace or trailing newline, and only
the top-level `digest` omitted. No other field is excluded. Source evidence
hashes instead cover each source file's exact bytes. Observed Git HEADs describe
where inspection occurred; dirty working-tree file hashes take precedence and
neither establishes release custody. The immutable C1 digest is the consumer
acknowledgement key. It is not a signature or independent approval.

SL and EW should validate C1, record its revision/digest in their own receipts,
and implement only their owned seams. Do not import this JSON into app boot or
use it to dispatch commands. Proposed command names and safety requirements
describe future adapters over existing authorities. Use the existing
`workspace.v1` OpenAPI/schema/generated clients for Runtime payloads; C1's
normalized facts and diagnostic vocabulary do not replace those wire types.
`validateDiagnostic` checks projection shape, contract binding, collection bounds
and declared action effects. It does not sanitize content, authorize actions or
execute argument strings. SL/EW must prove redaction and validate exact command
arguments at their existing execution boundary before offering an action.

## Frozen decisions

| Boundary | C1 decision |
|---|---|
| Workspace | One Create/Attach workspace becomes selected/default; retain UUID and registered absolute root on repeat/resume. Fresh packaged Create uses Astrid's existing `~/.astrid-data` support-root default. Attach does not copy. Resolve and pass the same root explicitly to the neutral launcher; never silently adopt its different default or cwd. |
| Local auth | Local app + local workspace uses the existing bridge session without Discord or contributor login. Missing Runtime yields degraded local state, not a hosted login gate. |
| Hosted auth | Hosted contexts require verified Discord sessions plus independent workspace/pairing/action grants. Contributor identity and explicit knowledge-write consent remain Hivemind-owned. Mode changes isolate grants/caches and preserve the sole local default. |
| Setup | Preview/check are nonstarting; offline forbids acquisition, not authorized local writes. Successful apply visibly starts Runtime. Failure preserves configured workspace and offers the proposed Runtime start action, never a task retry or another Create. The live installed operator command is `astrid-local up --profile astrid`; older `astrid-runtime` wording is compatibility/proposal history. |
| Naming | `astrid auth status` keeps contributor meaning. The transition release atomically assigns top-level `astrid status` to workspace/readiness. Other auth aliases survive the transition and next minor release, subject to documented removal conditions. |
| Execution | Runtime owns admission, idempotency, attempts, fencing, events and settlement. New attempts, Worker relaunch and GPU replacement remain distinct actions. Local stop/lost contact cannot prove remote stop or billing settlement. |
| Observation | Installed/enabled/connected/ready/authorized, task state, progress, freshness and remote uncertainty remain independent. Bounded redacted diagnosis preserves unavailable facts and declares exact next-action effects. |

Source inspection found real migration gaps: `setup` is not reserved before
prompt/dynamic-pack fallback; wrapper and gateway help differ; top-level status
still means contributor auth. `AstridClient.open_from_launcher` can start Runtime
even with `start_pack_host=False`, so current Astrid doctor/task inspection is
not evidence of nonstarting observation. Historical `banodoco-local connect` may
provision connection state. These are downstream implementation obligations.

## Composition and unresolved inputs

C1 selects existing `vibecomfy.run`, VibeComfy/ComfyUI `pip_embedded`, the existing
RunPod target kind, local macOS and Linux/CUDA worker platform direction, and the
existing `astrid-beta-current-mac` capability profile. Exact account/pod, worker
architecture/image, workflow/model assets and compatible dependency closure
remain unresolved. No personal RunPod example becomes a default. EW must prove
the selected engine profile is enforced; availability alone does not prove it.

The machine/source Hivemind declaration supersedes the stale older planning pin.
All nineteen shipped non-local packs remain available, with experimental labels
retained for `comfy_wrap`, `stream_content` and `wan2gp`. C1 explicitly selects
the existing core, Hivemind, VibeComfy and stable timeline skill views for initial
setup. This reconciles a gap between discovery and legacy skill-default logic;
it does not claim today's setup already makes that selection. Compatibility and
prerequisites remain separate, and repeat setup preserves explicit disables.

Every missing input has an ID, kind, owner, deadline and reason in `unresolved`.
Those references cannot be replaced by fabricated hashes or empty “resolved”
records. They cover SL/EW delivery and acknowledgement, worker controls, source
publication/custody and dependency closure, actual workspace inventory and
physical preservation, the hosted-only secure exchange, and the future Rn.
Hosted wire/storage/consent/expiry/deployment decisions must be frozen before
affected Plan B integration; they do not block ordinary local use.

No actual workspace inventory, backup, restore, worker setup, generation or
hosted exchange was performed for C1. Its scenario mapping records future proof
obligations, all unexecuted. Runtime contract/client reconciliation in the
separate imported-media-catalog lane requires a fresh ownership/merge review.

## Revision and acceptance rules

After review/issuance, never rewrite C1 to make changed sources pass. Add a
successor Cn and matching versioned validator contract, obtain both consumers'
acknowledgements and let the parent invalidate affected evidence. Keep C1 as an
audit input. C1-S1 is pending exact SL/EW acknowledgement and does not establish
installed acceptance. Validate only relevant source snapshots, not unrelated
dirty files.

Rn must reference the exact Cn digest and real immutable source, artifact,
environment/dependency/model/profile and acquisition identities. Unresolved
inputs needed by that tuple prohibit installed acceptance. CF-M1 requires the
pending inventories and both consumer acknowledgements; CF-CLOSE additionally
requires final physical disposition and Rn. Parent alone accepts A-10/A-M1.
This foundation neither seals Rn nor claims any of those gates.
