import { describe, expect, it } from 'vitest';
import {
  buildTravelGuidanceFromControls,
  getSupportedTravelGuidanceModes,
  normalizeTravelGuidance,
  resolveTravelGuidanceControls,
} from './travelGuidance';

describe('travelGuidance', () => {
  it('builds distilled LTX control guidance from semantic controls', () => {
    const guidance = buildTravelGuidanceFromControls({
      modelName: 'ltx2_22B_distilled',
      controls: {
        mode: 'pose',
        strength: 0.5,
        uni3cEndPercent: 0.1,
      },
      structureVideos: [{
        path: 'https://example.com/guide.mp4',
        start_frame: 0,
        end_frame: 97,
        treatment: 'adjust',
      }],
    });

    expect(guidance).toEqual({
      kind: 'ltx_control',
      mode: 'pose',
      strength: 0.5,
      videos: [{
        path: 'https://example.com/guide.mp4',
        start_frame: 0,
        end_frame: 97,
        treatment: 'adjust',
      }],
    });
  });

  it('builds WAN raw guidance as vace.raw', () => {
    const guidance = buildTravelGuidanceFromControls({
      modelName: 'wan_2_2_i2v_lightning_baseline_2_2_2',
      controls: {
        mode: 'raw',
        strength: 1,
        uni3cEndPercent: 0.1,
      },
      structureVideos: [{
        path: 'https://example.com/guide.mp4',
        start_frame: 5,
        end_frame: 25,
        treatment: 'clip',
      }],
    });

    expect(guidance).toEqual({
      kind: 'vace',
      mode: 'raw',
      strength: 1,
      videos: [{
        path: 'https://example.com/guide.mp4',
        start_frame: 5,
        end_frame: 25,
        treatment: 'clip',
      }],
    });
  });

  it('drops unsupported direct guidance for full LTX', () => {
    const guidance = normalizeTravelGuidance({
      modelName: 'ltx2_22B',
      travelGuidance: {
        kind: 'ltx_control',
        mode: 'pose',
        strength: 0.5,
        videos: [{
          path: 'https://example.com/guide.mp4',
          start_frame: 0,
          end_frame: 97,
          treatment: 'adjust',
        }],
      },
    });

    expect(guidance).toBeUndefined();
  });

  it('derives UI controls from canonical guidance', () => {
    const controls = resolveTravelGuidanceControls({
      kind: 'uni3c',
      strength: 0.8,
      step_window: [0, 0.4],
      videos: [{
        path: 'https://example.com/guide.mp4',
        start_frame: 0,
        end_frame: 49,
        treatment: 'adjust',
      }],
    }, {}, 'wan_2_2_i2v_lightning_baseline_2_2_2');

    expect(controls).toEqual({
      mode: 'uni3c',
      strength: 0.8,
      uni3cEndPercent: 0.4,
    });
  });

  it('returns the correct supported modes per model family', () => {
    expect(getSupportedTravelGuidanceModes('wan_2_2_i2v_lightning_baseline_2_2_2')).toEqual([
      'flow',
      'canny',
      'depth',
      'raw',
      'uni3c',
    ]);
    expect(getSupportedTravelGuidanceModes('ltx2_22B_distilled')).toEqual([
      'video',
      'pose',
      'depth',
      'canny',
      'uni3c',
    ]);
    expect(getSupportedTravelGuidanceModes('ltx2_22B')).toEqual([]);
  });

  it('preserves explicit adjust treatment instead of replacing it with the fallback', () => {
    const guidance = buildTravelGuidanceFromControls({
      modelName: 'wan_2_2_i2v_lightning_baseline_2_2_2',
      controls: {
        mode: 'flow',
        strength: 1,
        uni3cEndPercent: 0.1,
      },
      defaultVideoTreatment: 'clip',
      structureVideos: [{
        path: 'https://example.com/guide.mp4',
        start_frame: 0,
        end_frame: 25,
        treatment: 'adjust',
      }],
    });

    expect(guidance).toEqual({
      kind: 'vace',
      mode: 'flow',
      strength: 1,
      videos: [{
        path: 'https://example.com/guide.mp4',
        start_frame: 0,
        end_frame: 25,
        treatment: 'adjust',
      }],
    });
  });
});
