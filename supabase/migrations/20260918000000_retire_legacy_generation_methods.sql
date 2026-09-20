-- Retire the removed Reigh-Worker/local-generation preference.
--
-- Reigh generation is now admitted through Astrid's cloud capability route.
-- The task claim/count functions intentionally default to cloud-enabled when
-- this key is absent, so removing it also prevents an old local preference
-- from blocking newly-created Astrid tasks.

UPDATE public.users
SET settings = jsonb_set(
  settings,
  '{ui}',
  COALESCE(settings->'ui', '{}'::jsonb) - 'generationMethods',
  true
)
WHERE settings ? 'ui'
  AND settings->'ui' ? 'generationMethods';
