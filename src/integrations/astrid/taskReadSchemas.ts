import { z } from 'zod';
import {
  runtimePageSchema,
  runtimeSha256IdSchema,
  runtimeTaskResourceSchema,
} from '@/tools/video-editor/data/bridgeContract.ts';

// Historical task GET capability_digest values used bare lowercase SHA-256 hex.
// Normalize only that spelling at the read boundary; writes and mutation
// responses continue to require the canonical Runtime identity schema.
const taskReadSha256IdSchema = z.union([
  runtimeSha256IdSchema.length(71),
  z.string().length(64).regex(/^[0-9a-f]{64}$/).transform((hex) => `sha256:${hex}`),
]);

export const runtimeTaskReadResourceSchema = runtimeTaskResourceSchema.extend({
  capability_digest: taskReadSha256IdSchema,
});

export const runtimeTaskReadPageSchema = runtimePageSchema(runtimeTaskReadResourceSchema);
