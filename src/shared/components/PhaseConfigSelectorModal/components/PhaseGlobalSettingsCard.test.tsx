import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PhaseGlobalSettingsCard } from './PhaseGlobalSettingsCard';

vi.mock('@/shared/components/ui/card', () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/shared/components/ui/primitives/label', () => ({
  Label: ({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

vi.mock('@/shared/components/ui/radio-group', () => ({
  RadioGroup: ({
    value,
    onValueChange,
  }: {
    value: string;
    onValueChange: (value: string) => void;
  }) => {
    const options = value === '2' || value === '3' ? ['2', '3'] : ['euler', 'unipc', 'dpm++'];

    return (
      <div>
        {options.map((option) => (
          <button key={option} type="button" onClick={() => onValueChange(option)}>
            radio-{option}
          </button>
        ))}
      </div>
    );
  },
  RadioGroupItem: () => <span />,
}));

vi.mock('@/shared/components/ui/slider', () => ({
  Slider: ({ id, value, onValueChange }: { id: string; value: number; onValueChange: (value: number) => void }) => (
    <input
      aria-label={id}
      type="range"
      value={value}
      onChange={(event) => onValueChange(Number(event.target.value))}
    />
  ),
}));

vi.mock('@/shared/components/ui/switch', () => ({
  Switch: ({ id, checked, onCheckedChange }: { id: string; checked: boolean; onCheckedChange: (value: boolean) => void }) => (
    <input
      aria-label={id}
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  ),
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function buildConfig(overrides: Record<string, unknown> = {}) {
  return {
    num_phases: 2,
    steps_per_phase: [3, 4],
    flow_shift: 5,
    sample_solver: 'euler',
    model_switch_phase: 2,
    phases: [
      { phase: 1, guidance_scale: 1, loras: [] },
      { phase: 2, guidance_scale: 1, loras: [] },
    ],
    ...overrides,
  };
}

describe('PhaseGlobalSettingsCard', () => {
  it('renders global settings details including total steps', () => {
    render(
      <PhaseGlobalSettingsCard
        phaseConfig={buildConfig()}
        onPhaseConfigChange={vi.fn()}
        randomSeed={false}
        onRandomSeedChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Global Settings')).toBeInTheDocument();
    expect(screen.getByText('Total Steps: 7')).toBeInTheDocument();
    expect(screen.getByText(/Higher values emphasize motion/i)).toBeInTheDocument();
  });

  it('updates number of phases and resets model switch phase when selecting 2 phases', () => {
    const onPhaseConfigChange = vi.fn();
    const phaseConfig = buildConfig({
      num_phases: 3,
      steps_per_phase: [2, 2, 2],
      phases: [
        { phase: 1, guidance_scale: 1, loras: [] },
        { phase: 2, guidance_scale: 1, loras: [] },
        { phase: 3, guidance_scale: 1, loras: [] },
      ],
      model_switch_phase: 2,
    });

    render(
      <PhaseGlobalSettingsCard
        phaseConfig={phaseConfig}
        onPhaseConfigChange={onPhaseConfigChange}
        randomSeed={false}
        onRandomSeedChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'radio-2' }));

    expect(onPhaseConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        num_phases: 2,
        model_switch_phase: 1,
        steps_per_phase: [2, 2],
      }),
    );
  });

  it('updates sample solver and flow shift controls', () => {
    const onPhaseConfigChange = vi.fn();

    render(
      <PhaseGlobalSettingsCard
        phaseConfig={buildConfig()}
        onPhaseConfigChange={onPhaseConfigChange}
        randomSeed={false}
        onRandomSeedChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'radio-unipc' }));
    expect(onPhaseConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ sample_solver: 'unipc' }),
    );

    fireEvent.change(screen.getByLabelText('flow_shift'), { target: { value: '6.5' } });
    expect(onPhaseConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ flow_shift: 6.5 }),
    );
  });

  it('forwards random seed switch changes', () => {
    const onRandomSeedChange = vi.fn();

    render(
      <PhaseGlobalSettingsCard
        phaseConfig={buildConfig()}
        onPhaseConfigChange={vi.fn()}
        randomSeed={false}
        onRandomSeedChange={onRandomSeedChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('random-seed'));
    expect(onRandomSeedChange).toHaveBeenCalledWith(true);
  });
});
