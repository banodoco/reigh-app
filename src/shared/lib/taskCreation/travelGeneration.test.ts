import { describe, expect, it } from 'vitest';
import {
  createTravelGenerationTask,
  TRAVEL_GENERATION_CAPABILITY_ID,
  TRAVEL_GENERATION_UNSUPPORTED_REASON,
} from './travelGeneration';

describe('canonical travel generation admission seam', () => {
  it('fails closed until Runtime publishes the lossless travel capability', async () => {
    await expect(createTravelGenerationTask({
      project: 'project-1',
      capability_id: TRAVEL_GENERATION_CAPABILITY_ID,
      capability_digest: `sha256:${'a'.repeat(64)}`,
      schema_version: '1',
      input_object_ids: [],
      spec: { family: TRAVEL_GENERATION_CAPABILITY_ID, params: {}, output_policy: {} },
      storage_estimate: { scratch_bytes: 1, output_bytes: 1 },
      settlement_effect: {},
    })).rejects.toThrow(
      `Astrid capability ${TRAVEL_GENERATION_CAPABILITY_ID} is unsupported until its executor is repaired: ${TRAVEL_GENERATION_UNSUPPORTED_REASON}`,
    );
  });
});
