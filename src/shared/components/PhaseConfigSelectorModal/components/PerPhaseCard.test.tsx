import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PerPhaseCardProps } from '../types';
import { PerPhaseCard } from './PerPhaseCard';

vi.mock('@/domains/lora/lib/loraUtils', () => ({
  PREDEFINED_LORAS: [
    { category: 'Utility', name: 'Utility Lora', url: 'https://hf.co/utility' },
    { category: 'Style', name: 'Style Lora', url: 'https://hf.co/style' },
  ],
  getDisplayNameFromUrl: (url: string) => `display:${url}`,
}));

vi.mock('@/domains/lora/components/LoraSelectorModal/utils/validation-utils', () => ({
  validateHuggingFaceUrl: (url: string) =>
    url.includes('invalid')
      ? { isValid: false, message: 'Invalid Hugging Face URL' }
      : { isValid: true, message: '' },
}));

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/components/ui/card', () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/shared/components/ui/number-input', () => ({
  NumberInput: ({
    id,
    placeholder,
    value,
    onChange,
    className,
  }: {
    id?: string;
    placeholder?: string;
    value: number;
    onChange: (value: number) => void;
    className?: string;
  }) => (
    <input
      aria-label={id ?? placeholder ?? 'number-input'}
      className={className}
      type="number"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  ),
}));

vi.mock('@/shared/components/ui/input', () => ({
  Input: ({ value, onChange, onFocus, onBlur, placeholder, title, className }: Record<string, unknown>) => (
    <input
      className={className as string}
      placeholder={placeholder as string}
      title={title as string}
      value={value as string}
      onChange={onChange as (event: React.ChangeEvent<HTMLInputElement>) => void}
      onFocus={onFocus as () => void}
      onBlur={onBlur as () => void}
    />
  ),
}));

vi.mock('@/shared/components/ui/primitives/label', () => ({
  Label: ({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
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

vi.mock('@/shared/components/ui/text-action', () => ({
  TextAction: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

function buildProps(overrides: Partial<PerPhaseCardProps> = {}): PerPhaseCardProps {
  const phaseConfig = {
    num_phases: 2,
    steps_per_phase: [3, 5],
    flow_shift: 5,
    sample_solver: 'euler',
    model_switch_phase: 1,
    phases: [
      {
        phase: 1,
        guidance_scale: 1.5,
        loras: [
          { url: 'https://hf.co/valid', multiplier: '0.7' },
          { url: 'https://hf.co/invalid', multiplier: '1.0' },
          { url: '', multiplier: '1.0' },
        ],
      },
      {
        phase: 2,
        guidance_scale: 1.0,
        loras: [{ url: 'https://hf.co/other', multiplier: '0.5' }],
      },
    ],
  };

  return {
    phaseConfig,
    phaseIdx: 0,
    phase: phaseConfig.phases[0],
    label: 'High Noise Sampler',
    availableLoras: [],
    focusedLoraInput: null,
    onPhaseConfigChange: vi.fn(),
    onFocusLoraInput: vi.fn(),
    onOpenLoraModal: vi.fn(),
    onBlurSave: vi.fn(),
    ...overrides,
  };
}

describe('PerPhaseCard', () => {
  it('updates step and guidance fields via slider/number controls', () => {
    const props = buildProps();
    render(<PerPhaseCard {...props} />);

    fireEvent.change(screen.getByLabelText('steps_0'), { target: { value: '9' } });
    expect(props.onPhaseConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        steps_per_phase: [9, 5],
      }),
    );

    fireEvent.change(screen.getByLabelText('guidance_scale_0'), { target: { value: '2.4' } });
    expect(props.onPhaseConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phases: expect.arrayContaining([
          expect.objectContaining({ guidance_scale: 2.4 }),
        ]),
      }),
    );
  });

  it('calls lora modal opener and adds predefined utility lora', () => {
    const props = buildProps();
    render(<PerPhaseCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Search/i }));
    expect(props.onOpenLoraModal).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByRole('button', { name: 'Utility Lora' }));
    expect(props.onPhaseConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phases: [
          expect.objectContaining({
            loras: [
              { url: 'https://hf.co/valid', multiplier: '0.7' },
              { url: 'https://hf.co/invalid', multiplier: '1.0' },
              { url: 'https://hf.co/utility', multiplier: '1.0' },
            ],
          }),
          expect.anything(),
        ],
      }),
    );
  });

  it('updates lora URL and runs focus/blur callbacks for lora input', () => {
    const props = buildProps();
    render(<PerPhaseCard {...props} />);

    const loraInput = screen.getAllByPlaceholderText('LoRA URL')[0];
    fireEvent.focus(loraInput);
    expect(props.onFocusLoraInput).toHaveBeenCalledWith('lora-0-0');

    fireEvent.change(loraInput, { target: { value: 'https://hf.co/new-url' } });
    expect(props.onPhaseConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phases: [
          expect.objectContaining({
            loras: expect.arrayContaining([
              expect.objectContaining({ url: 'https://hf.co/new-url' }),
            ]),
          }),
          expect.anything(),
        ],
      }),
    );

    fireEvent.blur(loraInput);
    expect(props.onFocusLoraInput).toHaveBeenCalledWith(null);
    expect(props.onBlurSave).toHaveBeenCalledTimes(1);
  });

  it('shows validation warning for invalid lora URLs', () => {
    const props = buildProps();
    render(<PerPhaseCard {...props} />);

    expect(screen.getByText('Invalid Hugging Face URL')).toBeInTheDocument();
  });

  it('removes a lora entry and appends a blank lora row', () => {
    const props = buildProps();
    const { container } = render(<PerPhaseCard {...props} />);

    const deleteButton = container.querySelector('button.h-7.w-7');
    expect(deleteButton).not.toBeNull();

    fireEvent.click(deleteButton as HTMLButtonElement);
    expect(props.onPhaseConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phases: [
          expect.objectContaining({
            loras: [
              { url: 'https://hf.co/invalid', multiplier: '1.0' },
              { url: '', multiplier: '1.0' },
            ],
          }),
          expect.anything(),
        ],
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: '+ Add LoRA' }));
    expect(props.onPhaseConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phases: [
          expect.objectContaining({
            loras: [
              { url: 'https://hf.co/valid', multiplier: '0.7' },
              { url: 'https://hf.co/invalid', multiplier: '1.0' },
              { url: '', multiplier: '1.0' },
            ],
          }),
          expect.anything(),
        ],
      }),
    );
  });
});
