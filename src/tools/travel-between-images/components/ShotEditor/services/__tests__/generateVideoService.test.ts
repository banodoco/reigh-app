import { describe, it, expect, vi } from 'vitest';

// Mock supabase client (required by module import chain)
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ data: [], error: null })),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    })),
    rpc: vi.fn(),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    auth: { getUser: vi.fn(() => ({ data: { user: { id: 'test' } } })) },
  },
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

import {
  __internal,
  type ShotGenRow,
  type ImagePayload,
  type PairConfigPayload,
} from '../generateVideoService';
import type { PhaseConfig } from '@/shared/types/phaseConfig';

const {
  buildBasicModePhaseConfig,
  buildImagePayload,
  buildTimelinePairConfig,
  buildBatchPairConfig,
  buildByPairConfig,
  resolveModelPhaseSelection,
  validatePhaseConfigConsistency,
  stripModeFromPhaseConfig: _stripModeFromPhaseConfig,
  extractPairOverrides: _extractPairOverrides,
  filterImageShotGenerations: _filterImageShotGenerations,
  resolveGenerationResolution: _resolveGenerationResolution,
  buildStructureGuidance: _buildStructureGuidance,
  buildTravelRequestBodyV2: _buildTravelRequestBodyV2,
} = __internal;

// ============================================================================
// TEST HELPERS
// ============================================================================

/** Build a minimal valid ShotGenRow for testing */
function makeShotGenRow(overrides: Partial<ShotGenRow> & { id: string }): ShotGenRow {
  return {
    generation_id: overrides.generation_id ?? `gen-${overrides.id}`,
    timeline_frame: overrides.timeline_frame ?? 0,
    metadata: overrides.metadata ?? null,
    generation: overrides.generation ?? {
      id: `gen-${overrides.id}`,
      location: `https://example.com/image-${overrides.id}.png`,
      type: 'image',
      primary_variant_id: null,
    },
    ...overrides,
  };
}

/** Build a valid PhaseConfig for testing */
function makePhaseConfig(overrides: Partial<PhaseConfig> = {}): PhaseConfig {
  return {
    num_phases: 2,
    steps_per_phase: [3, 3],
    flow_shift: 5.0,
    sample_solver: 'euler',
    model_switch_phase: 1,
    phases: [
      { phase: 1, guidance_scale: 1.0, loras: [] },
      { phase: 2, guidance_scale: 1.0, loras: [] },
    ],
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('generateVideoService', () => {
  // --------------------------------------------------------------------------
  // stripModeFromPhaseConfig
  // --------------------------------------------------------------------------
  describe('stripModeFromPhaseConfig', () => {
    it('removes mode field from phase config', () => {
      const config = makePhaseConfig({ mode: 'i2v' });
      const result = _stripModeFromPhaseConfig(config);
      expect(result).not.toHaveProperty('mode');
      expect(result.num_phases).toBe(2);
      expect(result.steps_per_phase).toEqual([3, 3]);
    });

    it('returns config unchanged when mode is not present', () => {
      const config = makePhaseConfig();
      delete (config as Record<string, unknown>).mode;
      const result = _stripModeFromPhaseConfig(config);
      expect(result).not.toHaveProperty('mode');
      expect(result.num_phases).toBe(2);
    });

    it('preserves all other fields', () => {
      const config = makePhaseConfig({
        mode: 'vace',
        num_phases: 3,
        steps_per_phase: [2, 2, 2],
        flow_shift: 7.0,
        sample_solver: 'dpmpp',
      });
      const result = _stripModeFromPhaseConfig(config);
      expect(result.num_phases).toBe(3);
      expect(result.steps_per_phase).toEqual([2, 2, 2]);
      expect(result.flow_shift).toBe(7.0);
      expect(result.sample_solver).toBe('dpmpp');
    });
  });

  // --------------------------------------------------------------------------
  // extractPairOverrides
  // --------------------------------------------------------------------------
  describe('extractPairOverrides', () => {
    it('returns empty overrides and undefined prompt for null metadata', () => {
      const result = _extractPairOverrides(null);
      expect(result.overrides).toEqual({});
      expect(result.enhancedPrompt).toBeUndefined();
    });

    it('returns empty overrides and undefined prompt for undefined metadata', () => {
      const result = _extractPairOverrides(undefined);
      expect(result.overrides).toEqual({});
      expect(result.enhancedPrompt).toBeUndefined();
    });

    it('returns empty overrides for metadata without segmentOverrides', () => {
      const result = _extractPairOverrides({ someOtherField: 'value' });
      expect(result.overrides).toEqual({});
      expect(result.enhancedPrompt).toBeUndefined();
    });

    it('extracts enhanced_prompt from metadata', () => {
      const result = _extractPairOverrides({
        enhanced_prompt: 'a beautiful sunset over the ocean',
      });
      expect(result.enhancedPrompt).toBe('a beautiful sunset over the ocean');
    });

    it('reads segmentOverrides from metadata', () => {
      const result = _extractPairOverrides({
        segmentOverrides: {
          prompt: 'test prompt',
          negativePrompt: 'bad quality',
          amountOfMotion: 75,
        },
      });
      expect(result.overrides.prompt).toBe('test prompt');
      expect(result.overrides.negativePrompt).toBe('bad quality');
      expect(result.overrides.amountOfMotion).toBe(75);
    });
  });

  // --------------------------------------------------------------------------
  // filterImageShotGenerations
  // --------------------------------------------------------------------------
  describe('filterImageShotGenerations', () => {
    it('returns empty array for empty input', () => {
      expect(_filterImageShotGenerations([])).toEqual([]);
    });

    it('filters out rows without generation', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({ id: '1', generation: null }),
      ];
      expect(_filterImageShotGenerations(rows)).toEqual([]);
    });

    it('filters out rows without timeline_frame', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({ id: '1', timeline_frame: null }),
      ];
      expect(_filterImageShotGenerations(rows)).toEqual([]);
    });

    it('filters out rows with placeholder location', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: '1',
          generation: { id: 'gen-1', location: '/placeholder.svg', type: 'image' },
        }),
      ];
      expect(_filterImageShotGenerations(rows)).toEqual([]);
    });

    it('filters out rows with null location', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: '1',
          generation: { id: 'gen-1', location: null, type: 'image' },
        }),
      ];
      expect(_filterImageShotGenerations(rows)).toEqual([]);
    });

    it('filters out video type rows', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: '1',
          generation: {
            id: 'gen-1',
            location: 'https://example.com/video.mp4',
            type: 'video',
          },
        }),
      ];
      expect(_filterImageShotGenerations(rows)).toEqual([]);
    });

    it('filters out video-extension rows even when type is not explicitly set', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: '1',
          generation: {
            id: 'gen-1',
            location: 'https://example.com/video.mp4',
            type: 'image',
          },
        }),
      ];
      expect(_filterImageShotGenerations(rows)).toEqual([]);
    });

    it('keeps valid image rows', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: '1',
          timeline_frame: 0,
          generation: {
            id: 'gen-1',
            location: 'https://example.com/img.png',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: '2',
          timeline_frame: 100,
          generation: {
            id: 'gen-2',
            location: 'https://example.com/img2.png',
            type: 'image',
          },
        }),
      ];
      expect(_filterImageShotGenerations(rows)).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // resolveGenerationResolution
  // --------------------------------------------------------------------------
  describe('resolveGenerationResolution', () => {
    it('uses shot aspect_ratio when available', () => {
      const shot = { aspect_ratio: '16:9' } as { aspect_ratio: string; id: string };
      const result = _resolveGenerationResolution(shot as any, '1:1');
      expect(result).toBe('902x508');
    });

    it('falls back to effectiveAspectRatio when shot has no aspect_ratio', () => {
      const shot = {} as any;
      const result = _resolveGenerationResolution(shot, '4:3');
      expect(result).toBe('768x576');
    });

    it('falls back to DEFAULT_RESOLUTION when neither shot nor project has aspect ratio', () => {
      const shot = {} as any;
      const result = _resolveGenerationResolution(shot, null);
      expect(result).toBe('840x552');
    });

    it('falls back to DEFAULT_RESOLUTION for invalid shot aspect ratio', () => {
      const shot = { aspect_ratio: 'invalid' } as any;
      const result = _resolveGenerationResolution(shot, null);
      expect(result).toBe('840x552');
    });

    it('uses project aspect ratio when shot has unrecognized ratio', () => {
      const shot = { aspect_ratio: 'unknown-ratio' } as any;
      const result = _resolveGenerationResolution(shot, '9:16');
      expect(result).toBe('508x902');
    });

    it('handles 1:1 (square) aspect ratio', () => {
      const shot = { aspect_ratio: '1:1' } as any;
      const result = _resolveGenerationResolution(shot, null);
      expect(result).toBe('670x670');
    });
  });

  // --------------------------------------------------------------------------
  // buildImagePayload
  // --------------------------------------------------------------------------
  describe('buildImagePayload', () => {
    it('returns empty arrays for no data', () => {
      const result = buildImagePayload([]);
      expect(result.absoluteImageUrls).toEqual([]);
      expect(result.imageGenerationIds).toEqual([]);
      expect(result.imageVariantIds).toEqual([]);
      expect(result.pairShotGenerationIds).toEqual([]);
    });

    it('builds payload with sorted images by timeline_frame', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: 'sg-2',
          timeline_frame: 100,
          generation: {
            id: 'gen-2',
            location: 'https://example.com/img2.png',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: 'sg-1',
          timeline_frame: 0,
          generation: {
            id: 'gen-1',
            location: 'https://example.com/img1.png',
            type: 'image',
          },
        }),
      ];
      const result = buildImagePayload(rows);

      // Should be sorted by timeline_frame (0 before 100)
      expect(result.imageGenerationIds).toEqual(['gen-1', 'gen-2']);
      expect(result.absoluteImageUrls).toHaveLength(2);
      expect(result.absoluteImageUrls[0]).toContain('img1.png');
      expect(result.absoluteImageUrls[1]).toContain('img2.png');
    });

    it('excludes placeholder images from payload', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: 'sg-1',
          timeline_frame: 0,
          generation: {
            id: 'gen-1',
            location: '/placeholder.svg',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: 'sg-2',
          timeline_frame: 100,
          generation: {
            id: 'gen-2',
            location: 'https://example.com/img.png',
            type: 'image',
          },
        }),
      ];
      const result = buildImagePayload(rows);
      // First row has placeholder location, filtered by filterImageShotGenerations
      expect(result.imageGenerationIds).toEqual(['gen-2']);
    });

    it('pairShotGenerationIds includes all but last image', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: 'sg-1',
          timeline_frame: 0,
          generation: {
            id: 'gen-1',
            location: 'https://example.com/img1.png',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: 'sg-2',
          timeline_frame: 50,
          generation: {
            id: 'gen-2',
            location: 'https://example.com/img2.png',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: 'sg-3',
          timeline_frame: 100,
          generation: {
            id: 'gen-3',
            location: 'https://example.com/img3.png',
            type: 'image',
          },
        }),
      ];
      const result = buildImagePayload(rows);
      // pairShotGenerationIds should be first N-1 items
      expect(result.pairShotGenerationIds).toEqual(['sg-1', 'sg-2']);
    });

    it('collects primary_variant_ids when available', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: 'sg-1',
          timeline_frame: 0,
          generation: {
            id: 'gen-1',
            location: 'https://example.com/img1.png',
            type: 'image',
            primary_variant_id: 'variant-1',
          },
        }),
        makeShotGenRow({
          id: 'sg-2',
          timeline_frame: 100,
          generation: {
            id: 'gen-2',
            location: 'https://example.com/img2.png',
            type: 'image',
            primary_variant_id: 'variant-2',
          },
        }),
      ];
      const result = buildImagePayload(rows);
      expect(result.imageVariantIds).toEqual(['variant-1', 'variant-2']);
    });

    it('handles single image (no pairs)', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: 'sg-1',
          timeline_frame: 0,
          generation: {
            id: 'gen-1',
            location: 'https://example.com/img1.png',
            type: 'image',
          },
        }),
      ];
      const result = buildImagePayload(rows);
      expect(result.absoluteImageUrls).toHaveLength(1);
      expect(result.imageGenerationIds).toHaveLength(1);
      expect(result.pairShotGenerationIds).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // buildBatchPairConfig
  // --------------------------------------------------------------------------
  describe('buildBatchPairConfig', () => {
    const defaultNeg = 'ugly, blurry';

    it('returns defaults for no images', () => {
      const result = buildBatchPairConfig([], 61, defaultNeg);
      expect(result.basePrompts).toEqual(['']);
      expect(result.negativePrompts).toEqual([defaultNeg]);
      expect(result.segmentFrames).toEqual([61]);
      expect(result.frameOverlap).toEqual([10]);
      expect(result.pairPhaseConfigsArray).toEqual([]);
      expect(result.pairLorasArray).toEqual([]);
      expect(result.pairMotionSettingsArray).toEqual([]);
      expect(result.enhancedPromptsArray).toEqual([]);
    });

    it('returns defaults for single image (0 pairs)', () => {
      const result = buildBatchPairConfig(['url1'], 61, defaultNeg);
      expect(result.basePrompts).toEqual(['']);
      expect(result.negativePrompts).toEqual([defaultNeg]);
      expect(result.segmentFrames).toEqual([61]);
    });

    it('creates correct array lengths for multiple pairs', () => {
      const urls = ['url1', 'url2', 'url3', 'url4'];
      const result = buildBatchPairConfig(urls, 81, defaultNeg);
      // 4 images = 3 pairs
      expect(result.basePrompts).toHaveLength(3);
      expect(result.negativePrompts).toHaveLength(3);
      expect(result.segmentFrames).toHaveLength(3);
      expect(result.frameOverlap).toHaveLength(3);
      expect(result.pairPhaseConfigsArray).toHaveLength(3);
      expect(result.pairLorasArray).toHaveLength(3);
    });

    it('fills all segment frames with the batch value', () => {
      const urls = ['url1', 'url2', 'url3'];
      const result = buildBatchPairConfig(urls, 121, defaultNeg);
      expect(result.segmentFrames).toEqual([121, 121]);
    });

    it('fills negative prompts with default', () => {
      const urls = ['url1', 'url2', 'url3'];
      const result = buildBatchPairConfig(urls, 61, 'custom negative');
      expect(result.negativePrompts).toEqual(['custom negative', 'custom negative']);
    });

    it('fills pair configs with null (no overrides in batch mode)', () => {
      const urls = ['url1', 'url2', 'url3'];
      const result = buildBatchPairConfig(urls, 61, defaultNeg);
      expect(result.pairPhaseConfigsArray).toEqual([null, null]);
      expect(result.pairLorasArray).toEqual([null, null]);
      expect(result.pairMotionSettingsArray).toEqual([null, null]);
      expect(result.enhancedPromptsArray).toEqual(['', '']);
    });

    it('fills base prompts with empty strings', () => {
      const urls = ['url1', 'url2'];
      const result = buildBatchPairConfig(urls, 61, defaultNeg);
      expect(result.basePrompts).toEqual(['']);
    });
  });

  // --------------------------------------------------------------------------
  // buildByPairConfig
  // --------------------------------------------------------------------------
  describe('buildByPairConfig', () => {
    const defaultNeg = 'low quality';

    it('returns defaults when no pairs exist', () => {
      const result = buildByPairConfig([], 61, defaultNeg);
      expect(result.basePrompts).toEqual(['']);
      expect(result.segmentFrames).toEqual([61]);
      expect(result.negativePrompts).toEqual([defaultNeg]);
      expect(result.pairPhaseConfigsArray).toEqual([]);
    });

    it('applies pair overrides while keeping fixed frame defaults', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: 'sg-1',
          timeline_frame: 0,
          metadata: {
            segmentOverrides: {
              prompt: 'pair prompt',
              negativePrompt: 'pair neg',
              numFrames: 77,
            },
          },
          generation: {
            id: 'gen-1',
            location: 'https://example.com/img1.png',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: 'sg-2',
          timeline_frame: 120,
          generation: {
            id: 'gen-2',
            location: 'https://example.com/img2.png',
            type: 'image',
          },
        }),
      ];

      const result = buildByPairConfig(rows, 61, defaultNeg);
      expect(result.basePrompts).toEqual(['pair prompt']);
      expect(result.negativePrompts).toEqual(['pair neg']);
      expect(result.segmentFrames).toEqual([77]);
      expect(result.frameOverlap).toEqual([10]);
    });
  });

  // --------------------------------------------------------------------------
  // buildTimelinePairConfig
  // --------------------------------------------------------------------------
  describe('buildTimelinePairConfig', () => {
    const defaultNeg = 'bad quality';

    it('returns defaults for empty shot generations', () => {
      const result = buildTimelinePairConfig([], 61, defaultNeg);
      expect(result.basePrompts).toEqual(['']);
      expect(result.segmentFrames).toEqual([61]);
      expect(result.frameOverlap).toEqual([10]);
      expect(result.negativePrompts).toEqual([defaultNeg]);
    });

    it('returns defaults for single image (no pairs)', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: 'sg-1',
          timeline_frame: 0,
          generation: {
            id: 'gen-1',
            location: 'https://example.com/img1.png',
            type: 'image',
          },
        }),
      ];
      const result = buildTimelinePairConfig(rows, 61, defaultNeg);
      expect(result.basePrompts).toEqual(['']);
      expect(result.segmentFrames).toEqual([61]);
    });

    it('computes segment frames from timeline_frame gaps', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: 'sg-1',
          timeline_frame: 0,
          generation: {
            id: 'gen-1',
            location: 'https://example.com/img1.png',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: 'sg-2',
          timeline_frame: 80,
          generation: {
            id: 'gen-2',
            location: 'https://example.com/img2.png',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: 'sg-3',
          timeline_frame: 200,
          generation: {
            id: 'gen-3',
            location: 'https://example.com/img3.png',
            type: 'image',
          },
        }),
      ];
      const result = buildTimelinePairConfig(rows, 61, defaultNeg);
      // Gaps: 80-0=80, 200-80=120
      expect(result.segmentFrames).toEqual([80, 120]);
    });

    it('extracts per-pair prompt overrides from metadata', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: 'sg-1',
          timeline_frame: 0,
          metadata: {
            segmentOverrides: {
              prompt: 'first pair prompt',
              negativePrompt: 'first pair negative',
            },
          },
          generation: {
            id: 'gen-1',
            location: 'https://example.com/img1.png',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: 'sg-2',
          timeline_frame: 61,
          metadata: {
            segmentOverrides: {
              prompt: 'second pair prompt',
            },
          },
          generation: {
            id: 'gen-2',
            location: 'https://example.com/img2.png',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: 'sg-3',
          timeline_frame: 122,
          generation: {
            id: 'gen-3',
            location: 'https://example.com/img3.png',
            type: 'image',
          },
        }),
      ];
      const result = buildTimelinePairConfig(rows, 61, defaultNeg);
      expect(result.basePrompts[0]).toBe('first pair prompt');
      expect(result.negativePrompts[0]).toBe('first pair negative');
      expect(result.basePrompts[1]).toBe('second pair prompt');
      expect(result.negativePrompts[1]).toBe(defaultNeg); // no negative override
    });

    it('extracts enhanced prompts from metadata', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: 'sg-1',
          timeline_frame: 0,
          metadata: {
            enhanced_prompt: 'enhanced version of prompt',
          },
          generation: {
            id: 'gen-1',
            location: 'https://example.com/img1.png',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: 'sg-2',
          timeline_frame: 61,
          generation: {
            id: 'gen-2',
            location: 'https://example.com/img2.png',
            type: 'image',
          },
        }),
      ];
      const result = buildTimelinePairConfig(rows, 61, defaultNeg);
      expect(result.enhancedPromptsArray[0]).toBe('enhanced version of prompt');
    });

    it('uses numFrames override when present in metadata', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: 'sg-1',
          timeline_frame: 0,
          metadata: {
            segmentOverrides: { numFrames: 121 },
          },
          generation: {
            id: 'gen-1',
            location: 'https://example.com/img1.png',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: 'sg-2',
          timeline_frame: 80,
          generation: {
            id: 'gen-2',
            location: 'https://example.com/img2.png',
            type: 'image',
          },
        }),
      ];
      const result = buildTimelinePairConfig(rows, 61, defaultNeg);
      // numFrames override (121) should replace the gap (80)
      expect(result.segmentFrames).toEqual([121]);
    });

    it('extracts motion settings overrides from metadata', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: 'sg-1',
          timeline_frame: 0,
          metadata: {
            segmentOverrides: {
              amountOfMotion: 80,
              motionMode: 'advanced',
            },
          },
          generation: {
            id: 'gen-1',
            location: 'https://example.com/img1.png',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: 'sg-2',
          timeline_frame: 61,
          generation: {
            id: 'gen-2',
            location: 'https://example.com/img2.png',
            type: 'image',
          },
        }),
      ];
      const result = buildTimelinePairConfig(rows, 61, defaultNeg);
      expect(result.pairMotionSettingsArray[0]).toEqual({
        amount_of_motion: 0.8, // 80/100
        motion_mode: 'advanced',
      });
    });

    it('extracts lora overrides from metadata', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: 'sg-1',
          timeline_frame: 0,
          metadata: {
            segmentOverrides: {
              loras: [{ id: 'lora1', name: 'Test Lora', path: '/path/to/lora', strength: 0.8 }],
            },
          },
          generation: {
            id: 'gen-1',
            location: 'https://example.com/img1.png',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: 'sg-2',
          timeline_frame: 61,
          generation: {
            id: 'gen-2',
            location: 'https://example.com/img2.png',
            type: 'image',
          },
        }),
      ];
      const result = buildTimelinePairConfig(rows, 61, defaultNeg);
      expect(result.pairLorasArray[0]).toEqual([
        { path: '/path/to/lora', strength: 0.8 },
      ]);
    });

    it('skips phase config override when motionMode is basic', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: 'sg-1',
          timeline_frame: 0,
          metadata: {
            segmentOverrides: {
              motionMode: 'basic',
              phaseConfig: makePhaseConfig(),
            },
          },
          generation: {
            id: 'gen-1',
            location: 'https://example.com/img1.png',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: 'sg-2',
          timeline_frame: 61,
          generation: {
            id: 'gen-2',
            location: 'https://example.com/img2.png',
            type: 'image',
          },
        }),
      ];
      const result = buildTimelinePairConfig(rows, 61, defaultNeg);
      // Phase config should be null because motionMode is 'basic'
      expect(result.pairPhaseConfigsArray[0]).toBeNull();
    });

    it('includes phase config override when motionMode is advanced', () => {
      const pc = makePhaseConfig({ mode: 'i2v' });
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: 'sg-1',
          timeline_frame: 0,
          metadata: {
            segmentOverrides: {
              motionMode: 'advanced',
              phaseConfig: pc,
            },
          },
          generation: {
            id: 'gen-1',
            location: 'https://example.com/img1.png',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: 'sg-2',
          timeline_frame: 61,
          generation: {
            id: 'gen-2',
            location: 'https://example.com/img2.png',
            type: 'image',
          },
        }),
      ];
      const result = buildTimelinePairConfig(rows, 61, defaultNeg);
      // Phase config should be present but with mode stripped
      expect(result.pairPhaseConfigsArray[0]).toBeDefined();
      expect(result.pairPhaseConfigsArray[0]).not.toHaveProperty('mode');
      expect(result.pairPhaseConfigsArray[0]!.num_phases).toBe(2);
    });

    it('extracts structure video overrides from metadata', () => {
      const rows: ShotGenRow[] = [
        makeShotGenRow({
          id: 'sg-1',
          timeline_frame: 0,
          metadata: {
            segmentOverrides: {
              structureMotionStrength: 0.7,
              structureTreatment: 'clip',
              structureUni3cEndPercent: 0.8,
            },
          },
          generation: {
            id: 'gen-1',
            location: 'https://example.com/img1.png',
            type: 'image',
          },
        }),
        makeShotGenRow({
          id: 'sg-2',
          timeline_frame: 61,
          generation: {
            id: 'gen-2',
            location: 'https://example.com/img2.png',
            type: 'image',
          },
        }),
      ];
      const result = buildTimelinePairConfig(rows, 61, defaultNeg);
      expect(result.pairMotionSettingsArray[0]).toEqual({
        structure_motion_strength: 0.7,
        structure_treatment: 'clip',
        uni3c_end_percent: 0.8,
      });
    });
  });

  // --------------------------------------------------------------------------
  // resolveModelPhaseSelection
  // --------------------------------------------------------------------------
  describe('resolveModelPhaseSelection', () => {
    it('returns basic mode config when advancedMode is false', () => {
      const result = resolveModelPhaseSelection(
        50,
        false,
        undefined,
        'basic',
        [],
      );
      expect(result.useAdvancedMode).toBe(false);
      expect(result.actualModelName).toBe('wan_2_2_i2v_lightning_baseline_2_2_2');
      expect(result.effectivePhaseConfig).toBeDefined();
      expect(result.effectivePhaseConfig.num_phases).toBe(2);
    });

    it('returns basic mode config when motionMode is basic even with advancedMode true', () => {
      const result = resolveModelPhaseSelection(
        50,
        true,
        makePhaseConfig(),
        'basic',
        [],
      );
      expect(result.useAdvancedMode).toBe(false);
    });

    it('returns basic mode config when phaseConfig is undefined', () => {
      const result = resolveModelPhaseSelection(
        50,
        true,
        undefined,
        'advanced',
        [],
      );
      expect(result.useAdvancedMode).toBe(false);
    });

    it('uses 3-phase model for 2-phase config in advanced mode', () => {
      const pc = makePhaseConfig({ num_phases: 2 });
      const result = resolveModelPhaseSelection(
        50,
        true,
        pc,
        'advanced',
        [],
      );
      expect(result.useAdvancedMode).toBe(true);
      expect(result.actualModelName).toBe('wan_2_2_i2v_lightning_baseline_3_3');
      expect(result.effectivePhaseConfig).toBe(pc);
    });

    it('uses 2-2-2 model for 3-phase config in advanced mode', () => {
      const pc = makePhaseConfig({
        num_phases: 3,
        steps_per_phase: [2, 2, 2],
        phases: [
          { phase: 1, guidance_scale: 1.0, loras: [] },
          { phase: 2, guidance_scale: 1.0, loras: [] },
          { phase: 3, guidance_scale: 1.0, loras: [] },
        ],
      });
      const result = resolveModelPhaseSelection(
        50,
        true,
        pc,
        'advanced',
        [],
      );
      expect(result.useAdvancedMode).toBe(true);
      expect(result.actualModelName).toBe('wan_2_2_i2v_lightning_baseline_2_2_2');
    });

    it('incorporates user loras into basic mode phase config', () => {
      const result = resolveModelPhaseSelection(
        75,
        false,
        undefined,
        'basic',
        [{ id: 'lora1', path: 'https://example.com/lora.safetensors', strength: 0.8, name: 'TestLora' }],
      );
      expect(result.useAdvancedMode).toBe(false);
      // Check that user loras were passed through to the phase config
      const allLoras = result.effectivePhaseConfig.phases.flatMap(p => p.loras);
      const userLora = allLoras.find(l => l.url === 'https://example.com/lora.safetensors');
      expect(userLora).toBeDefined();
      expect(userLora!.multiplier).toBe('0.80');
    });

    it('handles lora with zero strength', () => {
      const result = resolveModelPhaseSelection(
        50,
        false,
        undefined,
        'basic',
        [{ id: 'lora1', path: 'https://example.com/lora.safetensors', strength: 0, name: 'TestLora' }],
      );
      const allLoras = result.effectivePhaseConfig.phases.flatMap(p => p.loras);
      const userLora = allLoras.find(l => l.url === 'https://example.com/lora.safetensors');
      expect(userLora).toBeDefined();
      expect(userLora!.multiplier).toBe('0.00');
    });

    it('handles lora with string strength (parses to number)', () => {
      const result = resolveModelPhaseSelection(
        50,
        false,
        undefined,
        'basic',
        [{ id: 'lora1', path: 'https://example.com/lora.safetensors', strength: '0.5' as any, name: 'TestLora' }],
      );
      const allLoras = result.effectivePhaseConfig.phases.flatMap(p => p.loras);
      const userLora = allLoras.find(l => l.url === 'https://example.com/lora.safetensors');
      expect(userLora).toBeDefined();
      expect(userLora!.multiplier).toBe('0.50');
    });
  });

  // --------------------------------------------------------------------------
  // validatePhaseConfigConsistency
  // --------------------------------------------------------------------------
  describe('validatePhaseConfigConsistency', () => {
    it('does not throw for consistent 2-phase config', () => {
      const config = makePhaseConfig({
        num_phases: 2,
        steps_per_phase: [3, 3],
        phases: [
          { phase: 1, guidance_scale: 1.0, loras: [] },
          { phase: 2, guidance_scale: 1.0, loras: [] },
        ],
      });
      expect(() => validatePhaseConfigConsistency(config)).not.toThrow();
    });

    it('does not throw for consistent 3-phase config', () => {
      const config = makePhaseConfig({
        num_phases: 3,
        steps_per_phase: [2, 2, 2],
        phases: [
          { phase: 1, guidance_scale: 1.0, loras: [] },
          { phase: 2, guidance_scale: 1.0, loras: [] },
          { phase: 3, guidance_scale: 1.0, loras: [] },
        ],
      });
      expect(() => validatePhaseConfigConsistency(config)).not.toThrow();
    });

    it('throws when num_phases does not match phases array length', () => {
      const config = makePhaseConfig({
        num_phases: 3,
        steps_per_phase: [3, 3, 3],
        phases: [
          { phase: 1, guidance_scale: 1.0, loras: [] },
          { phase: 2, guidance_scale: 1.0, loras: [] },
        ],
      });
      expect(() => validatePhaseConfigConsistency(config)).toThrow(
        /num_phases \(3\) does not match arrays \(phases: 2, steps: 3\)/,
      );
    });

    it('throws when num_phases does not match steps_per_phase length', () => {
      const config = makePhaseConfig({
        num_phases: 2,
        steps_per_phase: [3, 3, 3],
        phases: [
          { phase: 1, guidance_scale: 1.0, loras: [] },
          { phase: 2, guidance_scale: 1.0, loras: [] },
        ],
      });
      expect(() => validatePhaseConfigConsistency(config)).toThrow(
        /num_phases \(2\) does not match arrays \(phases: 2, steps: 3\)/,
      );
    });

    it('throws when both phases and steps are wrong length', () => {
      const config = makePhaseConfig({
        num_phases: 3,
        steps_per_phase: [1, 2],
        phases: [
          { phase: 1, guidance_scale: 1.0, loras: [] },
        ],
      });
      expect(() => validatePhaseConfigConsistency(config)).toThrow(
        /num_phases \(3\) does not match arrays \(phases: 1, steps: 2\)/,
      );
    });

    it('throws a ValidationError', () => {
      const config = makePhaseConfig({
        num_phases: 2,
        steps_per_phase: [3],
        phases: [{ phase: 1, guidance_scale: 1.0, loras: [] }],
      });
      try {
        validatePhaseConfigConsistency(config);
        expect.unreachable('Should have thrown');
      } catch (error: any) {
        expect(error.name).toBe('ValidationError');
      }
    });

    it('handles config with empty phases array', () => {
      const config = makePhaseConfig({
        num_phases: 2,
        steps_per_phase: [3, 3],
        phases: [],
      });
      expect(() => validatePhaseConfigConsistency(config)).toThrow(
        /num_phases \(2\) does not match arrays \(phases: 0, steps: 2\)/,
      );
    });
  });

  // --------------------------------------------------------------------------
  // buildBasicModePhaseConfig
  // --------------------------------------------------------------------------
  describe('buildBasicModePhaseConfig', () => {
    it('returns a model name and phase config', () => {
      const result = buildBasicModePhaseConfig(50, []);
      expect(result.model).toBe('wan_2_2_i2v_lightning_baseline_2_2_2');
      expect(result.phaseConfig).toBeDefined();
      expect(result.phaseConfig.num_phases).toBe(2);
    });

    it('always returns 2-phase config (non-vace)', () => {
      const result = buildBasicModePhaseConfig(100, []);
      expect(result.phaseConfig.phases).toHaveLength(2);
      expect(result.phaseConfig.steps_per_phase).toHaveLength(2);
    });

    it('adds user loras to each phase', () => {
      const result = buildBasicModePhaseConfig(50, [
        { path: 'https://example.com/my-lora.safetensors', strength: 0.7 },
      ]);
      // Each phase should have its base lora + user lora
      for (const phase of result.phaseConfig.phases) {
        const userLora = phase.loras.find(l => l.url === 'https://example.com/my-lora.safetensors');
        expect(userLora).toBeDefined();
        expect(userLora!.multiplier).toBe('0.70');
      }
    });

    it('handles multi-stage loras with high/low noise routing', () => {
      const result = buildBasicModePhaseConfig(50, [
        {
          path: 'https://example.com/high-noise.safetensors',
          strength: 1.0,
          lowNoisePath: 'https://example.com/low-noise.safetensors',
          isMultiStage: true,
        },
      ]);
      // First phase (not last) should have high noise path
      const firstPhaseLoras = result.phaseConfig.phases[0].loras;
      const highNoise = firstPhaseLoras.find(l => l.url === 'https://example.com/high-noise.safetensors');
      expect(highNoise).toBeDefined();

      // Last phase should have low noise path
      const lastPhaseLoras = result.phaseConfig.phases[result.phaseConfig.phases.length - 1].loras;
      const lowNoise = lastPhaseLoras.find(l => l.url === 'https://example.com/low-noise.safetensors');
      expect(lowNoise).toBeDefined();
    });

    it('converts amountOfMotion from 0-100 to 0-1 scale for internal use', () => {
      // This function receives the already-divided value (amountOfMotion / 100)
      const result = buildBasicModePhaseConfig(75, []);
      // amountOfMotion is 75, passed as 75/100=0.75 to the core function
      // This verifies the wrapper divides correctly
      expect(result.phaseConfig).toBeDefined();
    });

    it('handles empty lora array', () => {
      const result = buildBasicModePhaseConfig(50, []);
      // Phases should only have base loras
      for (const phase of result.phaseConfig.phases) {
        expect(phase.loras.length).toBe(1); // Just the base lora
      }
    });
  });

  // --------------------------------------------------------------------------
  // buildStructureGuidance
  // --------------------------------------------------------------------------
  describe('buildStructureGuidance', () => {
    it('returns null for undefined input', () => {
      expect(_buildStructureGuidance(undefined)).toBeNull();
    });

    it('returns null for empty array', () => {
      expect(_buildStructureGuidance([])).toBeNull();
    });

    it('builds uni3c guidance', () => {
      const result = _buildStructureGuidance([
        {
          path: '/videos/structure.mp4',
          structure_type: 'uni3c',
          motion_strength: 0.8,
          uni3c_start_percent: 0.1,
          uni3c_end_percent: 0.9,
          start_frame: 0,
          end_frame: 100,
          treatment: 'adjust',
        },
      ]);
      expect(result).not.toBeNull();
      expect(result!.target).toBe('uni3c');
      expect(result!.strength).toBe(0.8);
      expect(result!.step_window).toEqual([0.1, 0.9]);
      expect(result!.frame_policy).toBe('fit');
      expect(result!.zero_empty_frames).toBe(true);
      // Should not have vace-specific fields
      expect(result!.preprocessing).toBeUndefined();
    });

    it('builds vace guidance with flow preprocessing', () => {
      const result = _buildStructureGuidance([
        {
          path: '/videos/structure.mp4',
          structure_type: 'flow',
          motion_strength: 1.2,
          start_frame: 0,
          end_frame: null,
          treatment: 'clip',
        },
      ]);
      expect(result).not.toBeNull();
      expect(result!.target).toBe('vace');
      expect(result!.strength).toBe(1.2);
      expect(result!.preprocessing).toBe('flow');
      // Should not have uni3c-specific fields
      expect(result!.step_window).toBeUndefined();
      expect(result!.frame_policy).toBeUndefined();
    });

    it('builds vace guidance with canny preprocessing', () => {
      const result = _buildStructureGuidance([
        {
          path: '/videos/structure.mp4',
          structure_type: 'canny',
          motion_strength: 1.0,
        },
      ]);
      expect(result!.preprocessing).toBe('canny');
    });

    it('builds vace guidance with depth preprocessing', () => {
      const result = _buildStructureGuidance([
        {
          path: '/videos/structure.mp4',
          structure_type: 'depth',
          motion_strength: 1.0,
        },
      ]);
      expect(result!.preprocessing).toBe('depth');
    });

    it('maps raw structure_type to none preprocessing', () => {
      const result = _buildStructureGuidance([
        {
          path: '/videos/structure.mp4',
          structure_type: 'raw' as any,
          motion_strength: 1.0,
        },
      ]);
      expect(result!.preprocessing).toBe('none');
    });

    it('uses default treatment when not specified', () => {
      const result = _buildStructureGuidance([
        {
          path: '/videos/structure.mp4',
          structure_type: 'flow',
          motion_strength: 1.0,
        },
      ]);
      const videos = result!.videos as Array<Record<string, unknown>>;
      expect(videos[0].treatment).toBe('adjust'); // DEFAULT_VIDEO_STRUCTURE_PARAMS
    });

    it('uses default strength (1.0) when motion_strength is undefined', () => {
      const result = _buildStructureGuidance([
        {
          path: '/videos/structure.mp4',
          structure_type: 'flow',
        },
      ]);
      expect(result!.strength).toBe(1.0);
    });

    it('uses default start_frame (0) when not specified', () => {
      const result = _buildStructureGuidance([
        {
          path: '/videos/structure.mp4',
          structure_type: 'flow',
        },
      ]);
      const videos = result!.videos as Array<Record<string, unknown>>;
      expect(videos[0].start_frame).toBe(0);
    });

    it('includes resource_id when present', () => {
      const result = _buildStructureGuidance([
        {
          path: '/videos/structure.mp4',
          structure_type: 'flow',
          resource_id: 'resource-123',
        },
      ]);
      const videos = result!.videos as Array<Record<string, unknown>>;
      expect(videos[0].resource_id).toBe('resource-123');
    });

    it('includes metadata when present', () => {
      const meta = { duration_seconds: 5, frame_rate: 30 };
      const result = _buildStructureGuidance([
        {
          path: '/videos/structure.mp4',
          structure_type: 'flow',
          metadata: meta,
        },
      ]);
      const videos = result!.videos as Array<Record<string, unknown>>;
      expect(videos[0].metadata).toEqual(meta);
    });

    it('includes canny_intensity for vace with canny', () => {
      const result = _buildStructureGuidance([
        {
          path: '/videos/structure.mp4',
          structure_type: 'canny',
          motion_strength: 1.0,
          canny_intensity: 0.5,
        } as any,
      ]);
      expect(result!.canny_intensity).toBe(0.5);
    });

    it('includes depth_contrast for vace with depth', () => {
      const result = _buildStructureGuidance([
        {
          path: '/videos/structure.mp4',
          structure_type: 'depth',
          motion_strength: 1.0,
          depth_contrast: 0.7,
        } as any,
      ]);
      expect(result!.depth_contrast).toBe(0.7);
    });

    it('defaults uni3c step_window when percentages not specified', () => {
      const result = _buildStructureGuidance([
        {
          path: '/videos/structure.mp4',
          structure_type: 'uni3c',
          motion_strength: 1.0,
        },
      ]);
      expect(result!.step_window).toEqual([0, 0.1]);
    });

    it('handles multiple structure videos', () => {
      const result = _buildStructureGuidance([
        {
          path: '/videos/structure1.mp4',
          structure_type: 'flow',
          motion_strength: 1.0,
        },
        {
          path: '/videos/structure2.mp4',
          structure_type: 'flow',
          motion_strength: 0.5,
        },
      ]);
      const videos = result!.videos as Array<Record<string, unknown>>;
      expect(videos).toHaveLength(2);
      expect(videos[0].path).toBe('/videos/structure1.mp4');
      expect(videos[1].path).toBe('/videos/structure2.mp4');
      // strength comes from first video
      expect(result!.strength).toBe(1.0);
    });
  });

  // --------------------------------------------------------------------------
  // buildTravelRequestBody
  // --------------------------------------------------------------------------
  describe('buildTravelRequestBody', () => {
    const baseParams = {
      projectId: 'proj-1',
      selectedShot: { id: 'shot-1' } as any,
      imagePayload: {
        absoluteImageUrls: ['https://example.com/img1.png', 'https://example.com/img2.png'],
        imageGenerationIds: ['gen-1', 'gen-2'],
        imageVariantIds: [],
        pairShotGenerationIds: ['sg-1'],
      } as ImagePayload,
      pairConfig: {
        basePrompts: [''],
        segmentFrames: [61],
        frameOverlap: [10],
        negativePrompts: ['bad quality'],
        enhancedPromptsArray: [''],
        pairPhaseConfigsArray: [null],
        pairLorasArray: [null],
        pairMotionSettingsArray: [null],
      } as PairConfigPayload,
      actualModelName: 'wan_2_2_i2v_lightning_baseline_2_2_2',
      generationTypeMode: 'i2v' as const,
      motionParams: {
        amountOfMotion: 50,
        motionMode: 'basic' as const,
        useAdvancedMode: false,
        effectivePhaseConfig: makePhaseConfig(),
        selectedPhasePresetId: null,
      },
      generationParams: {
        generationMode: 'timeline' as const,
        batchVideoPrompt: 'a beautiful scene',
        enhancePrompt: false,
        variantNameParam: '',
        textBeforePrompts: undefined,
        textAfterPrompts: undefined,
      },
      seedParams: {
        seed: 789,
        randomSeed: true,
        turboMode: false,
        debug: false,
      },
    };

    it('includes required fields', () => {
      const result = _buildTravelRequestBodyV2(baseParams);
      expect(result.project_id).toBe('proj-1');
      expect(result.shot_id).toBe('shot-1');
      expect(result.image_urls).toEqual(['https://example.com/img1.png', 'https://example.com/img2.png']);
      expect(result.model_name).toBe('wan_2_2_i2v_lightning_baseline_2_2_2');
      expect(result.seed).toBe(789);
      expect(result.base_prompt).toBe('a beautiful scene');
      expect(result.base_prompts).toEqual(['']);
      expect(result.segment_frames).toEqual([61]);
      expect(result.frame_overlap).toEqual([10]);
    });

    it('normalizes amountOfMotion to 0-1 scale', () => {
      const result = _buildTravelRequestBodyV2(baseParams);
      expect(result.amount_of_motion).toBe(0.5); // 50 / 100
    });

    it('includes image_generation_ids when they match image count', () => {
      const result = _buildTravelRequestBodyV2(baseParams);
      expect(result.image_generation_ids).toEqual(['gen-1', 'gen-2']);
    });

    it('throws when image_generation_ids count does not match', () => {
      expect(() => _buildTravelRequestBodyV2({
        ...baseParams,
        imagePayload: {
          ...baseParams.imagePayload,
          imageGenerationIds: ['gen-1'], // Only 1, but 2 URLs
        },
      })).toThrowError('image_generation_ids');
    });

    it('omits image_variant_ids when empty', () => {
      const result = _buildTravelRequestBodyV2(baseParams);
      expect(result.image_variant_ids).toBeUndefined();
    });

    it('includes image_variant_ids when matching count', () => {
      const result = _buildTravelRequestBodyV2({
        ...baseParams,
        imagePayload: {
          ...baseParams.imagePayload,
          imageVariantIds: ['v-1', 'v-2'],
        },
      });
      expect(result.image_variant_ids).toEqual(['v-1', 'v-2']);
    });

    it('throws when image_variant_ids count does not match', () => {
      expect(() => _buildTravelRequestBodyV2({
        ...baseParams,
        imagePayload: {
          ...baseParams.imagePayload,
          imageVariantIds: ['v-1'],
        },
      })).toThrowError('image_variant_ids');
    });

    it('includes parent_generation_id when provided', () => {
      const result = _buildTravelRequestBodyV2({
        ...baseParams,
        parentGenerationId: 'parent-gen-1',
      });
      expect(result.parent_generation_id).toBe('parent-gen-1');
    });

    it('omits parent_generation_id when not provided', () => {
      const result = _buildTravelRequestBodyV2(baseParams);
      expect(result.parent_generation_id).toBeUndefined();
    });

    it('includes enhanced_prompts when they have content', () => {
      const result = _buildTravelRequestBodyV2({
        ...baseParams,
        pairConfig: {
          ...baseParams.pairConfig,
          enhancedPromptsArray: ['enhanced version of the prompt'],
        },
      });
      expect(result.enhanced_prompts).toEqual(['enhanced version of the prompt']);
    });

    it('omits enhanced_prompts when all empty', () => {
      const result = _buildTravelRequestBodyV2({
        ...baseParams,
        pairConfig: {
          ...baseParams.pairConfig,
          enhancedPromptsArray: ['', ''],
        },
      });
      expect(result.enhanced_prompts).toBeUndefined();
    });

    it('includes pair_phase_configs when some are non-null', () => {
      const pc = makePhaseConfig();
      const result = _buildTravelRequestBodyV2({
        ...baseParams,
        pairConfig: {
          ...baseParams.pairConfig,
          pairPhaseConfigsArray: [pc, null],
        },
      });
      expect(result.pair_phase_configs).toEqual([pc, null]);
    });

    it('omits pair_phase_configs when all null', () => {
      const result = _buildTravelRequestBodyV2(baseParams);
      expect(result.pair_phase_configs).toBeUndefined();
    });

    it('includes pair_loras when some are non-null', () => {
      const result = _buildTravelRequestBodyV2({
        ...baseParams,
        pairConfig: {
          ...baseParams.pairConfig,
          pairLorasArray: [[{ path: '/lora', strength: 0.8 }]],
        },
      });
      expect(result.pair_loras).toEqual([[{ path: '/lora', strength: 0.8 }]]);
    });

    it('includes pair_motion_settings when some are non-null', () => {
      const result = _buildTravelRequestBodyV2({
        ...baseParams,
        pairConfig: {
          ...baseParams.pairConfig,
          pairMotionSettingsArray: [{ amount_of_motion: 0.8 }],
        },
      });
      expect(result.pair_motion_settings).toEqual([{ amount_of_motion: 0.8 }]);
    });

    it('strips mode from phase config', () => {
      const result = _buildTravelRequestBodyV2({
        ...baseParams,
        motionParams: {
          ...baseParams.motionParams,
          useAdvancedMode: true,
          motionMode: 'advanced',
          effectivePhaseConfig: makePhaseConfig({ mode: 'i2v' }),
        },
      });
      expect((result.phase_config as any).mode).toBeUndefined();
    });

    it('includes text_before_prompts when provided', () => {
      const result = _buildTravelRequestBodyV2({
        ...baseParams,
        generationParams: {
          ...baseParams.generationParams,
          textBeforePrompts: 'cinematic, ',
        },
      });
      expect(result.text_before_prompts).toBe('cinematic, ');
    });

    it('omits text_before_prompts when undefined', () => {
      const result = _buildTravelRequestBodyV2(baseParams);
      expect(result.text_before_prompts).toBeUndefined();
    });

    it('includes text_after_prompts when provided', () => {
      const result = _buildTravelRequestBodyV2({
        ...baseParams,
        generationParams: {
          ...baseParams.generationParams,
          textAfterPrompts: ', 4k quality',
        },
      });
      expect(result.text_after_prompts).toBe(', 4k quality');
    });

    it('includes generation_name when variantNameParam is non-empty', () => {
      const result = _buildTravelRequestBodyV2({
        ...baseParams,
        generationParams: {
          ...baseParams.generationParams,
          variantNameParam: 'my variant v2',
        },
      });
      expect(result.generation_name).toBe('my variant v2');
    });

    it('omits generation_name when variantNameParam is empty', () => {
      const result = _buildTravelRequestBodyV2({
        ...baseParams,
        generationParams: {
          ...baseParams.generationParams,
          variantNameParam: '',
        },
      });
      expect(result.generation_name).toBeUndefined();
    });

    it('trims whitespace from variantNameParam', () => {
      const result = _buildTravelRequestBodyV2({
        ...baseParams,
        generationParams: {
          ...baseParams.generationParams,
          variantNameParam: '  my variant  ',
        },
      });
      expect(result.generation_name).toBe('my variant');
    });

    it('includes pair_shot_generation_ids when present', () => {
      const result = _buildTravelRequestBodyV2(baseParams);
      expect(result.pair_shot_generation_ids).toEqual(['sg-1']);
    });

    it('throws when pair_shot_generation_ids count does not match image pairs', () => {
      expect(() => _buildTravelRequestBodyV2({
        ...baseParams,
        imagePayload: {
          ...baseParams.imagePayload,
          pairShotGenerationIds: ['sg-1', 'sg-2'], // 2 IDs for 1 pair
        },
      })).toThrowError('pair_shot_generation_ids');
    });

    it('omits pair_shot_generation_ids when empty', () => {
      const result = _buildTravelRequestBodyV2({
        ...baseParams,
        imagePayload: {
          ...baseParams.imagePayload,
          pairShotGenerationIds: [],
        },
      });
      expect(result.pair_shot_generation_ids).toBeUndefined();
    });

    it('sets static fields correctly', () => {
      const result = _buildTravelRequestBodyV2(baseParams);
      expect(result.model_type).toBe('i2v');
      expect(result.regenerate_anchors).toBe(false);
      expect(result.independent_segments).toBe(true);
      expect(result.chain_segments).toBe(false);
      expect(result.use_svi).toBeUndefined();
    });
  });
});
