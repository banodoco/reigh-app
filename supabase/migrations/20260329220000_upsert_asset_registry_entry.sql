create or replace function public.upsert_asset_registry_entry(
  p_timeline_id uuid,
  p_asset_id text,
  p_entry jsonb
)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.timelines
  set
    asset_registry = jsonb_set(
      coalesce(asset_registry, '{"assets": {}}'::jsonb),
      array['assets', p_asset_id],
      p_entry,
      true
    ),
    updated_at = timezone('utc', now())
  where timelines.id = p_timeline_id;
$$;

grant execute on function public.upsert_asset_registry_entry(uuid, text, jsonb) to authenticated;
grant execute on function public.upsert_asset_registry_entry(uuid, text, jsonb) to service_role;
