import type { PublicAstridProviderBinding } from '../../publicAstridExample.tsx';

export type LightStudyProviderBinding = PublicAstridProviderBinding;

/** Replaced only from an actual create + readback receipt. */
export const LIGHT_STUDY_PROVIDER_BINDING: LightStudyProviderBinding = Object.freeze({
  state: 'unbound',
  provider: null,
  projectId: null,
  projectSlug: null,
  timelineId: null,
  timelineVersion: null,
  readbackReceiptSha256: null,
});
