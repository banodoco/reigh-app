/**
 * Compatibility metadata for the one generated Runtime client.
 *
 * Runtime remains the wire/schema authority. The C1/C2 values identify the
 * app contract inputs consumed by this seam; they do not create another wire
 * contract or client.
 */

export const RUNTIME_PROTOCOL = 'workspace.v1' as const;
export const RUNTIME_SCHEMA_DIGEST = 'sha256:0fbdd963346d4ec18fcd79f17d3933bcb65f4a5131d1efef94c2d8a0c8b12369' as const;
export const RUNTIME_COMPONENT_MANIFEST_SHA256 = 'sha256:7bf3998ea268bc15b2d93397a8c20c627ada8293e07d375cc1c72d515fffe203' as const;
export const RUNTIME_TARGETED_EXECUTION_CAPABILITY = 'execution_binding.targeted.v1' as const;

export const ASTRID_C1_CANONICAL_DIGEST = 'sha256:658c18bbdeb4f950806dc05ef265c0ffab422cbfd5ce17293fec6145e2f72515' as const;
export const ASTRID_C2_CANONICAL_DIGEST = 'sha256:ca251dfbcadc6fbc68a5404495f2f0fd42128c821ce47a3560d2952399278d37' as const;
