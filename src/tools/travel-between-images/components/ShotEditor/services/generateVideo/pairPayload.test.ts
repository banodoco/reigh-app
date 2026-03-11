import { describe, expect, it } from 'vitest';
import {
  buildBatchPairConfig,
  buildByPairConfig,
  buildImagePayload,
  buildTimelinePairConfig,
  extractPairOverrides,
  filterImageShotGenerations,
} from './pairPayload';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { ShotGenRow } from './types';

function makePhaseConfig(overrides: Partial<PhaseConfig> = {}): PhaseConfig {
  return {
    num_phases: 2,
    steps_per_phase: [3, 3],
    flow_shift: 5,
    sample_solver: 'euler',
    model_switch_phase: 1,
    phases: [],
    ...overrides,
  };
}

function makeShotGenRow(overrides: Partial<ShotGenRow> = {}): ShotGenRow {
  return {
    id: 'sg-1',
    generation_id: 'gen-1',
    timeline_frame: 0,
    metadata: null,
    generation: {
      id: 'gen-1',
      location: 'https://example.com/img-1.png',
      type: 'image',
      primary_variant_id: 'variant-1',
    },
    ...overrides,
  };
}

describe('pairPayload', () => {
  it('extracts sparse overrides and filters only positioned image generations with valid locations', () => {
    expect(extractPairOverrides(null)).toEqual({
      overrides: {},
      enhancedPrompt: undefined,
    });

    const rows = [
      makeShotGenRow(),
      makeShotGenRow({
        id: 'sg-video',
        generation_id: 'gen-video',
        generation: {
          id: 'gen-video',
          location: 'https://example.com/video.mp4',
          type: 'video',
        },
      }),
      makeShotGenRow({
        id: 'sg-placeholder',
        generation_id: 'gen-placeholder',
        generation: {
          id: 'gen-placeholder',
          location: '/placeholder.svg',
          type: 'image',
        },
      }),
      makeShotGenRow({
        id: 'sg-unpositioned',
        generation_id: 'gen-unpositioned',
        timeline_frame: null,
      }),
    ];

    expect(filterImageShotGenerations(rows)).toEqual([rows[0]]);
    expect(buildImagePayload(rows)).toEqual({
      absoluteImageUrls: ['https://example.com/img-1.png'],
      imageGenerationIds: ['gen-1'],
      imageVariantIds: ['variant-1'],
      pairShotGenerationIds: [],
    });
  });

  it('builds timeline pair config from metadata overrides and strips mode from advanced phase configs', () => {
    const advancedPhaseConfig = makePhaseConfig({ mode: 'vace' });
    const rows = [
      makeShotGenRow({
        id: 'sg-1',
        timeline_frame: 0,
        metadata: {
          enhanced_prompt: 'enhanced first pair',
          segmentOverrides: {
            prompt: 'first pair',
            negativePrompt: 'pair negative',
            numFrames: 77,
            amountOfMotion: 80,
            motionMode: 'advanced',
            phaseConfig: advancedPhaseConfig,
            loras: [{ path: '/lora-1', strength: 0.6 }],
          },
        },
      }),
      makeShotGenRow({
        id: 'sg-2',
        generation_id: 'gen-2',
        timeline_frame: 61,
        generation: {
          id: 'gen-2',
          location: 'https://example.com/img-2.png',
          type: 'image',
          primary_variant_id: 'variant-2',
        },
      }),
      makeShotGenRow({
        id: 'sg-3',
        generation_id: 'gen-3',
        timeline_frame: 122,
        generation: {
          id: 'gen-3',
          location: 'https://example.com/img-3.png',
          type: 'image',
          primary_variant_id: 'variant-3',
        },
      }),
    ];

    const result = buildTimelinePairConfig(rows, 61, 'default negative');

    expect(result.basePrompts).toEqual(['first pair', '']);
    expect(result.negativePrompts).toEqual(['pair negative', 'default negative']);
    expect(result.segmentFrames).toEqual([77, 61]);
    expect(result.enhancedPromptsArray).toEqual(['enhanced first pair', '']);
    expect(result.pairPhaseConfigsArray).toEqual([
      {
        ...advancedPhaseConfig,
        mode: undefined,
      },
      null,
    ]);
    expect(result.pairLorasArray).toEqual([[{ path: '/lora-1', strength: 0.6 }], null]);
    expect(result.pairMotionSettingsArray).toEqual([
      {
        amount_of_motion: 0.8,
        motion_mode: 'advanced',
      },
      null,
    ]);
  });

  it('builds simple batch and by-pair defaults when no explicit overrides exist', () => {
    expect(buildBatchPairConfig(['one', 'two', 'three'], 81, 'neg')).toEqual({
      basePrompts: ['', ''],
      negativePrompts: ['neg', 'neg'],
      segmentFrames: [81, 81],
      frameOverlap: [10, 10],
      pairPhaseConfigsArray: [null, null],
      pairLorasArray: [null, null],
      pairMotionSettingsArray: [null, null],
      enhancedPromptsArray: ['', ''],
    });

    const result = buildByPairConfig(
      [
        makeShotGenRow(),
        makeShotGenRow({
          id: 'sg-2',
          generation_id: 'gen-2',
          timeline_frame: 90,
          metadata: {
            segmentOverrides: {
              prompt: 'pair prompt',
              motionMode: 'basic',
              phaseConfig: makePhaseConfig({ mode: 'i2v' }),
            },
          },
          generation: {
            id: 'gen-2',
            location: 'https://example.com/img-2.png',
            type: 'image',
          },
        }),
      ],
      61,
      'neg',
    );

    expect(result.basePrompts).toEqual(['']);
    expect(result.segmentFrames).toEqual([61]);
    expect(result.frameOverlap).toEqual([10]);
    expect(result.negativePrompts).toEqual(['neg']);
    expect(result.pairPhaseConfigsArray).toEqual([null]);
    expect(result.pairMotionSettingsArray).toEqual([null]);
  });
});
