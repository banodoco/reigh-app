import { unsupportedCapabilityError } from './legacyBoundary';
import type { BaseTaskParams } from './types';

/**
 * Canonical capability reserved for the travel/join producer cutover.
 *
 * Runtime does not publish this capability yet. Keeping the identifier and
 * typed admission envelope here gives the producers one future seam without
 * inventing a legacy task family or silently reviving retired orchestration.
 */
export const TRAVEL_GENERATION_CAPABILITY_ID = 'generation.generate_travel_video';

export const TRAVEL_GENERATION_UNSUPPORTED_REASON =
  'Runtime has not published a lossless ordered-image-pair, continuation, and lineage contract';

export type TravelGenerationAdmissionRequest = Omit<BaseTaskParams, 'capability_id'> & {
  capability_id: typeof TRAVEL_GENERATION_CAPABILITY_ID;
};

export function travelGenerationUnsupportedError() {
  return unsupportedCapabilityError(
    TRAVEL_GENERATION_CAPABILITY_ID,
    TRAVEL_GENERATION_UNSUPPORTED_REASON,
  );
}

/**
 * Keep the canonical travel admission boundary explicit while its executor
 * contract is still unproven. This must fail before CAS ingest or UI
 * orchestration side effects; the eventual implementation will call
 * `createTask` only after Runtime publishes this exact capability.
 */
export async function createTravelGenerationTask(
  _request: TravelGenerationAdmissionRequest,
): Promise<never> {
  throw travelGenerationUnsupportedError();
}
