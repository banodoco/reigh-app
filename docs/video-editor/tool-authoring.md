# Authoring on the admitted Video Editor Tool

This guide covers the real editor host contract in the E1 Tool extraction. It
uses the existing `/tools/video-editor` page, browser provider, scoped host
services, and editor extension runtime. It does not define a generic Tool or
Widget SDK.

## Keep the three declarations distinct

The Astrid V3 `ui.video-editor` declaration is `type: tool`; it selects the
existing Reigh host entry `video-editor`. The host launch boundary admits that
catalog-bound Tool at `/tools/video-editor`. This declaration does not contain
the editor page or create a route.

Editor-only code is declared separately as `type: editor`. For example,
Astrid's `rendering` pack declares `live-scenes` as an editor contribution and
the generated editor-extension catalog includes editor declarations while the
Tool catalog includes Tool declarations. Existing effect, animation,
transition, overlay, panel, inspector, and command surfaces continue to use
their current Reigh runtime and contribution IDs when other top-level Tools
are hidden. A declaration is not proof that an arbitrary capability family is
implemented; check the existing SDK surface and capability diagnostics.
The only V3 catalog-bound Tool admitted by this extraction is the Video
Editor. E1-03 keeps the older Tool entries in the runtime manifest while
hiding them from the initial Tools UI and redirecting their direct routes;
their source and backend capabilities were not deleted. A proposed different
V3 Tool without a real host entry and launch mapping remains design-only.

## Use the typed instance contract

The browser entrypoints in [`browser.ts`](../../src/tools/video-editor/browser.ts)
and [`browser-provider.ts`](../../src/tools/video-editor/browser-provider.ts)
export `BrowserVideoEditorProvider`, the editor hooks,
`VideoEditorInstanceScope`, `VideoEditorScopedServices`, and
`VIDEO_EDITOR_SCOPED_SERVICES_CONTRACT` (`reigh.video-editor.scoped-services.v1`).
`useVideoEditorHost()` returns the captured scope. These exports form a Video
Editor contract, not a portable host interface.

`BrowserVideoEditorProviderProps.hostServices` remains optional for legacy
standalone and read-only callers. The admitted Tool supplies it. Its required
fields are the contract ID; a scope with `instanceId`, `projectId`, optional
`projectSlug`, and `timelineId`; and the `shots`, `mediaLightbox`, `agentChat`,
`toast`, and `telemetry` ports. `timelineServices` is optional and keeps the
existing media/asset services when omitted. The surrounding provider still
uses its existing `dataProvider`, `assetResolver`, `exporter`, `hostContext`,
and save-status callback seams; these are not fields invented for a universal
Tool API. Credentials and canonical save/media/render authority stay with the
host.

Capture the supplied scope in callbacks and commands. Do not resolve the
ambient selected project later from a handler; a captured callback must keep
using the editor instance that created it. Instance identity changes remount
the current provider and release only its owned subscriptions and caches.
E1-04's owner-checked agent registration lease releases only its own instance.
Host caches, task records, and project data remain host-owned. Generic
extension disposal must release registrations and listeners, never delete
project data; deletion belongs to an explicit user action.

## One real slot, command, and cleanup path

The [scene-phase-markers extension](../../src/tools/video-editor/dev/scene-phase-markers/extension.ts)
is a real, development-local authoring example. Its manifest declares the
`statusBar` slot as `scene-markers-footer` with renderer ID
`scene-phase-markers/footer`, plus a `timelineOverlay`. It declares the
semantic command `com.reigh.scene-phase-markers.markPhase`; activation binds
that ID with `ctx.commands.registerCommand()` and registers both renderers
through `ctx.ui.registerRenderer()`.

The command reads the owning context's playhead and timeline snapshot, then
uses `ctx.creative.timeline.apply()` with the public `project-data.write`
operation. The context captures its editor authority; it does not read global
project selection. Activation keeps each returned command/renderer handle and
the returned `DisposeHandle` disposes those handles. Its explicit
“Clear/Delete Data” action writes an empty value; generic disposal does not
clear markers. This is the cleanup pattern to follow for commands, renderers,
and owner-scoped registrations.

## Source, catalog, build, and reopen

Use the Astrid checkout that contains the intended source. Regenerate the
catalog for the source family you changed, then check it:

```sh
python3 scripts/gen_tool_catalog.py
python3 scripts/gen_tool_catalog.py --check
python3 scripts/gen_editor_extension_catalog.py
python3 scripts/gen_editor_extension_catalog.py --check
```

Run the applicable generator when its declaration or source changed; the
commands above show the actual Tool and editor-extension catalog paths. Then
from Reigh, select that same Astrid checkout and build:

```sh
ASTRID_CHECKOUT=/path/to/matching/Astrid \
ASTRID_PUBLIC_CHECKOUT=/path/to/pinned/astrid-browser npm run build
```

The generated Tool catalog binds the manifest, JSON host entry, declared
resources, dependencies, compatibility, and release digest. Reigh's Vite
configuration validates those source bytes during build/test setup, and the
launch boundary validates catalog identity again. The pinned
`vendor/astrid-browser` fallback lacks the selected V3 Tool catalog and is
not a replacement for the matching source checkout. Do not edit the generated
catalog by hand. A stale digest or wrong source selection is a failed
candidate: keep it closed, restore the intended source or regenerate from the
intended source, run `--check`, rebuild, and only then open it.

For the deterministic editor preview, run `npm run dev:editor` from Reigh
with the same `ASTRID_CHECKOUT` environment. Open the printed existing
`/tools/video-editor` URL. This dev launcher uses an in-memory demo project and
enables the development timeline-overlay canary; that does not enable a
production query override. The production host remains a statically built
Reigh application, with no runtime installer or arbitrary module loader.

For an editor UI change, repeat the whole loop after the requested source
edit: regenerate/check the affected Astrid catalog when pack bytes changed,
build Reigh against that same source, activate the existing editor page, and
reopen it to confirm the changed UI. If the change is Reigh-host code, the
Astrid catalog will not bind those host bytes; record the Reigh source revision
and file hash alongside the selected Astrid catalog/release identity.

## Other Tool examples are design-only

An imagined `ui.<another-tool>` declaration, host service shape, or route is
design-only until there is a public host entry, generated catalog binding,
launch mapping, and implemented lifecycle in Reigh. The current extraction
does not provide generic forms, schemas, queries, widgets, a browser IDE, or
an arbitrary installer. Extend the existing Video Editor contract only when
the concrete editor behavior requires it; do not document a sketch as an
available API.
