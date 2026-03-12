import { describe, expect, it } from 'vitest';
import {
  TASK_FAMILY_CONTRACT_VERSION,
  buildIndividualSegmentFamilyContract,
  buildJoinClipsFamilyContract,
  buildTravelBetweenImagesFamilyContract,
} from '../taskFamilyContracts';

describe('taskFamilyContracts', () => {
  it('builds join-clips family contract payloads', () => {
    const contract = buildJoinClipsFamilyContract({
      mode: 'multi_clip_join',
      runId: 'run-1',
      clipUrls: ['a.mp4', 'b.mp4'],
      overridesCount: 2,
      hasAudio: true,
    });

    expect(contract).toEqual({
      contract_version: TASK_FAMILY_CONTRACT_VERSION,
      mode: 'multi_clip_join',
      run_id: 'run-1',
      clips: ['a.mp4', 'b.mp4'],
      overrides_count: 2,
      has_audio: true,
    });
  });

  it('builds individual-segment family contracts', () => {
    const contract = buildIndividualSegmentFamilyContract({
      segmentRegenerationMode: 'segment_regen_from_pair',
      generationRouting: 'variant_child',
      segmentIndex: 4,
      hasEndImage: true,
      hasPairShotGenerationId: true,
    });

    expect(contract).toEqual({
      contract_version: TASK_FAMILY_CONTRACT_VERSION,
      segment_regen_mode: 'segment_regen_from_pair',
      generation_routing: 'variant_child',
      segment_index: 4,
      has_end_image: true,
      has_pair_shot_generation_id: true,
    });
  });

  it('only includes read_contract for travel contracts when provided', () => {
    const withoutReadContract = buildTravelBetweenImagesFamilyContract({
      segmentRegenerationMode: 'segment_regen_from_order',
      imageCount: 3,
      segmentCount: 2,
      hasPairIds: false,
    });
    expect(withoutReadContract.read_contract).toBeUndefined();

    const withReadContract = buildTravelBetweenImagesFamilyContract({
      segmentRegenerationMode: 'segment_regen_from_order',
      imageCount: 3,
      segmentCount: 2,
      hasPairIds: false,
      readContract: {
        contract_version: TASK_FAMILY_CONTRACT_VERSION,
        prompt: 'test prompt',
      },
    });
    expect(withReadContract.read_contract).toEqual({
      contract_version: TASK_FAMILY_CONTRACT_VERSION,
      prompt: 'test prompt',
    });
  });
});
