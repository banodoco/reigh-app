# Astrid local preview and content handoff

This candidate is part of the existing `banodoco/reigh-app` repository. It replaces the supported `/home` entry and is also served at WEB `/`. It is a local, uncommitted delivery candidate; final acceptance is still open and public deployment is separate.

## Open the local experience

Use the delivery worktree:

```sh
cd /Users/hannahomalley/Documents/Codex/astrid/.otto/worktrees/astrid-f08-v070
export PATH="/Users/hannahomalley/Documents/Codex/astrid/.otto/tools/node-v20.19.4/node-v20.19.4-darwin-arm64/bin:$PATH"
export ASTRID_CHECKOUT="/Users/hannahomalley/Documents/Codex/astrid/.otto/sources/astrid-landing-source-v1"
export ASTRID_PUBLIC_CHECKOUT="/Users/hannahomalley/Documents/Codex/astrid/.otto/sources/astrid-public-source-v3-frame-accounting"
export VITE_APP_ENV="WEB"
export VITE_DISABLE_REMOTE_FONTS="1"
npm run dev -- --host 127.0.0.1 --port 4209 --strictPort
```

This uses the run's pinned Node 20.19.4. If the dependencies are absent in a new checkout, run `npm ci --no-audit --no-fund` once before starting the server. If port 4209 is occupied, identify the existing process and choose another free port; do not stop an unknown process. The URL path and query examples below are otherwise unchanged.

Open any of these states:

| State | URL path |
|---|---|
| App / Preview | `/home?view=preview` |
| App / Understand | `/home?view=understand` |
| Agent / Preview | `/home?view=preview&experience=agent` |
| Agent / Understand | `/home?view=understand&experience=agent` |
| WEB entry | `/` (same public page, App / Preview by default) |

Use the same paths on `http://127.0.0.1:4209`. App mode keeps the editor surfaces full width and shows the Agent launcher; selecting it opens Agent mode. Understand changes the view while preserving the mounted editor. The visible clips and conversation are labelled as placeholder/scripted content.

## Replace the selected example package

Light Study is the current placeholder content. Its three local 1280×720, 30 fps silent clips (8s, 12s and 8s) form a 28-second, 840-frame sequence. This is only one example package; the site is not committed to its footage, timeline shape, poster, IDs, story or chat copy.

The timeline video and example narrative shown today are replaceable content, not the definition of the product primitives. Preview/playback, transport, timeline editing surface, inspector, result-status card and Agent conversation layout must continue to work when a new package supplies different media, clip count, duration, frame rate, IDs and script. Do not encode Light Study timing, clip IDs, footage, or story assumptions into those shared surfaces. The selected package remains one fixed example at a time; swapping it does not require adding an example picker or general content engine.

The selected package is assembled in `src/pages/Home/content/light-study-v1/public-example.ts`. The lightweight shell reads only `metadata.ts`; the editor, timeline, preview, inspector and scripted conversation receive the selected typed bundle through the lazy editor boundary. The bundle derives and checks its duration and clip count from its own canonical timeline and asset registry. Explicit silent-media facts, provider binding and verified-result/target data also belong to the selected package. Unknown media is not treated as silent, and the result remains unavailable until real verification exists.

When choosing different footage and an example, replace or add a versioned content package, then point `src/pages/Home/publicAstridExampleSelection.ts` at that package. Keep the package's files and records together:

1. Add the selected source videos and thumbnails/poster under a content-owned asset directory; record source and derivative provenance and exact hashes.
2. Set the package metadata (stable example id, title, timeline name and poster) in its `metadata.ts`.
3. Define actual asset facts in `media.ts`, canonical clip/track/output structure and registry facts in `timeline.ts`, and content-owned logical IDs in `logical-ids.ts`. Set real timing, frame rate, resolution, frame count and audio facts; do not retain Light Study values by default.
4. Write the package's `authored-script.ts` against its own logical IDs. Keep narrative and result claims true of that example.
5. Assemble its `public-example.ts` with the selected metadata, timeline, registry, script, explicit media facts, provider binding and result state. The read-only host derives the displayed summary and refuses mismatched summary or result-to-clip/asset mappings.
6. Update the corresponding C01 package and replacement handoff with source files, generated derivatives, hashes, dimensions, frame counts, audio disclosure and affected checks.

No editor primitive should need a sample-specific edit for a content replacement: the shared preview/player, transport, editable-looking read-only timeline, inspector and Agent conversation are supplied from the existing editor and package bundle. A separate 18-second, single-clip wildlife fixture exercises the same shared editor runtime and replacement contract without changing the current visual example. This seam deliberately supports one selected example. It does not create an example picker, plugin registry or general content engine.

After selecting new content, run the focused bundle/provider/result and scripted-replay contract tests and the required type check. Re-run only the visual, media and playback checks affected by the new content, comparing visuals to the four packaged screenshots; bind new evidence to the selected package's source hashes. Until the final example is chosen, the current Light Study package remains clearly placeholder content.

## Provider and result boundary

The Agent conversation contains the result status card. Once a result is genuinely verified, its deliberate handoff should open Workspace Preview and highlight the exact existing clip/asset; it must not write, insert, or autoplay anything. The current card correctly reports that the example result is unavailable. There is no real provider create/readback binding or qualified export result yet: `provider-binding.ts` must remain `unbound` until a real create-and-readback receipt supplies its provider/project/timeline identities and receipt hash, and `verified-result.ts` must remain `unavailable` until the normal provider export and artifact verification produce the task, object, filename, output hash, duration, frame count and verification receipt. Never set either state to `verified` with hand-written or guessed values.

The C01 package and original media provenance are retained under `.otto/runs/astrid-2026-09-25/evidence/C01/light-study-v1/`. A prior candidate timeline UUID in `logical-ids.ts` is provenance only; it is not a persisted provider ID. Any later provider/export work must use its separate Astra authorization and the existing qualification records.

## Current delivery limits

- This guide documents local opening and content replacement; it is not a production setup, provider/export activation, or deployment authorization.
- The Download button currently links to the repository's Releases page; no downloadable package or release was verified here.
- The current authored fixture has no audio (`provenance.ts` records `audio: 'none'`).
- Keep the four packaged visual-guide screenshots as the visual comparison reference.
- This candidate still has open accessibility, installed-app, export/result, performance and final acceptance work. Check the live `.otto/runs/astrid-2026-09-25/tasklist.md` before treating any evidence as complete.
