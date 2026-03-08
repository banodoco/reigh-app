import { fireEvent, render, screen } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { JoinClipsPromptSettings } from './JoinClipsPromptSettings';

vi.mock('@/shared/components/ui/primitives/label', () => ({
  Label: ({ children, ...props }: Record<string, unknown>) => <label {...props}>{children}</label>,
}));

vi.mock('@/shared/components/ui/switch', () => ({
  Switch: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (value: boolean) => void;
  }) => (
    <input
      id={id}
      type="checkbox"
      role="switch"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
    />
  ),
}));

vi.mock('@/shared/components/ui/textarea', () => ({
  Textarea: ({
    id,
    value,
    placeholder,
    onChange,
    onClear,
    onVoiceResult,
  }: {
    id: string;
    value: string;
    placeholder?: string;
    onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void;
    onClear?: () => void;
    onVoiceResult?: (result: { prompt?: string; transcription?: string }) => void;
  }) => (
    <div>
      <textarea
        id={id}
        aria-label={id}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
      />
      <button type="button" onClick={onClear}>clear-{id}</button>
      <button
        type="button"
        onClick={() => onVoiceResult?.({ prompt: `voice-${id}` })}
      >
        voice-{id}
      </button>
    </div>
  ),
}));

vi.mock('@/shared/components/ImageGenerationForm/components/SectionHeader', () => ({
  SectionHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));

describe('JoinClipsPromptSettings', () => {
  it('renders prompt controls and wires text/voice/clear handlers plus individual toggle', () => {
    const setPrompt = vi.fn();
    const setNegativePrompt = vi.fn();
    const setUseIndividualPrompts = vi.fn();
    const setEnhancePrompt = vi.fn();

    render(
      <JoinClipsPromptSettings
        prompt="existing prompt"
        setPrompt={setPrompt}
        negativePrompt="existing negative"
        setNegativePrompt={setNegativePrompt}
        useIndividualPrompts
        setUseIndividualPrompts={setUseIndividualPrompts}
        clipCount={3}
        enhancePrompt={false}
        setEnhancePrompt={setEnhancePrompt}
      />,
    );

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Set individually')).toBeInTheDocument();

    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);
    expect(setUseIndividualPrompts).toHaveBeenCalledWith(false);

    const globalPrompt = screen.getByLabelText('join-prompt');
    fireEvent.change(globalPrompt, { target: { value: 'next prompt' } });
    expect(setPrompt).toHaveBeenCalledWith('next prompt');
    expect(globalPrompt).toHaveAttribute(
      'placeholder',
      'Appended to each individual transition prompt',
    );

    fireEvent.click(screen.getByText('clear-join-prompt'));
    fireEvent.click(screen.getByText('voice-join-prompt'));
    expect(setPrompt).toHaveBeenCalledWith('');
    expect(setPrompt).toHaveBeenCalledWith('voice-join-prompt');
    expect(screen.getByText('💡 This will be inserted after each individual prompt')).toBeInTheDocument();

    const negativePrompt = screen.getByLabelText('join-negative-prompt');
    fireEvent.change(negativePrompt, { target: { value: 'no blur' } });
    fireEvent.click(screen.getByText('clear-join-negative-prompt'));
    fireEvent.click(screen.getByText('voice-join-negative-prompt'));
    expect(setNegativePrompt).toHaveBeenCalledWith('no blur');
    expect(setNegativePrompt).toHaveBeenCalledWith('');
    expect(setNegativePrompt).toHaveBeenCalledWith('voice-join-negative-prompt');

    fireEvent.click(switches[1]);
    expect(setEnhancePrompt).toHaveBeenCalledWith(true);
  });

  it('hides individual toggle when clip count is low and supports optional enhancer callback', () => {
    const setPrompt = vi.fn();
    const setNegativePrompt = vi.fn();

    render(
      <JoinClipsPromptSettings
        prompt=""
        setPrompt={setPrompt}
        negativePrompt=""
        setNegativePrompt={setNegativePrompt}
        useIndividualPrompts={false}
        clipCount={2}
        enhancePrompt={true}
      />,
    );

    expect(screen.queryByText('Set individually')).not.toBeInTheDocument();
    expect(screen.getByLabelText('join-prompt')).toHaveAttribute(
      'placeholder',
      'Describe what you want for all transitions',
    );

    expect(() => {
      fireEvent.click(screen.getByRole('switch'));
    }).not.toThrow();
  });
});
