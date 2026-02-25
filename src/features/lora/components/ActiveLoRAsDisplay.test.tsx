import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ActiveLoRAsDisplay } from './ActiveLoRAsDisplay';

vi.mock('@/shared/components/HoverScrubVideo', () => ({
  default: () => <div data-testid="hover-scrub-video" />,
}));

vi.mock('@/shared/components/ui/slider-with-value', () => ({
  SliderWithValue: ({ onChange }: { onChange: (value: number) => void }) => (
    <button type="button" onClick={() => onChange(1.25)}>
      set strength
    </button>
  ),
}));

describe('ActiveLoRAsDisplay', () => {
  it('renders empty state when no loras are selected', () => {
    render(
      <ActiveLoRAsDisplay
        selectedLoras={[]}
        onRemoveLora={vi.fn()}
        onLoraStrengthChange={vi.fn()}
      />,
    );

    expect(screen.getByText('None selected')).toBeInTheDocument();
  });

  it('supports remove, trigger-word add, and strength updates', () => {
    const onRemoveLora = vi.fn();
    const onLoraStrengthChange = vi.fn();
    const onAddTriggerWord = vi.fn();

    const { container } = render(
      <ActiveLoRAsDisplay
        selectedLoras={[
          {
            id: 'lora-1',
            name: 'Portrait LoRA',
            path: 'https://example.com/portrait.safetensors',
            strength: 0.8,
            trigger_word: 'portrait-style',
            previewImageUrl: 'https://example.com/preview.png',
          },
        ]}
        availableLoras={[]}
        onRemoveLora={onRemoveLora}
        onLoraStrengthChange={onLoraStrengthChange}
        onAddTriggerWord={onAddTriggerWord}
      />,
    );

    expect(screen.getByText(/Trigger words:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'set strength' }));
    expect(onLoraStrengthChange).toHaveBeenCalledWith('lora-1', 1.25);

    const addTriggerButton = container.querySelector('button.ml-1');
    const removeButton = container.querySelector('button.text-destructive');
    expect(addTriggerButton).toBeTruthy();
    expect(removeButton).toBeTruthy();

    fireEvent.click(addTriggerButton as HTMLButtonElement);
    fireEvent.click(removeButton as HTMLButtonElement);

    expect(onAddTriggerWord).toHaveBeenCalledWith('portrait-style');
    expect(onRemoveLora).toHaveBeenCalledWith('lora-1');
  });
});
