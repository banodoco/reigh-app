/**
 * Compatibility metadata for the one generated Runtime client.
 *
 * Runtime remains the wire/schema authority. The C1/C2 values identify the
 * app contract inputs consumed by this seam; they do not create another wire
 * contract or client.
 */

import { PROTOCOL, SCHEMA_DIGEST, COMPONENT_MANIFEST_SHA256 } from './generated-contract-metadata.ts';

export const RUNTIME_PROTOCOL = PROTOCOL;
export const RUNTIME_SCHEMA_DIGEST = SCHEMA_DIGEST;
export const RUNTIME_LEGACY_SCHEMA_DIGEST = 'sha256:510b40ce55d488347001656014cd07e19c35d1a9e1f810dfc8f5c9fd1a26eae0' as const;
// The local Astrid runtime may be ahead of the frozen consumer contract with
// additive timeline-inspection/view and worker-authority operations. Reigh's
// current Runtime client does not call those additions, so this newer digest
// remains compatible with the operations consumed here.
export const RUNTIME_ADDITIVE_COMPAT_SCHEMA_DIGEST = 'sha256:5da488052a7a281a4ce9c9336e19cdf0bf840ed211d244dd101e8326cb9d4f00' as const;
export const RUNTIME_ACCEPTED_SCHEMA_DIGESTS = [
  RUNTIME_SCHEMA_DIGEST,
  RUNTIME_LEGACY_SCHEMA_DIGEST,
  RUNTIME_ADDITIVE_COMPAT_SCHEMA_DIGEST,
] as const;
export const RUNTIME_COMPONENT_MANIFEST_SHA256 = COMPONENT_MANIFEST_SHA256;
export const RUNTIME_TARGETED_EXECUTION_CAPABILITY = 'execution_binding.targeted.v1' as const;

export const ASTRID_C1_CANONICAL_DIGEST = 'sha256:658c18bbdeb4f950806dc05ef265c0ffab422cbfd5ce17293fec6145e2f72515' as const;
export const ASTRID_C2_CANONICAL_DIGEST = 'sha256:ca251dfbcadc6fbc68a5404495f2f0fd42128c821ce47a3560d2952399278d37' as const;
