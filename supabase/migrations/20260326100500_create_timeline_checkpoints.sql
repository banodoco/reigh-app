create table if not exists public.timeline_checkpoints (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  config jsonb not null,
  trigger_type text not null check (trigger_type in ('session_boundary', 'edit_distance', 'semantic', 'manual')),
  label text not null,
  edits_since_last_checkpoint integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists timeline_checkpoints_timeline_id_created_at_idx
  on public.timeline_checkpoints (timeline_id, created_at desc);

alter table public.timeline_checkpoints enable row level security;

drop policy if exists "Users can view own timeline checkpoints" on public.timeline_checkpoints;
create policy "Users can view own timeline checkpoints"
  on public.timeline_checkpoints
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own timeline checkpoints" on public.timeline_checkpoints;
create policy "Users can insert own timeline checkpoints"
  on public.timeline_checkpoints
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own timeline checkpoints" on public.timeline_checkpoints;
create policy "Users can update own timeline checkpoints"
  on public.timeline_checkpoints
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own timeline checkpoints" on public.timeline_checkpoints;
create policy "Users can delete own timeline checkpoints"
  on public.timeline_checkpoints
  for delete
  using (auth.uid() = user_id);
