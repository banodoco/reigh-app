import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import { MotionPresetSection } from '../MotionPresetSection';

const mockMotionPresetSelector = vi.fn();

vi.mock('@/shared/components/MotionPresetSelector', () => ({
  MotionPresetSelector: (props: Record<string, unknown>) => {
    mockMotionPresetSelector(props);
    const renderBasicModeContent = props.renderBasicModeContent as (() => ReactNode) | undefined;
    return (
      <div data-testid="motion-preset-selector">
        {props.labelSuffix as ReactNode}
        {renderBasicModeContent?.()}
      </div>
    );
  },
}));

vi.mock('@/domains/lora/components', async () => {
  const actual = await vi.importActual<typeof import('@/domains/lora/components')>('@/domains/lora/components');
  return {
    ...actual,
    ActiveLoRAsDisplay: ({
      selectedLoras,
      onRemoveLora,
      onLoraStrengthChange,
    }: {
      selectedLoras: Array<{ id: string }>;
      onRemoveLora: (id: string) => void;
      onLoraStrengthChange: (id: string, strength: number) => void;
    }) => (
      <div data-testid="active-loras-display">
        <span>loras:{selectedLoras.length}</span>
        <button type="button" onClick={() => onRemoveLora('lora-a')}>remove-lora-a</button>
        <button type="button" onClick={() => onLoraStrengthChange('lora-a', 0.77)}>update-lora-a</button>
      </div>
    ),
  };
});

vi.mock('@/shared/components/SegmentSettingsForm/components/FieldDefaultControls', () => ({
  FieldDefaultControls: ({
    onUseDefault,
    onSetAsDefault,
    isUsingDefault,
    isSaving,
  }: {
    onUseDefault?: () => void;
    onSetAsDefault?: () => Promise<void>;
    isUsingDefault: boolean;
    isSaving: boolean;
  }) => (
    <div>
      <span>{`default:${String(isUsingDefault)} saving:${String(isSaving)}`}</span>
      <button type="button" onClick={() => onUseDefault?.()}>use-default</button>
      <button type="button" onClick={() => void onSetAsDefault?.()}>set-default</button>
    </div>
  ),
}));

function buildPhaseConfig(overrides: Partial<PhaseConfig> = {}): PhaseConfig {
  return {
    num_phases: 2,
    steps_per_phase: [3, 3],
    flow_shift: 5,
    sample_solver: 'euler',
    model_switch_phase: 1,
    phases: [
      { phase: 1, guidance_scale: 1, loras: [] },
      { phase: 2, guidance_scale: 1, loras: [] },
    ],
    ...overrides,
  };
}

function buildProps(overrides: Record<string, unknown> = {}) {
  const settings = {
    prompt: '',
    negativePrompt: '',
    motionMode: undefined,
    amountOfMotion: 50,
    phaseConfig: undefined,
    selectedPhasePresetId: null,
    loras: [{ id: 'lora-a', name: 'LoRA A', path: '/a', strength: 0.5 }],
    numFrames: 61,
    randomSeed: true,
    makePrimaryVariant: false,
  };

  return {
    builtinPreset: { metadata: { phaseConfig: buildPhaseConfig({ flow_shift: 4 }) } },
    featuredPresetIds: ['preset-1'],
    generationMode: 'i2v' as const,
    settings,
    onChange: vi.fn(),
    shotDefaults: {
      motionMode: 'advanced' as const,
      phaseConfig: buildPhaseConfig({ flow_shift: 8 }),
      selectedPhasePresetId: 'default-preset',
      loras: [{ id: 'default-lora', name: 'Default LoRA', path: '/d', strength: 0.6 }],
    },
    queryKeyPrefix: 'segment-test',
    availableLoras: [],
    effectiveLoras: [{ id: 'lora-a', name: 'LoRA A', path: '/a', strength: 0.5 }],
    onMotionModeChange: vi.fn(),
    onPhaseConfigChange: vi.fn(),
    onPhasePresetSelect: vi.fn(),
    onPhasePresetRemove: vi.fn(),
    onRandomSeedChange: vi.fn(),
    onAddLoraClick: vi.fn(),
    onRemoveLora: vi.fn(),
    onLoraStrengthChange: vi.fn(),
    onSaveFieldAsDefault: vi.fn(),
    handleSaveFieldAsDefault: vi.fn(async () => undefined),
    savingField: null,
    isUsingMotionDefaults: false,
    isUsingLorasDefault: true,
    ...overrides,
  };
}

beforeEach(() => {
  mockMotionPresetSelector.mockReset();
});

describe('MotionPresetSection', () => {
  it('passes fallback motion preset props and lora actions to child controls', () => {
    const props = buildProps();

    render(<MotionPresetSection {...(props as never)} />);

    expect(screen.getByTestId('motion-preset-selector')).toBeInTheDocument();
    expect(mockMotionPresetSelector).toHaveBeenCalledTimes(1);

    const passedProps = mockMotionPresetSelector.mock.calls[0][0];
    expect(passedProps.selectedPhasePresetId).toBe('default-preset');
    expect(passedProps.motionMode).toBe('advanced');
    expect(passedProps.phaseConfig).toEqual(props.shotDefaults.phaseConfig);
    expect(passedProps.generationTypeMode).toBe('i2v');
    expect(passedProps.queryKeyPrefix).toBe('segment-test');

    fireEvent.click(screen.getByRole('button', { name: 'remove-lora-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'update-lora-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add or manage LoRAs' }));

    expect(props.onRemoveLora).toHaveBeenCalledWith('lora-a');
    expect(props.onLoraStrengthChange).toHaveBeenCalledWith('lora-a', 0.77);
    expect(props.onAddLoraClick).toHaveBeenCalledTimes(1);
  });

  it('executes use-default and set-as-default handlers for motion and lora controls', async () => {
    const props = buildProps({
      settings: {
        prompt: '',
        negativePrompt: '',
        motionMode: 'basic',
        amountOfMotion: 50,
        phaseConfig: buildPhaseConfig({ flow_shift: 10 }),
        selectedPhasePresetId: 'current-preset',
        loras: [{ id: 'lora-a', name: 'LoRA A', path: '/a', strength: 0.5 }],
        numFrames: 61,
        randomSeed: true,
        makePrimaryVariant: false,
      },
      effectiveLoras: [{ id: 'lora-a', name: 'LoRA A', path: '/a', strength: 0.5 }],
      onChange: vi.fn(),
      handleSaveFieldAsDefault: vi.fn(async () => undefined),
    });

    render(<MotionPresetSection {...(props as never)} />);

    const useDefaultButtons = screen.getAllByRole('button', { name: 'use-default' });
    fireEvent.click(useDefaultButtons[0]);
    fireEvent.click(useDefaultButtons[1]);

    expect(props.onChange).toHaveBeenCalledWith({
      motionMode: undefined,
      phaseConfig: undefined,
      selectedPhasePresetId: undefined,
    });
    expect(props.onChange).toHaveBeenCalledWith({
      loras: undefined,
      motionMode: undefined,
      phaseConfig: undefined,
      selectedPhasePresetId: undefined,
    });

    const setDefaultButtons = screen.getAllByRole('button', { name: 'set-default' });
    fireEvent.click(setDefaultButtons[0]);

    await waitFor(() => {
      expect(props.handleSaveFieldAsDefault).toHaveBeenCalledTimes(3);
    });

    expect(props.handleSaveFieldAsDefault).toHaveBeenNthCalledWith(1, 'motionMode', 'basic');
    expect(props.handleSaveFieldAsDefault).toHaveBeenNthCalledWith(2, 'phaseConfig', props.settings.phaseConfig);
    expect(props.handleSaveFieldAsDefault).toHaveBeenNthCalledWith(3, 'selectedPhasePresetId', 'current-preset');

    fireEvent.click(setDefaultButtons[1]);

    await waitFor(() => {
      expect(props.handleSaveFieldAsDefault).toHaveBeenCalledTimes(5);
    });

    expect(props.handleSaveFieldAsDefault).toHaveBeenNthCalledWith(4, 'loras', props.effectiveLoras);
    expect(props.handleSaveFieldAsDefault).toHaveBeenNthCalledWith(5, 'motionMode', 'basic');
  });
});
