import { describe, it, expect } from 'vitest';
import {
  buildTravelStructureSource,
  readResolvedTravelStructure,
  readTravelContractData,
} from './travelContractData';
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

  it('builds one shared structure source from contract and legacy payload paths', () => {
    const snapshot = buildSnapshot({
      taskViewContract: {
        structure_guidance: {
          target: 'uni3c',
          strength: 0.7,
          step_window: [0.2, 0.6],
          videos: [{ path: '/contract-guide.mp4', treatment: 'clip' }],
        },
      },
      rawParams: {
        structure_video_path: '/legacy-guide.mp4',
      },
    });

    expect(buildTravelStructureSource(snapshot)).toEqual({
      structure_guidance: {
        target: 'uni3c',
        strength: 0.7,
        step_window: [0.2, 0.6],
        videos: [{ path: '/contract-guide.mp4', treatment: 'clip' }],
      },
      structure_videos: [{ path: '/contract-guide.mp4', treatment: 'clip' }],
      structure_video_path: '/legacy-guide.mp4',
    });
  });

  it('resolves canonical structure state and primary video from one payload reader', () => {
    const snapshot = buildSnapshot({
      rawParams: {
        structure_video_path: '/legacy-guide.mp4',
        structure_video_treatment: 'adjust',
        structure_video_motion_strength: 0.8,
        structure_type: 'depth',
      },
    });

    expect(readResolvedTravelStructure(snapshot)).toEqual({
      present: true,
      structureGuidance: {
        target: 'vace',
        videos: [{
          path: '/legacy-guide.mp4',
          start_frame: 0,
          end_frame: 0,
          treatment: 'adjust',
        }],
        strength: 0.8,
        preprocessing: 'depth',
      },
      structureVideos: [{
        path: '/legacy-guide.mp4',
        start_frame: 0,
        end_frame: 0,
        treatment: 'adjust',
        metadata: null,
        resource_id: null,
      }],
      primaryStructureVideo: {
        path: '/legacy-guide.mp4',
        metadata: null,
        treatment: 'adjust',
        motionStrength: 0.8,
        structureType: 'depth',
        uni3cEndPercent: 0.1,
      },
    });
  });
});
