# Copy/paste delivery message

You are receiving the `astrid-plan-a-final-state-closeout` Megado project.

Pull these public repositories at the exact refs recorded in
`source-state.md`:

- `https://github.com/banodoco/reigh-app.git` — app consumer
- `https://github.com/peteromallet/Astrid.git` — Astrid product/orchestrator
- `https://github.com/banodoco/banodoco-workspace-runtime.git` — Runtime authority
- `https://github.com/banodoco/reigh-worker.git` — external Worker

The baseline SHAs are in `source-state.md`; verify them before work. Use
repository-local worktrees or branches. Do not overwrite existing checkouts,
use a sibling checkout as an implicit dependency, or assume local uncommitted
material is present on GitHub.

Execute `plan.md` and `tasklist.md` in order. The target is a clean, composable
Plan A end state: one Astrid command namespace, one Runtime workspace authority,
one neutral Worker path, truthful observer/diagnostic behavior, aligned app and
Runtime contracts, and a clean installed no-GPU end-to-end journey.

The composed test harness is mandatory. It must connect actual current producer
outputs to actual consumer parsers across CLI dispatch, workspace/provenance,
Runtime/Worker ABI, app contract, observer semantics, diagnostics, aliases, and
Worker process ownership. Add deliberate negative controls; repository-local
green tests alone are insufficient.

Keep `reigh-worker` for now. Deprecate only direct legacy task/DB/engine paths
and duplicate launcher spellings. Full Worker repository retirement is a later
migration, not this Plan A closeout.

No GPU, RunPod, provider, model-quality, hosted-app, PWA, or Discord-hosted-login
work is authorized by this handover.

When complete:

1. Run all affected source, cross-repository, and installed tests.
2. Write the evidence receipts listed in `plan.md`.
3. Commit reviewed changes on implementation branches.
4. Push each implementation branch to its corresponding public `origin` with
   no force push.
5. Verify each remote branch resolves to the pushed commit.
6. Report pushed SHAs, test/evidence results, omitted local artifacts, and
   unresolved risks.

Pushing to GitHub is required at the end of the delivery sequence. Merging into
`main` or deploying is not implied; obtain separate authorization for that.
