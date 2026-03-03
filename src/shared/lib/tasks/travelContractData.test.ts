import { describe, it, expect } from 'vitest';
import { readTravelContractData, readTravelStructureVideoFromGuidance } from './travelContractData';
import type { TaskPayloadSnapshot } from './taskPayloadSnapshot';

function buildSnapshot(overrides: Partial<TaskPayloadSnapshot> = {}): TaskPayloadSnapshot {
  return {
    rawParams: {},
    taskViewContract: {},
    orchestrationContract: {},
    familyContract: {},
    orchestratorDetails: {},
    fullOrchestratorPayload: {},
    individualSegmentParams: {},
    ...overrides,
  };
}

describe('travelContractData', () => {
  it('prefers contract sources over legacy sources when reading travel data', () => {
    const snapshot = buildSnapshot({
      taskViewContract: {
        prompt: 'contract prompt',
        model_name: 'qwen-image',
        input_images: ['contract-a.png', 'contract-b.png'],
        structure_guidance: { videos: [{ url: 'contract.mp4' }] },
        amount_of_motion: 0.4,
      },
      orchestratorDetails: {
        prompt: 'legacy prompt',
        model_name: 'legacy-model',
        input_images: ['legacy-a.png'],
      },
    });

    const result = readTravelContractData(snapshot);

    expect(result.prompt).toBe('contract prompt');
    expect(result.modelName).toBe('qwen-image');
    expect(result.inputImages).toEqual(['contract-a.png', 'contract-b.png']);
    expect(result.structureGuidance).toEqual({ videos: [{ url: 'contract.mp4' }] });
    expect(result.amountOfMotion).toBe(0.4);
  });

  it('uses legacy fallback fields when contract fields are unavailable', () => {
    const snapshot = buildSnapshot({
      rawParams: {
        input_image_paths_resolved: ['legacy-fallback-a.png'],
        base_prompt: 'legacy base prompt',
        parsed_resolution_wh: '1280x720',
      },
      orchestratorDetails: {
        negative_prompt: 'legacy negative',
      },
    });

    const result = readTravelContractData(snapshot);

    expect(result.inputImages).toEqual(['legacy-fallback-a.png']);
    expect(result.prompt).toBe('legacy base prompt');
    expect(result.resolution).toBe('1280x720');
    expect(result.negativePrompt).toBe('legacy negative');
  });

  it('reads first structure guidance video as record when present', () => {
    expect(readTravelStructureVideoFromGuidance(undefined)).toBeUndefined();
    expect(readTravelStructureVideoFromGuidance({ videos: [] })).toBeUndefined();
    expect(readTravelStructureVideoFromGuidance({ videos: ['bad-shape'] })).toBeUndefined();
    expect(
      readTravelStructureVideoFromGuidance({
        videos: [{ video_path: '/path/video.mp4', treatment: 'clip' }],
      }),
    ).toEqual({ video_path: '/path/video.mp4', treatment: 'clip' });
  });
});
