# Remotion 4.0.503 audio resume fulfillment fence

This Node-built-in patch is pinned to `remotion@4.0.503`. It changes only:

- `node_modules/remotion/dist/cjs/audio/shared-audio-tags.js`
- `node_modules/remotion/dist/esm/index.mjs`

The owner-level change starts `waitUntilActuallyResumed` only after native
`resumePromise` fulfills. The existing `resumePromise.catch` rejection logging
and release behavior, `isResuming.current = null` in `finally`, and outer
`return resumePromise.catch(() => {})` remain unchanged. The new rejection arm
is intentionally empty because the existing catch continues to log and release.

The ESM line changes from
`waitUntilActuallyResumed(ctxAndGain.audioContext, logLevel).then(resolve);`
to
`resumePromise.then(() => waitUntilActuallyResumed(ctxAndGain.audioContext, logLevel).then(resolve), () => {});`.
The CommonJS file uses the same change with its generated
`(0, wait_until_actually_resumed_js_1.waitUntilActuallyResumed)(...)` prefix.
No player, application, media, or other Remotion file is targeted.

Full-file byte guards:

| File | Pristine SHA-256 | Patched SHA-256 |
|---|---|---|
| `dist/cjs/audio/shared-audio-tags.js` | `71bb40afee1be9a9d24fc2ca97dae78428d79270179945f3455d5ef1b68241ea` | `4fbf66aac63105d6ecd8c036b7d6db8cb0f800429be6e4a1633a0584994564c5` |
| `dist/esm/index.mjs` | `2fb803a18bd355a3b7dde45fdd0ff857acc6602ba521bf015cca27908285d872` | `447802377a5ecf17b7c224d8a209b4a3c92a29e8efb8ee679a283a48ffc0d9a2` |

The script checks the package version and both complete file contents before
any target write. Unknown version or bytes fail closed. It stages changed
files before replacement, is idempotent, and exactly reverses the one-line
change with `--revert`. `--check` is read-only and reports whether each guarded
file is pristine or patched.

Commands from the repository root:

```sh
npm run remotion:audio-resume:patch
npm run remotion:audio-resume:check
npm run remotion:audio-resume:revert
npm run test:remotion-audio-resume-patch
```

`postinstall` invokes the guarded `--apply`. No dependency or Remotion version
is added or changed. The root lockfile change is only `hasInstallScript: true`
for the new root `postinstall` metadata.

The fixture test uses Node's built-in runner and a temporary root with only
package metadata and these two target files; it does not install dependencies
or write into the shared `node_modules` tree.
