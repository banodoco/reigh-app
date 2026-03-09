import { describe, expect, it } from 'vitest';
import type { SegmentSettingsFormProps } from './types';

describe('SegmentSettingsFormProps', () => {
  it('keeps core, defaults, and timeline structure video concerns in one contract', () => {
    const props: SegmentSettingsFormProps = {
      settings: {
        prompt: 'Base prompt',
        negativePrompt: 'Negative prompt',
        textBeforePrompts: 'Before',
        textAfterPrompts: 'After',
        motionMode: 'advanced',
        amountOfMotion: 72,
        phaseConfig: {
          phases: [],
          flowShift: 5,
          fps: 24,
          mode: 'custom',
        },
        selectedPhasePresetId: 'preset-1',
        loras: [
          {
            id: 'lora-1',
            name: 'Painterly',
            path: '/loras/painterly.safetensors',
            strength: 0.8,
          },
        ],
        numFrames: 61,
        randomSeed: false,
        seed: 1234,
        makePrimaryVariant: true,
        structureMotionStrength: 0.45,
        structureTreatment: 'clip',
        structureUni3cEndPercent: 80,
      },
      onChange: () => {},
      onSubmit: async () => {},
      segmentIndex: 2,
      modelName: 'wan_2_2_i2v',
      resolution: '1280x720',
      showHeader: true,
      buttonLabel: 'Generate',
      shotDefaults: {
        prompt: 'Shot prompt',
        negativePrompt: 'Shot negative',
        textBeforePrompts: '',
        textAfterPrompts: '',
        motionMode: 'basic',
        amountOfMotion: 45,
        loras: [],
        selectedPhasePresetId: null,
      },
      hasOverride: {
        prompt: true,
        negativePrompt: false,
        textBeforePrompts: false,
        textAfterPrompts: false,
        motionMode: true,
        amountOfMotion: true,
        phaseConfig: false,
        loras: false,
        selectedPhasePresetId: false,
        structureMotionStrength: true,
        structureTreatment: true,
        structureUni3cEndPercent: false,
      },
      structureVideoType: 'uni3c',
      structureVideoUrl: 'https://cdn.example.com/guide.mp4',
      structureVideoDefaults: {
        motionStrength: 0.4,
        treatment: 'adjust',
        uni3cEndPercent: 65,
      },
      structureVideoFrameRange: {
        segmentStart: 1,
        segmentEnd: 24,
        videoTotalFrames: 96,
        videoFps: 24,
      },
      onAddSegmentStructureVideo: () => {},
      onUpdateSegmentStructureVideo: () => {},
      onRemoveSegmentStructureVideo: () => {},
      isTimelineMode: true,
      edgeExtendAmount: 4,
    };

    expect(props.settings.motionMode).toBe('advanced');
    expect(props.settings.structureTreatment).toBe('clip');
    expect(props.shotDefaults?.motionMode).toBe('basic');
    expect(props.structureVideoFrameRange?.videoTotalFrames).toBe(96);
    expect(typeof props.onSubmit).toBe('function');
    expect(typeof props.onAddSegmentStructureVideo).toBe('function');
  });
});
