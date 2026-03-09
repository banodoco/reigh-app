// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatTravelModelName,
  resolveTravelPresetName,
  useVideoTravelTaskData,
} from './useVideoTravelTaskData';

const mocks = vi.hoisted(() => ({
  parseTaskParams: vi.fn(),
  deriveInputImages: vi.fn(),
  derivePrompt: vi.fn(),
  pickFirstStructureGuidance: vi.fn(),
  buildTaskPayloadSnapshot: vi.fn(),
  readTravelContractData: vi.fn(),
  readTravelStructureVideoFromGuidance: vi.fn(),
}));

vi.mock('@/shared/lib/taskParamsUtils', () => ({
  parseTaskParams: (...args: unknown[]) => mocks.parseTaskParams(...args),
  deriveInputImages: (...args: unknown[]) => mocks.deriveInputImages(...args),
  derivePrompt: (...args: unknown[]) => mocks.derivePrompt(...args),
}));

vi.mock('@/shared/lib/tasks/structureGuidance', () => ({
  pickFirstStructureGuidance: (...args: unknown[]) =>
    mocks.pickFirstStructureGuidance(...args),
}));

vi.mock('@/shared/lib/tasks/taskPayloadSnapshot', () => ({
  buildTaskPayloadSnapshot: (...args: unknown[]) =>
    mocks.buildTaskPayloadSnapshot(...args),
}));

vi.mock('@/shared/lib/tasks/travelContractData', () => ({
  readTravelContractData: (...args: unknown[]) =>
    mocks.readTravelContractData(...args),
  readTravelStructureVideoFromGuidance: (...args: unknown[]) =>
    mocks.readTravelStructureVideoFromGuidance(...args),
}));

describe('useVideoTravelTaskData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers task-view travel contract data for panel details', () => {
    const taskParams = {
      task_view_contract: {
        input_images: ['contract-a.png', 'contract-b.png'],
        prompt: 'contract prompt',
        enhanced_prompt: 'enhanced contract prompt',
        negative_prompt: 'contract negative',
        model_name: 'wan_2_2_i2v_lightning_baseline_2_2_1',
        resolution: '1280x720',
        selected_phase_preset_id: 'db-preset-1',
        advanced_mode: true,
        phase_config: {
          phases: [
            { phase: 1, guidance_scale: 7, loras: [] },
            { phase: 2, guidance_scale: 9, loras: [] },
          ],
          steps_per_phase: [12, 13],
        },
        additional_loras: {
          'https://cdn.example.com/loras/painterly.safetensors': 0.7,
        },
        structure_guidance: {
          target: 'structure',
          strength: 0.42,
          videos: [{ path: 'https://cdn.example.com/guide.mp4', treatment: 'clip' }],
        },
        segment_frames_expanded: [16],
      },
    };
    mocks.parseTaskParams.mockReturnValue(taskParams);
    mocks.buildTaskPayloadSnapshot.mockReturnValue({
      rawParams: {},
      orchestratorDetails: {},
      individualSegmentParams: {},
    });
    mocks.readTravelContractData.mockReturnValue(taskParams.task_view_contract);
    mocks.deriveInputImages.mockReturnValue(['derived.png']);
    mocks.derivePrompt.mockReturnValue('derived prompt');
    mocks.pickFirstStructureGuidance.mockImplementation(
      (...candidates: unknown[]) => candidates.find(Boolean),
    );
    mocks.readTravelStructureVideoFromGuidance.mockReturnValue(
      taskParams.task_view_contract.structure_guidance.videos[0],
    );

    const { result } = renderHook(() =>
      useVideoTravelTaskData({
        taskParams,
        inputImages: ['fallback.png'],
        variant: 'panel',
      }),
    );

    expect(result.current.effectiveInputImages).toEqual(['contract-a.png', 'contract-b.png']);
    expect(result.current.prompt).toBe('contract prompt');
    expect(result.current.enhancePrompt).toBe('enhanced contract prompt');
    expect(result.current.negativePrompt).toBe('contract negative');
    expect(result.current.isAdvancedMode).toBe(true);
    expect(result.current.showPhaseContentInRightColumn).toBe(true);
    expect(result.current.phaseStepsDisplay).toBe('12 -> 13 (25 total)');
    expect(result.current.videoPath).toBe('https://cdn.example.com/guide.mp4');
    expect(result.current.videoTreatment).toBe('clip');
    expect(result.current.motionStrength).toBe(0.42);
    expect(result.current.presetId).toBe('db-preset-1');
    expect(result.current.isDbPreset).toBe(true);
    expect(result.current.modelName).toBe('wan_2_2_i2v_lightning_baseline_2_2_1');
    expect(result.current.resolution).toBe('1280x720');
    expect(result.current.frames).toBe(16);
  });

  it('falls back to segment-specific params for segment task details', () => {
    const taskParams = {
      segment_index: 0,
      individual_segment_params: {
        input_image_paths_resolved: ['segment-start.png', 'segment-end.png'],
        motion_mode: 'basic',
        num_frames: 24,
        negative_prompt: 'segment negative',
      },
      orchestrator_details: {
        enhance_prompt: 'orchestrator enhancement',
        parsed_resolution_wh: '960x540',
      },
      structure_guidance: {
        strength: 0.33,
        videos: [{ path: 'legacy-guide.mp4', treatment: 'adjust' }],
      },
    };
    mocks.parseTaskParams.mockReturnValue(taskParams);
    mocks.buildTaskPayloadSnapshot.mockReturnValue({
      rawParams: taskParams,
      orchestratorDetails: taskParams.orchestrator_details,
      individualSegmentParams: taskParams.individual_segment_params,
    });
    mocks.readTravelContractData.mockReturnValue({});
    mocks.deriveInputImages.mockReturnValue(['segment-start.png', 'segment-end.png']);
    mocks.derivePrompt.mockReturnValue('derived prompt');
    mocks.pickFirstStructureGuidance.mockImplementation(
      (...candidates: unknown[]) => candidates.find(Boolean),
    );
    mocks.readTravelStructureVideoFromGuidance.mockReturnValue(
      taskParams.structure_guidance.videos[0],
    );

    const { result } = renderHook(() =>
      useVideoTravelTaskData({
        taskParams,
        inputImages: ['fallback.png'],
        variant: 'hover',
      }),
    );

    expect(result.current.isSegmentTask).toBe(true);
    expect(result.current.effectiveInputImages).toEqual(['segment-start.png', 'segment-end.png']);
    expect(result.current.isAdvancedMode).toBe(false);
    expect(result.current.enhancePrompt).toBe('orchestrator enhancement');
    expect(result.current.negativePrompt).toBe('segment negative');
    expect(result.current.frames).toBe(24);
    expect(result.current.resolution).toBe('960x540');
  });

  it('formats model names and resolves preset names consistently', () => {
    expect(formatTravelModelName('wan_2_2_i2v_lightning_baseline_2_2_1')).toBe(
      'Wan 2.2 I2V Lightning (2.2.1)',
    );
    expect(resolveTravelPresetName('__builtin_default_i2v__', null)).toBe('Basic');
    expect(resolveTravelPresetName('db-preset-1', 'Studio preset')).toBe('Studio preset');
    expect(resolveTravelPresetName(undefined, 'ignored')).toBeNull();
  });
});
