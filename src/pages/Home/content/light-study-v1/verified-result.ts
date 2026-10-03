import type { PublicAstridVerifiedResult } from '../../publicAstridExample.tsx';

export type LightStudyVerifiedResult = PublicAstridVerifiedResult;

/** Remains unavailable until the normal provider export and artifact checks pass. */
export const LIGHT_STUDY_VERIFIED_RESULT: LightStudyVerifiedResult = Object.freeze({
  state: 'unavailable',
  exportSource: null,
  target: null,
  taskId: null,
  outputObjectId: null,
  outputFilename: null,
  outputSha256: null,
  durationSeconds: null,
  frameCount: null,
  verificationReceiptSha256: null,
});
