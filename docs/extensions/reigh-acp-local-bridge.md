# Reigh local Astrid ACP bridge

The Reigh ACP bridge is a user-machine process. It keeps only ephemeral
connection handles in memory; OMP remains the authority for profiles, opaque
session IDs, and session storage. The browser never receives the bearer token
or starts a child process.

In one terminal, start the bridge with explicit host-owned paths:

```sh
export ASTRID_BRIDGE_TOKEN='use-the-same-local-token-as-vite'
ASTRID_ACP_CWD="$PWD" \
ASTRID_ACP_PROFILE=astrid \
ASTRID_ACP_SESSION_DIR="$PWD/.reigh-acp-sessions" \
npm run dev:astrid-acp
```

In a second terminal, start Reigh and point the ACP proxy at its separate
loopback port:

```sh
export ASTRID_BRIDGE_TOKEN='use-the-same-local-token-as-vite'
VITE_ASTRID_ACP_BRIDGE_PORT=17335 npm run dev
```

The existing `/api/astrid` REST routes remain on the Astrid bridge port. ACP
requests use `/api/astrid/acp`, which the Vite proxy forwards to the local ACP
bridge with the existing bearer boundary and protocol header. The browser
controls create, resume, cancel, close, and reconnect sessions, but do not
persist connection or session IDs. Reconnect while the host is live reuses the
same ACP process and opaque session authority; it does not create a second
session registry.

The installed OMP build currently does not make sessions stored under a custom
--session-dir discoverable to a newly spawned ACP process. A page-reload or
host-restart resume therefore remains an explicit runtime limitation and is
surfaced as an error rather than being emulated in Reigh.

## Canonical Runtime editor entry

The editor's canonical local data path is the existing authenticated Runtime
proxy, not the legacy Astrid REST timeline route. Start Reigh with
`VITE_WORKSPACE_RUNTIME_URL` and `WORKSPACE_RUNTIME_TOKEN_FILE`, then open:

`/tools/video-editor?runtime=1&runtimeProject=<Runtime project_id>&runtimeTimeline=<timeline_id>`

For disposable Runtime setup, use the generated client's atomic
`createTimelineDocument` operation with the chosen project and timeline IDs.
Do not create the same timeline first with `createTimeline`; the Runtime
contract treats `createTimelineDocument` as the create-timeline-plus-document
operation and returns `409 timeline already exists` for a pre-created shell.
The ACP controls are available alongside this Runtime editor entry; their
connection and opaque session IDs remain tab-local.
