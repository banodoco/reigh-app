import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PromptEditorFooter } from './PromptEditorFooter';

vi.mock('@/shared/components/ui/dialog', () => ({
  DialogFooter: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-footer" className={className}>
      {children}
    </div>
  ),
}));

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  PackagePlus: () => <span data-testid="icon-package-plus" />,
  Trash2: () => <span data-testid="icon-trash" />,
}));

describe('PromptEditorFooter', () => {
  it('renders fade overlay and disables delete when only empty prompt exists', () => {
    render(
      <PromptEditorFooter
        showFade={true}
        footerClass="footer-shell"
        isMobile={false}
        prompts={[{ id: 'p1', fullPrompt: '   ', shortPrompt: '   ' }]}
        onAddBlankPrompt={vi.fn()}
        onRemoveAllPrompts={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(document.querySelector('.bg-gradient-to-t')).toBeInTheDocument();
    const deleteButton = screen.getByRole('button', { name: /delete prompts/i });
    expect(deleteButton).toBeDisabled();
  });

  it('fires add/remove/close handlers from footer actions', () => {
    const onAddBlankPrompt = vi.fn();
    const onRemoveAllPrompts = vi.fn();
    const onClose = vi.fn();

    render(
      <PromptEditorFooter
        showFade={false}
        footerClass="footer-shell"
        isMobile={false}
        prompts={[
          { id: 'p1', fullPrompt: 'one', shortPrompt: 'one' },
          { id: 'p2', fullPrompt: 'two', shortPrompt: 'two' },
        ]}
        onAddBlankPrompt={onAddBlankPrompt}
        onRemoveAllPrompts={onRemoveAllPrompts}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /blank prompt/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete prompts/i }));
    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(onAddBlankPrompt).toHaveBeenCalledTimes(1);
    expect(onRemoveAllPrompts).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
