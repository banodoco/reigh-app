/**
 * @deprecated Use `@/shared/services/externalApiKeys/hooks/useHuggingFaceToken`.
 * Compatibility shim retained while feature callers migrate to the service package.
 */
import { getDeprecationPolicy } from '@/shared/lib/governance/deprecationPolicy';
import { signalPastRemovalTargetUsage } from '@/shared/lib/governance/deprecationEnforcement';

const externalApiKeysHookPolicy = getDeprecationPolicy('external_api_keys_hook_alias');
export const EXTERNAL_API_KEYS_HOOK_ALIAS_OWNER = externalApiKeysHookPolicy.owner;
export const EXTERNAL_API_KEYS_HOOK_ALIAS_REMOVE_BY = externalApiKeysHookPolicy.removeBy;

signalPastRemovalTargetUsage({
  alias: 'shared/hooks/useExternalApiKeys',
  policy: externalApiKeysHookPolicy,
  remediation: 'Import useHuggingFaceToken from shared/services/externalApiKeys/hooks/useHuggingFaceToken.',
});

export { useHuggingFaceToken } from '@/shared/services/externalApiKeys/hooks/useHuggingFaceToken';
