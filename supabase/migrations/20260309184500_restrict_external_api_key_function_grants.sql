BEGIN;

REVOKE ALL ON FUNCTION public.save_external_api_key(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_external_api_key(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_external_api_key_decrypted(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_external_api_key_decrypted(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.get_external_api_key_decrypted(UUID, TEXT) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.save_external_api_key(TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_external_api_key(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_external_api_key_decrypted(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.get_external_api_key_decrypted(UUID, TEXT)
  IS 'Service-role-only helper for edge functions to read decrypted external API keys.';

COMMIT;
