# Editor efficiency and deploy post-mortem (Oct 2026)

**Purpose:** record what the Oct 2026 efficiency waves changed, how to re-measure, what was deliberately skipped, and why production deploys were red for weeks.
**Source of truth:** code paths cited per row; measurement in `scripts/perf/measure-editor.mjs`; deploy in `Dockerfile`.
**Status:** all waves below are on `main` (deploy fix at `2f6c730ef`). Measured 15-16 Oct 2026.

## Results

Same harness, the film's real timeline (286 clips, 35 audio objects), warm dev builds, 60 s idle after load. Main `c9863082b` vs wave 1+2 integration.

| Metric (per min, idle) | Before | After | Change |
|---|---|---|---|
| Requests | 3,247 | 720 | -78% |
| Bytes | 135 MB | 16.6 MB | -88% |
| Renderer CPU | 13.1 s | 4.7 s | -64% |
| JS heap | 136 MB | 116 MB | -15% |

Cold load in dev did not change (~22 s median both, ~2,150 unbundled `/src` modules). The built app is the fix for the load floor, not more dev tuning.

## Re-measuring

| Step | Command / note |
|---|---|
| Run | `npm run perf:editor -- <editor-url> out.json` (`scripts/perf/measure-editor.mjs`; needs `ASTRID_WORKSPACE_DISCOVERY`, a running App and Runtime) |
| Compare | `scripts/perf/compare-editor-measure.mjs` |
| Method | 3 timing runs and 3 separate memory runs; HTTP cache on; no tracing in timing runs; heap/RSS only in memory runs |
| Read-only | every non-GET to the Runtime origin is blocked except `POST …/v1/handshake` and `POST …/v1/timelines/<id>/inspect`, which the editor needs to load. Blocked calls are listed in the result's `blocked`. Do not widen the allowlist: it is what makes running against a real film safe |
| Compare like with like | dev vs dev, built vs built. Machine load swings results badly: record `uptime` (load 30+ gave 0.46x playback on the same build that did 0.998x at load 5) |
| Always include | playback ranges around 50-80 s and 95-130 s; severe failures only appeared there |

Test agents must write only to a sandbox project, never the timeline someone is viewing.

## What changed and why

| ID | Change | Why / where |
|---|---|---|
| L1 | Projection keeps asset resolution and clip text | Plates were stretched and text edits did not reach the preview. Fixture: 1536x1024 plate in a 16:9 composition (1920x1080 hides it) |
| L2 | No service worker in dev | It cached ~2,180 modules (60 MB) and slowed reloads |
| L3 | Dev launcher and verifier use `vendor/astrid-browser` | `vendor/astrid-build-inputs` was stale (see deploy section) |
| L4 | Gallery variants hydrate once; refresh only when `updated_at` changes | ~60 sequential `GET /v1/generations/<id>/variants?limit=200` per load. Caveat: star / viewed / thumbnail changes do not bump `updated_at`; the open grid still sees them via its own poll |
| L5 | Chat session idle poll 15 s | "Idle" = no active turn; send switches to the 500 ms cadence immediately (`useAgentSession.ts`) |
| L6 | Thumbnail Map identity; one final-video sweep with backoff | Runtime mode: `useFinalVideoAvailable.ts` resolves a succeeded render once, concurrency 4. "No output yet" is retried, never cached |
| L7 | Audio analysis only for timelines with audio-reactive effects | ~270 MB less renderer footprint. Heap stays flat after audio warming |
| S1 | Composition reused while the head is unchanged | |
| S2 | `renderRequest` memoised | |
| S4 | VO gain above 1 via Remotion Web Audio | +2 dB VO played at 1.0 before; effective gain now 1.2589 |
| T1 | One task-list poller, 60 s idle | Runtime and Astrid task lists were 90 MB/min |
| T2 | Shared head check; inspect `{limit:1}` | 6.8 KB vs 228 KB per check |
| T3 | Immutable shot/internal revision caches | |
| T4 | Project chat poll 15 s idle | |
| T5 | Shell no longer re-renders on the playhead | Was 802 shell renders for 373 ruler moves |
| M1 | `PreviewAudio` remounts when gain crosses 1.0 (`AudioTrack.tsx` key includes `amplify`) | Lowering a VO from +2 dB to 0 dB left a disconnected Web Audio source: silent until reload |
| M2 | With analysis off, warm audio URLs into the HTTP cache after load (low priority, bounded concurrency, body discarded) | L7 removed the incidental prefetch. Under load playback ran 0.46-0.91x with 8-10 s VO stalls; now 100% cache hits, rate ~0.998 |
| S1' | Head-check dedupe window 1 s | External edits visible in 0.9-2.5 s (was 7-10 s: two pollers, one served the other a 6 s cached head) |
| S2' | In-flight dedupe of revision reads | No measurable effect (repeats are sequential across load passes). Harmless; root cause still open |

## Deliberately not done

| Item | Decision | Reason |
|---|---|---|
| S3: sequence windowing (one active-window selector per visual track, `TimelineRenderer.tsx` ~1320) | Dropped | Inactive Remotion wrappers cost ~25% of playback CPU, but windowing has the highest regression risk (premount, transition boundaries, overlaps, backward seeks), and untraced playback already reaches 0.99x. Fewer wrapper renders alone is no owner-visible gain. Reopen only for persistent measured playback CPU or responsiveness problems |
| Lazy-loading unrelated tools in `routes.tsx` | Not done | Safari hydration regression risk; built app removes the problem |
| New snapshot-ownership architecture | Not done | Reusing unchanged revisions and trimming task payloads separately was enough |

## Remaining items

| Item | Notes |
|---|---|
| Dev-module load floor | ~2,150 `/src` requests. Use the built app |
| Renderer consolidation | App vendors `timeline-composition` 0.0.2; Astrid renders with 0.0.6. Fidelity gaps (fades, fonts, VO gain) were patched individually |
| L7 and opaque dynamic effects | Unconfirmed whether decoded audio is wrongly dropped for films with opaque dynamic effects. Verify with one genuinely audio-reactive composition |
| 3x sequential revision reads at load | Shot revision, history pages and parent revision are each read ~3x in separate load passes that do not share the immutable cache |
| ~0.6 s scrub lag at drag start | First frame after mouse-down; also on main |
| Legacy bridge sweep | `useFinalVideoAvailable.ts` (~line 391) still does `Promise.all(client.tasks.get)` over every render task when not in Runtime mode |
| Variant fan-out | No batched variants endpoint; `useProjectGenerations.ts` issues one list per generation |

## Deploy post-mortem: Railway production red from at least 25 Sep to 16 Oct 2026

No failure was ever surfaced to anyone. The fixes unmasked each other, so each was only visible after the previous one.

| # | Bug | Fix (`Dockerfile`) |
|---|---|---|
| 1 | Stale `ASTRID_CHECKOUT` env pointed the build at `vendor/astrid-build-inputs`, so `vendor/astrid-browser` refreshes never shipped; build died on missing `tools/catalog.json` | Env removed; Vite falls back to `vendor/astrid-browser` (`config/vite/astridSource.ts`) |
| 2 | `node:20.19.4` bundles npm 10.8.2; `npm ci` crashes on the lockfile: `Cannot read properties of null (reading 'edgesOut')` | `npm install -g npm@11.21.1` before `npm ci` |
| 3 | `postinstall` runs `scripts/patches/remotion-*.mjs`, which were not copied before `npm ci` | `COPY scripts/patches` ahead of the install |
| 4 | Runtime stage hand-picked two `src` files, but `vite preview` loads `vite.config.ts`, which imports `src/integrations/runtime/client` and needs `vendor/astrid-browser`. Preview died, healthcheck failed | Runtime stage copies `src/` and `vendor/` |

Deploy succeeded 11:16Z 16 Oct (`2f6c730ef`).

**Reading the GitHub commit status.** Time from "pending" to "failure" locates the stage. Observed: ~30 s, 1m47, ~12 min. The short ones failed in the install/build steps (bugs 1-3); ~12 min means the build passed and the healthcheck timed out (bug 4). Exact pairing of the two short times to bugs is inferred.

**Verify locally before pushing Docker changes:** `npm run verify:docker-local` (`scripts/build/verify-docker-image-locally.sh`; port from `VERIFY_PORT`, default 2261; `KEEP=1` keeps the workdir). See the script header for steps; the point is to hit all four failures above before Railway does.

**Follow-ups:** alert on failed Railway deploys; collapse the three vendored Astrid copies (`astrid-browser`, `astrid-build-inputs/primary`, `astrid-build-inputs/public`), which dev, local build and Docker each used differently.

## Running the built editor locally (UNVERIFIED recipe)

Recovered from session notes, never run end to end (the sandbox blocked the build). The launcher flags exist (`scripts/dev-local-workspace.mjs`, `scripts/dev-local-workspace-options.mjs`); `dev:local -- --check` worked.

```sh
export NODE_OPTIONS=--max-old-space-size=4096        # build OOMs at the default heap on an 8 GB Mac
export ASTRID_CHECKOUT=<astrid checkout> ASTRID_PYTHON=<astrid venv python>
export ASTRID_WORKSPACE_DISCOVERY=<runtime discovery.json>
npm run dev:local -- --build                         # emits dist/
PORT=2241 npm run dev:local -- --preview --preview-dir "$PWD/dist"   # absolute path required
```

### Sharing a local editor through the paired relay (UNVERIFIED)

Two halves; the hosted half holds no Runtime credential.

| Half | What it does |
|---|---|
| Build | `npm run build -- --outDir <share-dist>` with `VITE_ASTRID_WORKSPACE_V1=1`, `VITE_WORKSPACE_RUNTIME_URL`, `VITE_WORKSPACE_RUNTIME_EXPECTED_{ACTOR,REALM,INSTANCE}_ID` baked in from the live discovery file |
| Hosted | `ASTRID_APP_PAIRED_RELAY_ORIGIN=<https tunnel url> __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=<tunnel host> npm run preview -- --host 127.0.0.1 --port 2223 --strictPort --outDir <share-dist>`; tunnel points at 2223 |
| User-local | `ASTRID_APP_PAIRED_RELAY_ORIGIN=<same> ASTRID_APP_PAIRED_PRODUCT_ACTOR=... ASTRID_APP_PAIRED_REALM_ID=... ASTRID_PRODUCT_TOKEN_FILE=... ASTRID_APP_PAIRED_CONNECTOR_STATE=... npm run dev:local -- --paired --reset-pairing` (connector dials out to the relay) |

## Smells (App-relevant)

| Smell | Status at HEAD | Action |
|---|---|---|
| Contract copy `src/integrations/runtime/generated.ts` is hand-synced with Runtime and Astrid's vendored client; no cross-repo gate. A Runtime digest change left Astrid's pin stale | Open | One gate that compares digests across the three repos |
| Paired relay route table (`config/vite/pairedRoutePolicy.ts`) is a hand-kept allowlist; new Runtime routes 404 in paired mode | Documents routes added in `f53e239cb`; nothing ties the table to the OpenAPI | Conformance test from the OpenAPI |
| New write methods used `withSession` instead of restart-fenced `withMutation` (`src/integrations/runtime/client.ts`) | Document writes now use `withMutation`; classification is still per-method by hand | Fence by HTTP method or a generated table |
| Validation written twice: `data/typed/projectTranscript.ts` allows 100k segments, 1024-char ids, empty text; Runtime allows 10k segments, 256-byte ids, non-empty text (`service.py` `TRANSCRIPT_*`) | Open | Derive limits from the contract schema |
| `@astrid/*` imports resolve against a pinned vendor; nothing checks they exist until vitest fails | Open | Resolve-check in the vendor verifier |
| Shared `node_modules` symlinks `@banodoco/timeline-*` to `../../vendor/...` of another checkout (`package.json` `file:vendor/...`) | Open (worktree-only risk) | Per-worktree install, or assert resolved paths |
| `dev:local` defaults to port 2222 with strictPort; two sessions silently served each other's App/stack | Open | Per-stack port; build/stack banner in the UI |
| Local stack dies with the launching session; Runtime port changes each restart | Open | Supervised stacks |
| Test copies of a realm silently diverge from the source realm | Open | Show "copy, N revisions behind" |
| "Project not available" shown during load | Not reproducible: shown only after the projects query resolves (`VideoEditorPage.tsx` ~1650); not seen in ~10 loads |  |
| Editor mount gated on discovery with `retry:false` | Fixed: the editor mounts from the URL; discovery retries 3x (`useRuntimeEditorDiscovery.ts`) |  |
| Preview drops music fades; Astrid fonts missing | Fixed: `AudioTrack.tsx` `getAudioFade`; `LocalFontFaces.tsx` |  |
| Media objects served `no-store` though sha256-addressed | Fixed in the App proxies (`config/vite/objectCachePolicy.mjs`, also `pairedRelay.ts`, `scripts/runtime-discovery-proxy.mjs`); the Runtime still sends `no-store` |  |
| A proxy failure latches "Audio unavailable" in the frame | Now a notice (`PreviewAudioFailureNotice.tsx`); after 3 retries the clip stays `gave-up` until `canplay` or the user's Retry |  |
| App typecheck had 36 errors; build OOMs at default Node heap | Not re-checked | Re-run `tsc` on main |
| `astrid-public-host.tsx` `@astrid-public/...` import: late dependency discovery, one reload after server start | Not re-checked | |
| Failed deploys unseen (see post-mortem) | Fixed; no alerting yet | Alert |

## Security note

The product URL is `https://astrid.haus`; the former domain reference was removed after it changed ownership.
