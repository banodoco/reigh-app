import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LoraModel } from '@/domains/lora/types/lora';
import { AdvancedSettingsLoraModal } from '../AdvancedSettingsLoraModal';

const mockLoraSelectorModal = vi.fn();

vi.mock('@/domains/lora/components', () => ({
  LoraSelectorModal: (props: Record<string, unknown>) => {
    mockLoraSelectorModal(props);
    return <div data-testid="lora-selector-modal" />;
  },
}));

function buildLora(overrides: Partial<LoraModel> = {}): LoraModel {
  return {
    'Model ID': 'model-1',
    Name: 'LoRA 1',
    Author: 'Author',
    Images: [],
    'Model Files': [{ path: '/models/lora-1.safetensors', url: 'https://example.com/lora-1.safetensors' }],
    ...overrides,
  };
}

describe('AdvancedSettingsLoraModal', () => {
  it('passes through modal callbacks and maps selected loras by id/path', () => {
    const onClose = vi.fn();
    const onAddLora = vi.fn();
    const onRemoveLora = vi.fn();
    const onUpdateLoraStrength = vi.fn();

    const availableLoras: LoraModel[] = [
      buildLora({ 'Model ID': 'lora-a', Name: 'LoRA A', path: '/id-match.safetensors' }),
      buildLora({ 'Model ID': 'lora-b', Name: 'LoRA B', path: '/path-match.safetensors' }),
    ];

    render(
      <AdvancedSettingsLoraModal
        isOpen={true}
        onClose={onClose}
        availableLoras={availableLoras}
        effectiveLoras={[
          { id: 'lora-a', name: 'Selected A', path: '/id-match.safetensors', strength: 0.4 },
          { id: 'missing-id', name: 'Selected B', path: '/path-match.safetensors', strength: 0.9 },
        ]}
        onAddLora={onAddLora}
        onRemoveLora={onRemoveLora}
        onUpdateLoraStrength={onUpdateLoraStrength}
      />,
    );

    expect(screen.getByTestId('lora-selector-modal')).toBeInTheDocument();
    expect(mockLoraSelectorModal).toHaveBeenCalledTimes(1);

    const passedProps = mockLoraSelectorModal.mock.calls[0][0];
    expect(passedProps.isOpen).toBe(true);
    expect(passedProps.onClose).toBe(onClose);
    expect(passedProps.loras).toEqual(availableLoras);
    expect(passedProps.onAddLora).toBe(onAddLora);
    expect(passedProps.onRemoveLora).toBe(onRemoveLora);
    expect(passedProps.onUpdateLoraStrength).toBe(onUpdateLoraStrength);
    expect(passedProps.lora_type).toBe('Wan I2V');

    expect(passedProps.selectedLoras).toEqual([
      expect.objectContaining({
        'Model ID': 'lora-a',
        Name: 'Selected A',
        strength: 0.4,
      }),
      expect.objectContaining({
        'Model ID': 'missing-id',
        Name: 'Selected B',
        strength: 0.9,
      }),
    ]);
  });

  it('still builds selected loras when no full lora metadata exists', () => {
    render(
      <AdvancedSettingsLoraModal
        isOpen={false}
        onClose={vi.fn()}
        availableLoras={[]}
        effectiveLoras={[{ id: 'unknown', name: 'Unknown LoRA', path: '/unknown', strength: 1.2 }]}
        onAddLora={vi.fn()}
        onRemoveLora={vi.fn()}
        onUpdateLoraStrength={vi.fn()}
      />,
    );

    const passedProps = mockLoraSelectorModal.mock.calls[1][0];
    expect(passedProps.isOpen).toBe(false);
    expect(passedProps.selectedLoras).toEqual([
      expect.objectContaining({
        'Model ID': 'unknown',
        Name: 'Unknown LoRA',
        strength: 1.2,
      }),
    ]);
  });
});
