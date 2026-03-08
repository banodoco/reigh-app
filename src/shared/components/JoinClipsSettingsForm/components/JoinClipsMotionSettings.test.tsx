import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JoinClipsMotionSettings } from './JoinClipsMotionSettings';

const mocks = vi.hoisted(() => ({
  MotionPresetSelector: vi.fn(() => <div data-testid="motion-preset-selector" />),
  LoraManager: vi.fn(() => <div data-testid="lora-manager" />),
  SectionHeader: vi.fn(() => <div data-testid="section-header" />),
}));

vi.mock('@/shared/components/MotionPresetSelector', () => ({
  MotionPresetSelector: (...args: unknown[]) => mocks.MotionPresetSelector(...args),
}));

vi.mock('@/shared/components/LoraManager', () => ({
  LoraManager: (...args: unknown[]) => mocks.LoraManager(...args),
}));

vi.mock('@/shared/components/ImageGenerationForm/components/SectionHeader', () => ({
  SectionHeader: (...args: unknown[]) => mocks.SectionHeader(...args),
}));

vi.mock('../constants', () => ({
  BUILTIN_JOIN_CLIPS_PRESET: { id: 'builtin-join-clips' },
}));

describe('JoinClipsMotionSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders section + motion selector and forwards provided handlers/config', () => {
    const onPhasePresetSelect = vi.fn();
    const onPhasePresetRemove = vi.fn();
    const onModeChange = vi.fn();
    const onPhaseConfigChange = vi.fn();
    const onRandomSeedChange = vi.fn();

    render(
      <JoinClipsMotionSettings
        availableLoras={[{ id: 'lora-1' } as never]}
        projectId="project-1"
        loraPersistenceKey="join-clips"
        loraManager={{ id: 'external' } as never}
        motionMode="advanced"
        onMotionModeChange={onModeChange}
        phaseConfig={{ phases: [] } as never}
        onPhaseConfigChange={onPhaseConfigChange}
        randomSeed
        onRandomSeedChange={onRandomSeedChange}
        selectedPhasePresetId="preset-1"
        onPhasePresetSelect={onPhasePresetSelect}
        onPhasePresetRemove={onPhasePresetRemove}
        featuredPresetIds={['preset-1', 'preset-2']}
      />,
    );

    expect(screen.getByTestId('section-header')).toBeInTheDocument();
    expect(screen.getByTestId('motion-preset-selector')).toBeInTheDocument();

    expect(mocks.SectionHeader).toHaveBeenCalledWith({
      title: 'Motion',
      theme: 'orange',
    }, {});

    const selectorProps = mocks.MotionPresetSelector.mock.calls[0][0];
    expect(selectorProps).toEqual(expect.objectContaining({
      builtinPreset: { id: 'builtin-join-clips' },
      featuredPresetIds: ['preset-1', 'preset-2'],
      generationTypeMode: 'vace',
      selectedPhasePresetId: 'preset-1',
      motionMode: 'advanced',
      onPresetSelect: onPhasePresetSelect,
      onPresetRemove: onPhasePresetRemove,
      onModeChange,
      onPhaseConfigChange,
      randomSeed: true,
      onRandomSeedChange,
      queryKeyPrefix: 'join-clips-presets',
      renderBasicModeContent: expect.any(Function),
    }));

    render(selectorProps.renderBasicModeContent());
    expect(mocks.LoraManager).toHaveBeenCalledWith(expect.objectContaining({
      availableLoras: [{ id: 'lora-1' }],
      projectId: 'project-1',
      persistenceScope: 'project',
      enableProjectPersistence: true,
      persistenceKey: 'join-clips',
      externalLoraManager: { id: 'external' },
      title: 'Additional LoRA Models (Optional)',
      addButtonText: 'Add or manage LoRAs',
    }), {});
  });

  it('uses no-op handler fallbacks and normalizes null project id for lora manager', () => {
    render(
      <JoinClipsMotionSettings
        availableLoras={[]}
        projectId={null}
        loraPersistenceKey="join-clips"
        motionMode="basic"
        phaseConfig={undefined}
        randomSeed={false}
        selectedPhasePresetId={undefined}
        featuredPresetIds={[]}
      />,
    );

    const selectorProps = mocks.MotionPresetSelector.mock.calls.at(-1)?.[0];
    expect(selectorProps).toBeDefined();
    expect(() => selectorProps.onPresetSelect('id', {})).not.toThrow();
    expect(() => selectorProps.onPresetRemove()).not.toThrow();
    expect(() => selectorProps.onModeChange('basic')).not.toThrow();
    expect(() => selectorProps.onPhaseConfigChange({})).not.toThrow();
    expect(selectorProps.selectedPhasePresetId).toBeNull();

    render(selectorProps.renderBasicModeContent());
    expect(mocks.LoraManager).toHaveBeenCalledWith(expect.objectContaining({
      projectId: undefined,
    }), {});
  });
});
