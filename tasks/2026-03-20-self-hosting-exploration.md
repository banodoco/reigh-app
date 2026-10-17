# Self-Hosting Exploration

Goal: let someone clone the repos and run Astrid entirely off their own local Supabase instance, with their own GPU worker.

## Current state

- Frontend talks directly to Supabase (no intermediate server)
- `supabase/config.toml` already configured for local dev (ports, auth, storage, realtime)
- ~90 migrations in `supabase/migrations/` cover full schema
- Edge functions (32) all have `verify_jwt = false` for local
- Worker (`Astrid-Worker`) connects via `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, polls edge functions for tasks
- Worker has a CPU fallback mode (`HEADLESS_WAN2GP_FORCE_CPU=1`) but it's extremely slow

## What needs to be figured out

### 1. Environment & bootstrap

- [ ] **`.env` generation**: `supabase start` prints local URLs/keys. Need a script or docs that captures these and writes a working `.env.local`. Currently `.env` points to hosted Supabase.
- [ ] **Seed data**: `db:seed` script referenced in package.json but `db/` doesn't exist. Fresh local DB has no user, no projects. What's the minimum seed? At least: a test user in `auth.users` + a row in `public.users` + maybe a sample project.
- [ ] **Dev user auth flow**: `.env` has `DEV_USER_ID` / `VITE_DEV_USER_EMAIL` / `VITE_DEV_USER_PASSWORD`. How does this work with local Supabase auth? Does the frontend auto-login in dev mode, or does the user need to sign up through the UI?

### 2. Edge functions locally

- [ ] **Serving**: `supabase functions serve` runs all edge functions locally. Is this already part of the dev workflow or does everyone use hosted? Do all 32 functions work locally out of the box?
- [ ] **Env vars for functions**: Edge functions need `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `STRIPE_SECRET_KEY`, etc. Which are truly required vs. optional? What breaks without each?
- [ ] **`npm run dev` integration**: Currently just runs Vite. Should we add a `dev:full` that also starts `supabase functions serve` (via `concurrently` or similar)?

### 3. Worker setup

- [ ] **Worker → local Supabase**: Worker uses edge function URLs (`/functions/v1/claim-next-task`, etc.). When pointed at `http://127.0.0.1:54321`, do these all work? Any hardcoded URLs or assumptions about hosted Supabase?
- [ ] **Model downloads**: WanGP models download on-demand from HuggingFace. Is there a way to pre-download? What's the total size? Any models that require gated access / auth?
- [ ] **LoRA downloads**: LoRAs download from HuggingFace URLs. Same questions re: auth and size.
- [ ] **Docker vs bare metal**: Worker has a Dockerfile (`Wan2GP/Dockerfile`) targeting NVIDIA CUDA 12.8. What's the bare-metal setup path for someone with their own GPU? Just `pip install` + `python worker.py`?
- [ ] **Minimum GPU requirements**: Docs say RTX 3060+ (8GB VRAM). What actually works in practice? What model/resolution combos fit in 8GB vs 24GB?

### 4. Storage

- [ ] **Local storage buckets**: `supabase start` creates local storage. Do the required buckets get created by migrations, or do they need manual setup?
- [ ] **Upload URLs**: `generate-upload-url` edge function creates signed upload URLs. Do these work against local storage?
- [ ] **Worker output upload**: Worker uploads completed videos/images to Supabase Storage. Does this work against local instance? Any bucket policies or CORS issues?

### 5. External services — what's required vs. optional

| Service | Used for | Can skip? |
|---------|----------|-----------|
| **Groq** | AI prompt generation, voice transcription | Yes — prompt editing works manually |
| **OpenAI** | Fallback prompt provider | Yes |
| **Stripe** | Credits, billing, auto-topup | Yes if credits are seeded directly in DB |
| **FAL.ai** | Image generation (flux) | Unclear — is this the only image gen path? |
| **Replicate** | Magic Edit feature | Yes — optional feature |
| **HuggingFace** | Model & LoRA downloads | No — required for worker, but only needs network, not an API key (unless gated models) |

- [ ] **FAL.ai dependency**: Is fal.ai the only way to generate images, or can the local worker do it? The worker has `flux` as a task type — does that run locally on GPU or call fal.ai?
- [ ] **Credits system**: Can we bypass credits entirely for self-hosted? Or seed infinite credits? What happens if credits are 0 — does task creation fail?

### 6. Realtime & auth

- [ ] **Realtime locally**: Supabase local includes realtime. Does the frontend's realtime subscription (generation updates, task status) work against local instance without config changes?
- [ ] **Auth provider**: Local Supabase auth works with email/password. The hosted version — does it use any OAuth providers (Google, GitHub) that would need separate setup?

### 7. Documentation & DX

- [ ] **README rewrite**: Current README presumably assumes hosted Supabase. Need a "self-hosted" section or separate doc.
- [ ] **`.env.example`**: Template with every var, marked required/optional, with descriptions.
- [ ] **`scripts/setup-local.sh`**: One-command bootstrap: `supabase start` → capture keys → write `.env.local` → `supabase db push` → seed data → print "ready" message.
- [ ] **Worker setup guide**: How to point `Astrid-Worker` at your local Supabase. Minimal command to start processing tasks.

## Approach

1. **Try it ourselves first**: `supabase start`, apply migrations, point frontend at local, see what breaks. Document every friction point.
2. **Fix the critical path**: seed data, env setup, edge functions locally — get to "I can open the app and see something."
3. **Worker integration**: point worker at local Supabase, submit a task from UI, see if it flows through.
4. **Document**: write the self-hosting guide based on what we learned.
5. **Nice-to-haves**: setup script, `dev:full` command, `.env.example`.
