# Source state, pull URLs, and publication destinations

## Pullable published baseline

These are the exact published `main` refs inspected for this handover. Clone
the public repositories, then verify the SHA before implementation.

| Role | Repository | Public clone/push URL | Branch | Baseline SHA |
|---|---|---|---|---|
| App consumer | `reigh-app` | `https://github.com/banodoco/reigh-app.git` | `main` | `5a5bb8fe19baa68c7d85c24e5a8e7101ec93338d` |
| Product/orchestrator | `Astrid` | `https://github.com/peteromallet/Astrid.git` | `main` | `06dee36fbfa9d134a57b50536c045231e541b11e` |
| Runtime authority | `banodoco-workspace-runtime` | `https://github.com/banodoco/banodoco-workspace-runtime.git` | `main` | `04fee311ceb9ade57b05c739e880e7d25818ed56` |
| External Worker | `reigh-worker` | `https://github.com/banodoco/reigh-worker.git` | `main` | `9eeed609a9387dd329d6e12d1bb410bc37a5c7d2` |

The configured Astrid remote currently accepts pushes at the URL above and
reports a GitHub repository move to `https://github.com/peteromallet/Astrid-agent.git`.
Use the configured `origin` URL unless GitHub has completed the move, then use
the canonical destination reported by the remote and record the change.

## No-overwrite checkout

From a fresh workspace, use distinct directories and fail if any already exists:

```sh
git clone https://github.com/banodoco/reigh-app.git reigh-app
git clone https://github.com/peteromallet/Astrid.git Astrid
git clone https://github.com/banodoco/banodoco-workspace-runtime.git banodoco-workspace-runtime
git clone https://github.com/banodoco/reigh-worker.git reigh-worker

git -C reigh-app checkout 5a5bb8fe19baa68c7d85c24e5a8e7101ec93338d
git -C Astrid checkout 06dee36fbfa9d134a57b50536c045231e541b11e
git -C banodoco-workspace-runtime checkout 04fee311ceb9ade57b05c739e880e7d25818ed56
git -C reigh-worker checkout 9eeed609a9387dd329d6e12d1bb410bc37a5c7d2
```

For delivery, create repository-local worktrees or branches from these refs;
never overwrite an existing checkout and never use GitHub-only `main` as a
replacement for a newer local source snapshot.

## Handover branch and push targets

The portable package is hosted by `reigh-app` on this branch:

```text
handover/astrid-plan-a-final-state-closeout
```

Its base is `reigh-app` `main` at the SHA above. The handover branch is pushed
to `https://github.com/banodoco/reigh-app.git`.

Implementation branches should be created and pushed to the corresponding
`origin` in the table above. Use non-force pushes and verify with:

```sh
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/<branch>)"
```

The requested finish is publication of the validated implementation branches.
Do not silently merge them into `main`; a merge/PR is a separate authorization.

## Dirty-state boundary

The published SHAs are the pullable baseline. The local source checkouts also
contain uncommitted material that is not present on GitHub and is not silently
made authoritative by this handover:

- `reigh-app`: clean at the pinned baseline.
- `reigh-worker`: clean at the pinned baseline.
- `banodoco-workspace-runtime`: only local `.otto`, build, egg-info, and
  `.DS_Store` material was observed; none is handover source.
- `Astrid`: tracked timeline/rendering/SDK/evaluation edits and untracked
  timeline tests, outputs, RunPod/job metadata, locks, and caches remain in the
  local checkout. The published SHA is the portable baseline; those files need
  an explicit source review and separate commit before they can be included.

The receiving agent must not claim to have pulled those uncommitted files from
GitHub. If any are required for this closeout, first classify them as in-scope
source, historical evidence, or local artifact, then commit only the reviewed
source/evidence to the appropriate repository.

## Historical evidence boundary

The previous Megado run recorded Plan A's earlier non-GPU landing and
publication. Its local `.otto` evidence is not copied wholesale here because it
contains machine paths, custody snapshots, raw receipts, and local artifacts.
Use the current source refs and produce fresh final-state receipts from this
handover's exact tuple.
