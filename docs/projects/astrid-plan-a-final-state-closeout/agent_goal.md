# Goal — Plan A final-state closeout

## Mode and authority

Mode: **delivery**. The receiving agent may implement, test, commit, and push
the scoped changes to the four public repository remotes recorded in
`source-state.md`. The handover branch is the portable control package;
product source remains in the relevant repository-local worktree.

The source baseline is the exact four-SHA tuple in `source-state.md`. Local
uncommitted material is not silently included. The receiving agent must classify
any needed dirty material before using it.

The prior Megado run is historical context. Reuse accepted decisions and
evidence where applicable, but do not reuse old installed qualification as proof
of this final tuple. Fresh cross-system and installed evidence is required.

## Objective

Make Plan A a clean, composable end state across Astrid, Runtime, Worker, and
the app consumer: unify the Astrid/Astrid Local namespace, preserve aliases
without duplicate authority, reconcile workspace/provenance/ABI/app contracts,
make reads observer-only, make diagnostics truthful, qualify the exact installed
composition end to end with deterministic no-GPU execution, and publish the
validated changes to the appropriate public remotes.

## Boundaries

In scope: local app-free setup, one workspace, Runtime/Worker process and
credential handoff, deterministic task/output/failure flow, app contract
compatibility, CLI/config aliases, packaging, documentation, and evidence.

Out of scope: live GPU, RunPod/provider provisioning or spend, model quality or
performance, hosted app/PWA/Discord login, multi-workspace support, and full
retirement of the `reigh-worker` repository.

Worker deprecation is limited to retiring direct legacy task/DB/engine paths and
duplicate launch spellings from the Astrid-supported route. Keep the canonical
external Worker until a separate migration proves extraction, caller/credential
cutover, drain, rollback, and retirement.

## Finish conditions

Do not call this complete until source and cross-repository checks pass, the
installed end-to-end journey passes with no `PYTHONPATH`/editable/sibling
imports, negative controls fail closed, evidence receipts are written against
the exact tuple, affected changes are committed and pushed without force, every
remote ref is verified, and omitted local material is reported.
