import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { PhaseConfigVertical } from './PhaseConfigVertical';
import { DEFAULT_PHASE_CONFIG, type PhaseConfig } from '@/shared/types/phaseConfig';

vi.mock('@/shared/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/shared/components/ui/primitives/label', () => ({
  Label: ({ children, ...props }: React.ComponentProps<'label'>) => <label {...props}>{children}</label>,
}));

vi.mock('@/shared/components/ui/input', () => ({
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}));

vi.mock('@/shared/components/ui/number-input', () => ({
  NumberInput: ({
    value,
    onChange,
    ...rest
  }: {
    value?: number;
    onChange?: (value: number) => void;
  } & React.ComponentProps<'input'>) => (
    <input
      {...rest}
      value={value}
      onChange={(e) => {
        const next = Number(e.target.value);
        if (!Number.isNaN(next)) {
          onChange?.(next);
        }
      }}
    />
  ),
}));

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({
    children,
    className,
    onClick,
    type = 'button',
  }: {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    type?: 'button' | 'submit' | 'reset';
  }) => (
    <button
      type={type}
      data-testid={className?.includes('w-8 h-8 p-0') ? 'phase-header-button' : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/shared/components/ui/radio-group', () => ({
  RadioGroup: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    children: React.ReactNode;
  }) => (
    <div>
      {children}
      <button
        type="button"
        data-testid={`radio-group-${value ?? 'unset'}`}
        onClick={() => {
          if (value === '2') {
            onValueChange?.('3');
          }
        }}
      >
        radio-change
      </button>
    </div>
  ),
  RadioGroupItem: ({ id }: { id: string }) => <span data-testid={`radio-item-${id}`} />,
}));

vi.mock('@/shared/components/ui/slider', () => ({
  Slider: ({
    id,
    value,
    onValueChange,
  }: {
    id?: string;
    value?: number | number[];
    onValueChange?: (value: number[]) => void;
  }) => (
    <button
      type="button"
      data-testid={id ?? 'slider'}
      onClick={() => {
        const next = Array.isArray(value) ? value : [value ?? 0];
        onValueChange?.(next);
      }}
    >
      slider
    </button>
  ),
}));

vi.mock('@/shared/components/ui/switch', () => ({
  Switch: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <button type="button" data-testid={id ?? 'switch'} aria-pressed={checked} onClick={() => onCheckedChange?.(!checked)}>
      switch
    </button>
  ),
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/shared/components/ui/text-action', () => ({
  TextAction: ({
    children,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <button type="button" className={className} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('@/domains/lora/components', () => ({
  LoraSelectorModal: ({
    isOpen,
    onAddLora,
  }: {
    isOpen: boolean;
    onAddLora: (lora: { huggingface_url?: string }) => void;
  }) => (
    <div data-testid="lora-selector-modal">
      {isOpen ? (
        <button type="button" onClick={() => onAddLora({ huggingface_url: 'https://huggingface.co/new-lora' })}>
          add-lora-from-modal
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock('./PhaseConfigSelectorModal', () => ({
  PhaseConfigSelectorModal: () => <div data-testid="phase-config-selector-modal" />,
}));

vi.mock('@/domains/lora/lib/loraUtils', () => ({
  PREDEFINED_LORAS: [],
  getDisplayNameFromUrl: (url: string) => url,
}));

vi.mock('@/domains/lora/components/LoraSelectorModal/utils/validation-utils', () => ({
  validateHuggingFaceUrl: () => ({ isValid: true, message: '' }),
}));

function buildPhaseConfig(): PhaseConfig {
  return {
    num_phases: 2,
    steps_per_phase: [2, 4],
    flow_shift: 5,
    sample_solver: 'euler',
    model_switch_phase: 1,
    phases: [
      {
        phase: 1,
        guidance_scale: 1.0,
        loras: [{ url: 'https://huggingface.co/lora-a', multiplier: '1.0' }],
      },
      {
        phase: 2,
        guidance_scale: 1.2,
        loras: [{ url: 'https://huggingface.co/lora-b', multiplier: '0.9' }],
      },
    ],
  };
}

describe('PhaseConfigVertical', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggles random seed and transitions from 2 phases to 3 phases', () => {
    const onPhaseConfigChange = vi.fn();
    const onRandomSeedChange = vi.fn();

    render(
      <PhaseConfigVertical
        phaseConfig={buildPhaseConfig()}
        onPhaseConfigChange={onPhaseConfigChange}
        randomSeed={false}
        onRandomSeedChange={onRandomSeedChange}
      />,
    );

    expect(screen.getByTestId('random-seed')).toBeInTheDocument();
    expect(screen.getByTestId('radio-item-phases-2')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('random-seed'));
    expect(onRandomSeedChange).toHaveBeenCalledWith(true);
    expect(onRandomSeedChange).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('radio-group-2'));
    expect(onPhaseConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        num_phases: 3,
        steps_per_phase: [2, 2, 4],
      }),
    );
    expect(onPhaseConfigChange).toHaveBeenCalledTimes(1);
  });

  it('adds loras via text action and selector modal', () => {
    const onPhaseConfigChange = vi.fn();
    const onRandomSeedChange = vi.fn();

    render(
      <PhaseConfigVertical
        phaseConfig={buildPhaseConfig()}
        onPhaseConfigChange={onPhaseConfigChange}
        randomSeed={false}
        onRandomSeedChange={onRandomSeedChange}
        availableLoras={[]}
      />,
    );

    expect(screen.getAllByText('+ Add LoRA').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText('+ Add LoRA')[0]);
    expect(onPhaseConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        phases: expect.arrayContaining([
          expect.objectContaining({
            loras: expect.arrayContaining([
              expect.objectContaining({ url: 'https://huggingface.co/lora-a', multiplier: '1.0' }),
              expect.objectContaining({ url: '', multiplier: '1.0' }),
            ]),
          }),
        ]),
      }),
    );

    fireEvent.click(screen.getAllByText('Search')[0]);
    fireEvent.click(screen.getByText('add-lora-from-modal'));
    expect(onPhaseConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        phases: expect.arrayContaining([
          expect.objectContaining({
            loras: expect.arrayContaining([
              expect.objectContaining({ url: 'https://huggingface.co/new-lora', multiplier: '1.0' }),
            ]),
          }),
        ]),
      }),
    );
    expect(onPhaseConfigChange).toHaveBeenCalledTimes(2);
  });

  it('restores defaults using callback override or default config fallback', () => {
    const onRandomSeedChange = vi.fn();
    const onRestoreDefaults = vi.fn();
    const onPhaseConfigChangeWithOverride = vi.fn();

    const { unmount } = render(
      <PhaseConfigVertical
        phaseConfig={buildPhaseConfig()}
        onPhaseConfigChange={onPhaseConfigChangeWithOverride}
        randomSeed={false}
        onRandomSeedChange={onRandomSeedChange}
        onRestoreDefaults={onRestoreDefaults}
      />,
    );

    expect(screen.getAllByTestId('phase-header-button')).toHaveLength(4);

    fireEvent.click(screen.getAllByTestId('phase-header-button')[3]);
    expect(onRestoreDefaults).toHaveBeenCalledTimes(1);
    expect(onPhaseConfigChangeWithOverride).not.toHaveBeenCalledWith(DEFAULT_PHASE_CONFIG);
    expect(onRandomSeedChange).not.toHaveBeenCalled();

    unmount();

    const onPhaseConfigChangeFallback = vi.fn();
    render(
      <PhaseConfigVertical
        phaseConfig={buildPhaseConfig()}
        onPhaseConfigChange={onPhaseConfigChangeFallback}
        randomSeed={false}
        onRandomSeedChange={onRandomSeedChange}
      />,
    );

    fireEvent.click(screen.getAllByTestId('phase-header-button')[3]);
    expect(onPhaseConfigChangeFallback).toHaveBeenCalledWith(DEFAULT_PHASE_CONFIG);
  });
});
