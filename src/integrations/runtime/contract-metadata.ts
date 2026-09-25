/**
 * Compatibility metadata for the one generated Runtime client.
 *
 * Runtime remains the wire/schema authority. The C1/C2 values identify the
 * app contract inputs consumed by this seam; they do not create another wire
 * contract or client.
 */

export const RUNTIME_PROTOCOL = 'workspace.v1' as const;
export const RUNTIME_SCHEMA_DIGEST = 'sha256:510b40ce55d488347001656014cd07e19c35d1a9e1f810dfc8f5c9fd1a26eae0' as const;
export const RUNTIME_COMPONENT_MANIFEST_SHA256 = 'sha256:fcae767eaba85e406658ac3b14f3c3447e11073dffcb5e1256e223bdb84f51f4' as const;
export const RUNTIME_TARGETED_EXECUTION_CAPABILITY = 'execution_binding.targeted.v1' as const;

export const ASTRID_C1_CANONICAL_DIGEST = 'sha256:658c18bbdeb4f950806dc05ef265c0ffab422cbfd5ce17293fec6145e2f72515' as const;
export const ASTRID_C2_CANONICAL_DIGEST = 'sha256:ca251dfbcadc6fbc68a5404495f2f0fd42128c821ce47a3560d2952399278d37' as const;
