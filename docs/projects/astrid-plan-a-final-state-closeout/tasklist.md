# Tasklist — Plan A final-state closeout

Each task must carry its exact repository scope, source SHA/artifact identity,
acceptance evidence, dependency set, and `normal`/`xhard` route when dispatched.

| ID | Route | Concrete outcome | Proof |
|---|---|---|---|
| P0 | normal | Record exact refs, remotes, dirty material, and historical evidence applicability | baseline receipt; no unclassified source |
| X1 | xhard | Freeze command ownership and compatibility matrix | installed dispatch tests; one owner per command |
| X2 | xhard | Make Astrid/Runtime/Worker/app agree on one root and composition provenance | root/realm/digest/import-origin receipt |
| X3 | xhard | Align Runtime discovery/receipt with Worker and preserve fail-closed identity | producer-output-to-parser tests; positive/negative handoff |
| X4 | xhard | Align app digest, generated operations, task states, and readiness | real Runtime/app handshake and mismatch rejection |
| X5 | xhard | Remove lifecycle side effects from reads and correct diagnostic projections | before/after process/catalog/credential assertions |
| N1 | normal | Implement `astrid` routing, `astrid-local`, aliases, env migration, provenance metadata | CLI/config/alias tests and deprecation output |
| T0 | xhard | Extend existing artifact harness into one composed boundary harness | exact producer and consumer pairs |
| T1 | normal | Add focused tests for dispatcher, roots, ABI, app states, diagnostics, evidence flag | focused suite green |
| T2 | xhard | Run source-level cross-repository contract tests with deliberate mutations | positive and negative controls behave correctly |
| T3 | xhard | Run clean installed local E2E with real processes and deterministic engine | installed E2E receipt; no source imports; teardown clean |
| N2 | normal | Rewrite canonical setup, worker, diagnostics, and migration docs | docs validation receipt; no stale golden path |
| N3 | normal | Assemble evidence and verify publication | final acceptance; remote refs equal pushed SHAs |
| R1 | normal | Independent final Astra review | completion/strategy disposition |

## Boundary test matrix

The composed harness must test these producer/consumer pairs, even when local
unit suites are green:

- Astrid dispatcher → installed `astrid` command.
- Astrid setup → Runtime catalog/discovery/root.
- Runtime discovery/receipt → Worker parser/activation.
- Runtime metadata/generated client → Astrid client and app adapter.
- Read commands → actual process/catalog/credential state.
- Runtime task/attempt/output facts → diagnostics and app projections.
- Canonical aliases/config names → one implementation and one root.
- Worker supervisor → exactly one GenericPackHost and no legacy direct task loop.

For every boundary include a positive current tuple and a deliberate negative
control: stale digest, missing/extra field, old receipt version, wrong root,
wrong PID/epoch/credential, source import leakage, observer-triggered startup,
or conflicting old/new configuration.

## Final gate

Plan A passes only if every XHARD task, T3, required normal task, and R1 passes;
the installed exact tuple works; no duplicate authority remains; the Worker
process graph is canonical; docs describe one path; and no GPU/RunPod/provider
operation was attempted or implied.
