# Plan — Astrid Plan A final-state closeout

This is a delivery plan, not a claim that the target is already complete. It
closes the cross-repository composition gaps found after the earlier published
Plan A baseline while reusing existing foundations.

## Canonical end state

Product commands:

```text
astrid setup
astrid status
astrid doctor
astrid worker start
astrid projects ...
astrid tasks ...
astrid runs ...
astrid auth login|status|logout|revoke
astrid agent
```

Low-level operator commands:

```text
astrid-local up|connect|restart|down|doctor|workspace|start-worker
```

Compatibility aliases delegate to the same implementation:

```text
banodoco-local -> astrid-local
astrid-runtime -> astrid-local
astrid-tools -> product gateway compatibility alias
python -m astrid -> supported module alias
```

Do not rename internal packages or `workspace.v1` in this project. Runtime owns
state and authority; Astrid orchestrates and presents; one neutral Worker
supervisor launches one GenericPackHost; the app consumes Runtime authority.

## Workstreams

| ID | Route | Outcome | Depends on |
|---|---|---|---|
| P0 | normal | Freeze refs, dirty-state dispositions, and evidence applicability | — |
| X1 | xhard | Settle command ownership, namespace, and compatibility semantics | P0 |
| X2 | xhard | Unify workspace-root and installed-composition authority | P0, X1 |
| X3 | xhard | Reconcile Runtime/Worker discovery and receipt ABI | P0, X2 |
| X4 | xhard | Reconcile Runtime metadata/generated clients with the app adapter | P0, X3 |
| X5 | xhard | Restore observer-only semantics and diagnostic truthfulness | P0, X1, X2 |
| N1 | normal | Implement routing, aliases, config compatibility, and provenance metadata | X1, X2 |
| T0 | xhard | Build the composed contract harness and negative-control matrix | X1–X5 |
| T1 | normal | Extend focused repository-local tests | X1–X5 |
| T2 | xhard | Run source-level producer-to-consumer contract tests | T0, T1 |
| T3 | xhard | Run clean installed cross-interpreter end-to-end qualification | N1, T2 |
| N2 | normal | Rewrite canonical setup/troubleshooting documentation | N1, T3 |
| N3 | normal | Assemble evidence, affected suites, and publication checks | T3, N2 |
| R1 | normal | Independent final completion/strategy review | N3 |

XHARD routes are reserved for non-local authority/contract questions that can
pass repository-local tests while failing at integration boundaries. Normal
tasks implement settled, testable changes.

## Required implementation decisions

### X1 — namespace and dispatcher

`astrid setup/status/doctor` must route to local product/runtime behavior;
Hivemind identity moves to `astrid auth status`; `astrid agent` remains the
conversational route. `astrid-local` is the operator command. Legacy names warn
and forward, never select a second authority.

### X2 — workspace and installed provenance

`astrid setup --create --apply` creates one workspace with safe defaults;
`--attach` requires explicit identity. No cwd fallback, implicit adoption,
second catalog, or source-checkout requirement in the standard installed path.

### X3 — Runtime/Worker ABI

Reconcile `worker_credential_pending`, receipt versioning, endpoint/workspace/
epoch/credential identity, and activation timing. Runtime-generated discovery
and receipts must pass through the actual Worker parser. Legacy direct task/DB/
engine execution paths are deprecated from the Astrid-supported route, but the
`reigh-worker` repository remains canonical for now.

### X4 — app contract

Update the app to Runtime schema digest `sha256:f47cff…`, current operations,
and canonical task states (`ready`, `retrying`, `cancel_requested`, etc.).
Readiness must validate protocol, schema/component digest, capability, and
authenticated handshake—not health alone.

### X5 — observation and diagnostics

Status, doctor, task/run/evidence reads never start, repair, or retry services.
`runs show --evidence` must return evidence. Diagnostics must distinguish
unknown, stopped, stale, mismatched, failed, and healthy observed states, with
redacted non-executable shared output.

## Composed acceptance journey

Build the exact current tuple and install it into disposable environments:

- Astrid/Runtime: Python 3.11.
- Worker: Python 3.10.
- App probe: its locked Node environment.
- `PYTHONPATH` unset; no editable installs or sibling imports.
- Loopback only; deterministic fake engine; no GPU/RunPod/provider calls.

Run:

```text
astrid --version
astrid setup --create --check --json
astrid setup --create --apply --json
astrid status --json
astrid doctor --diagnostic --json
astrid worker start --json
submit deterministic fixture task
inspect task/run/progress/output
astrid runs show <run> --evidence --json
exercise failure/retry/cancel/stale-worker paths
astrid doctor --diagnostic --shared
astrid-local down --json
astrid setup --attach --apply --json
```

The journey must prove command ownership, one workspace/root, real Runtime ↔
Worker handoff, fencing, app contract compatibility, output/diagnostic truth,
observer non-mutation, aliases, module origins, artifact hashes, and cleanup.

## Worker deprecation boundary

Keep Astrid's internal GenericPackHost and keep `reigh-worker` as the external
Worker substrate. Deprecate only direct legacy task/DB/engine routes and
duplicate launch spellings (`run_worker`, root `worker.py`, root
`run_worker.py`) by forwarding or failing clearly. Full repository retirement
is a later project requiring caller inventory, neutral-package extraction,
credential/queue drain, rollback, a release window, and reachability proof.

## Evidence and publication

Write fresh receipts under the receiving run's evidence directory:

```text
01-baseline.json
02-command-ownership.json
03-workspace-provenance.json
04-runtime-worker-abi.json
05-app-contract.json
06-observer-lifecycle.json
07-diagnostics-truthfulness.json
08-alias-env-compatibility.json
09-installed-artifacts.json
10-installed-e2e.json
11-documentation-validation.md
12-final-acceptance.md
```

Every receipt records source refs, artifact hashes, command/environment, expected
and observed result, exit code, producer/consumer identity, negative-control
result, and whether behavior was real or fixture-simulated.

After the affected suites and final review pass, commit only reviewed changes
and push each repository's implementation branch to its public `origin`. Verify
remote refs. Do not force-push or silently merge to `main`.
