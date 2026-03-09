import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JoinClipsGenerateButton } from './JoinClipsGenerateButton';

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => <button {...props}>{children}</button>,
}));

vi.mock('lucide-react', () => ({
  Check: () => <svg data-testid="icon-check" />,
  Film: () => <svg data-testid="icon-film" />,
  Loader2: () => <svg data-testid="icon-loader" />,
}));

describe('JoinClipsGenerateButton', () => {
  it('renders idle state and calls onGenerate when clicked', () => {
    const onGenerate = vi.fn();

    render(
      <JoinClipsGenerateButton
        onGenerate={onGenerate}
        isGenerating={false}
        generateSuccess={false}
        generateButtonText="Generate Transition"
        isGenerateDisabled={false}
      />,
    );

    expect(screen.getByTestId('icon-film')).toBeInTheDocument();
    expect(screen.getByText('Generate Transition')).toBeInTheDocument();
    const button = screen.getByRole('button');
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('disables button and swaps icon/text for generating and success states', () => {
    const { rerender } = render(
      <JoinClipsGenerateButton
        onGenerate={vi.fn()}
        isGenerating
        generateSuccess={false}
        generateButtonText="Generate Transition"
        isGenerateDisabled={false}
      />,
    );

    expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-film')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();

    rerender(
      <JoinClipsGenerateButton
        onGenerate={vi.fn()}
        isGenerating={false}
        generateSuccess
        generateButtonText="Generate Transition"
        isGenerateDisabled={false}
      />,
    );

    expect(screen.getByTestId('icon-check')).toBeInTheDocument();
    expect(screen.getByText('Task Created')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
