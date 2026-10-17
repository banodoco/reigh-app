# Local project gallery acceptance

`npm run test:acceptance:local-project` runs the original single-project journey
(the `ASTRID_APP_LOCAL_PROJECT`, `ASTRID_APP_LOCAL_TIMELINE`, `ASTRID_APP_EXPECTED_SHOTS`, and
`ASTRID_APP_EXPECTED_GENERATIONS` overrides are still supported).

The matrix runner exercises the same journey for every configured row and
requires at least three rows:

```sh
ASTRID_APP_LOCAL_PROJECT_MATRIX='[
  {"project":"desert-plant-growth","timeline":"01KYPVKMW5STB4W6FE05ED8242"},
  {"project":"project-b","timeline":"timeline-b"},
  {"project":"project-c","timeline":"timeline-c"}
]' npm run test:acceptance:local-project:matrix
```

For a compact configuration, use
`project:timeline[:expectedShots[:expectedGenerations]],...` instead. Expected
counts are optional; the authoritative counts always come from the loopback
Astrid bridge. The runner reads generation list/detail and timeline
`config.pinnedShotGroups`/`registry` data, and performs no writes.

Each row verifies:

- gallery generation IDs and counts against bridge data;
- a representative lightbox's variant count against generation detail;
- shot overview names and visual clip scope against `pinnedShotGroups`;
- deep-link refresh, browser back, and focused-shot clip isolation; and
- no Supabase traffic, page errors, console errors, HTTP failures, or failed
  network requests (apart from the bounded capability sentinel probes).

Screenshots and the JSON summary are written below
`ASTRID_APP_ACCEPTANCE_EVIDENCE` (or `/tmp/astrid-local-project-<pid>`).
