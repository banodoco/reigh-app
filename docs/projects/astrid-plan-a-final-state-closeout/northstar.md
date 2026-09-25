# North Star — one clean Astrid local foundation

A person installs one compatible Astrid composition, runs one canonical Astrid
setup path, and gets one selected workspace owned by Runtime. Astrid presents
setup, status, diagnostics, projects, tasks, runs, auth, and agent commands;
`astrid-local` is the lower-level operator surface. The old Banodoco Local names
remain only as explicit compatibility aliases during migration.

Runtime is the sole authority for workspace identity, lifecycle, credentials,
tasks, attempts, fencing, settlement, and outputs. Astrid orchestrates and
presents. The external Worker is one neutral supervisor that launches one
Astrid GenericPackHost. Observation never starts or repairs services.
Diagnostics describe observed facts and uncertainty truthfully.

The end state is proven by a composed installed test using the actual current
producer/consumer boundaries and a deterministic fake engine. No GPU, RunPod,
provider, model-quality, or hosted-app validation is part of this handover.

Keep the implementation small: reuse the existing Runtime, queue, generated
clients, GenericPackHost, worker supervisor, setup kernel, diagnostics, and
artifact harness. Do not create a second queue, catalog, credential authority,
diagnostics framework, or compatibility router. Do not rename internal Python
packages or the `workspace.v1` protocol merely for branding.
