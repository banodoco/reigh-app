# Source and Output tracks

Use **Source** for material you need beside the edit but do not want in the
exported video. Use **Output** for anything the video should show or play.
The choice applies to every item on a track.

| Material | Choose | Why |
| --- | --- | --- |
| A full interview kept beside a selected excerpt | Source for the interview; Output for the excerpt | Keep the reference available without exporting its full duration. |
| A storyboard, timing guide, or alternate take kept for editing | Source | It helps the editor but is not part of this export. |
| Temporary narration that the viewer should hear in a review | Output | Draft material can be intentionally included in a video. |
| Scratch narration kept only as a timing reference | Source | It must not enter the exported audio mix. |
| A before/after comparison shown to the viewer | Output for both versions | Both references are part of the intended video. |
| Selected pictures, titles, captions, music, or sound effects | Output | They belong in the result. |

Choose by export intent. Names such as “Source footage” or “Draft VO” do not
change behavior. Generated media, unapproved material, and original camera
footage can all be Output. Do not automatically change roles from labels or
filenames. When intent is ambiguous, preserve the existing export behavior
while establishing which material the viewer should receive.

## Change a track's use

Open **Track settings** and set **Use** to **Output** or **Source**. The
setting applies to all items on that track. Source tracks show a **Source**
badge and remain visible and editable in the timeline.

The player previews Output. A visible Source lane does not contribute its
picture or audio to the player or browser export. Unmuting a Source track does
not include it in Output. Use existing media inspection to inspect a reference;
there is no source-audition mode or automatic guide compositing.

To include a selected source item, move or copy it onto an Output track. To
exclude one item without changing its neighbors, put it on a separate Source
track. Changing the original track's use would affect every item on it. These
are ordinary edits with the existing save and undo behavior.

## Stored role and defaults

Track `kind` is still `visual` or `audio`. The independent `role` is `output`
or `source`; an audio Source track is valid. Omitting `role` means Output,
including in older documents. An explicit unknown value is invalid and must
be corrected, not treated as Output.

This fragment describes tracks, not a complete renderable timeline:

```json
{
  "tracks": [
    {"id": "picture", "kind": "visual", "label": "Picture", "role": "output"},
    {"id": "reference", "kind": "visual", "label": "Interview reference", "role": "source"},
    {"id": "review-vo", "kind": "audio", "label": "Draft narration", "role": "output"}
  ]
}
```

Role belongs to the track in its owning timeline document. Do not put it on a
clip, a shot reference, a media object, or an `app.role` extension field.
Source excludes material from output; it does not delete or archive the media,
change approval state, or restrict access to it.

“Source media,” source trim offsets, source provenance, and typed input rows
retain their existing meanings. None of those terms sets a Source track role.

## Timing and nested shots

A Source track's media does not extend automatic Output content duration.
For example, a ten-second Output excerpt and a ninety-second Source interview
have ten seconds of Output media extent. The editor can still display and
edit the long reference.

Keep content extent distinct from an explicitly placed shot window or an
admitted render-only tail. Excluding source media does not itself authorize
rippling later shots, shortening an explicit slot, or removing a declared
tail. Inspect those timing declarations separately when changing the length of
the finished video.

Within supported nested-shot structures, apply each document's own track
roles before combining its content with its parent:

- An Output parent occurrence with an Output child picture and a Source child
  guide includes the picture and excludes the guide.
- A Source parent occurrence excludes the whole occurrence. An Output role
  inside its child cannot override that decision.
- An Output parent does not turn Source child tracks into Output. Track IDs
  reused in different documents do not establish shared roles.

This does not add arbitrary-depth timeline nesting. A child with no Output
content has no media-derived Output extent; inspect any retained explicit
parent slot rather than assuming it was removed. A source-only root has no
Output content to export. Its visible editor lanes are not evidence of a
renderable result.

## Examples for an edit

**Interview reference.** Keep the full interview on `reference` with
`role: "source"`, and put the chosen ten-second excerpt on `picture` with
`role: "output"`. Scrubbing the Output player shows the selected edit. The
reference remains an authored item and can be used for a later selection.

**Review voiceover.** Keep narration that must be heard in the review on
`review-vo` with `role: "output"`. Put a timing-only alternative on a separate
Source audio track. A track named “Draft VO” with no role is still Output;
do not silently exclude it because its words or performance are temporary.

**Shot with a guide.** Keep a supported parent shot occurrence on an Output
track. In the child's own timeline, use Output for its picture and Source for
its storyboard guide. Moving the parent occurrence to a Source track excludes
both; moving it back to Output restores the child-local picture/guide choice.

## Agent edits and detached checkouts

Inspect the selected timeline and track identity before editing. For a nested
track, identify its owning child document as well as its track ID. Do not
choose a track by a label match alone or infer its role from mute/volume.

Use the existing [TimelinePatch operations](timeline-patch-operations.md) for
Reigh edits. A role-only update uses merge semantics so unrelated settings are
preserved:

```json
{
  "op": "track.update",
  "target": "reference",
  "payload": {"role": "source", "mode": "merge"}
}
```

This is one operation within an ordinary versioned patch, not a standalone
endpoint or a bypass around validation and persistence. Review the diff for
the lane-wide consequence before applying it. A replacement update that omits
role restores the default Output behavior along with resetting other omitted
mutable fields.

When using Astrid's detached authoring checkout, use the installed
`timeline_editing` skill's checkout/check/publication recipe for that runtime.
Change the exact track's `role` in its owning parent or internal timeline;
preserve unrelated fields, checkout baselines, and dependency identities.
Validate the complete candidate, inspect its diff, and publish once against
the captured head. Do not edit Runtime storage or invent a new role endpoint.
If the connected schema or renderer does not support role, report the
unsupported operation instead of disguising it as metadata. This Reigh guide
does not change the separate Astrid skill or guarantee an installed version.

Shared-child edits need the same scope care as any other child edit. Keep
immutable revision pins intact and use the publication's dependency manifest
to explain what changed; do not imply that all historical parent revisions
automatically changed.

## Output evidence and compatibility

The editor's lane view describes authored content. The Output player and
browser export describe output contribution. A successful save establishes
neither rendered pixels nor audible output. Check the selected output when
the request requires rendering or playback evidence; ordinary role edits do
not require a new preview render.

Astrid input visualization is a placement inspection, and composed
visualization inspects an existing matching render. Freezing candidate JSON
does not render pixels. A review export adds names, timecodes, or script
captions to an output render; it is not source audition. Review decorations
must follow output eligibility so source-only shot names and narration do not
re-enter the video as overlay text.

Use Source exclusion for a managed export only when that consumer explicitly
accepts the role contract. A correct browser preview does not prove that a
separate Runtime or worker understands the field. An incompatible managed
render must fail clearly; retrying through a consumer that ignores role can
include excluded material. Keep browser evidence and managed-render evidence
distinct when reporting completion.

## Implementation references

[`trackRole` and `projectOutputTimelineConfig`](../../src/tools/video-editor/data/timelineOutputProjection.ts)
own legacy defaults, invalid-role rejection, and the non-mutating browser
projection. The [projection fixtures](../../src/tools/video-editor/data/timelineOutputProjection.test.ts)
cover a ninety-second reference beside a ten-second cut, local track identity,
and invalid roles. The [canonical shot fixtures](../../src/tools/video-editor/data/shotCompositionProjection.test.ts)
cover filtering child tracks before merging their content into the parent.
These structural fixtures do not substitute for audiovisual export evidence.
