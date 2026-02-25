import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BulkEditControls } from '../BulkEditControls';

vi.mock('@/shared/components/ui/textarea', () => ({
  Textarea: (props: Record<string, unknown>) => (
    <textarea {...props} />
  ),
}));

describe('BulkEditControls', () => {
  it('shows empty-state message when there are no prompts to edit', () => {
    render(
      <BulkEditControls
        onBulkEdit={vi.fn().mockResolvedValue(undefined)}
        isEditing={false}
        hasApiKey
        numberOfPromptsToEdit={0}
      />,
    );

    expect(screen.getByText('No prompts available in the list to bulk edit.')).toBeInTheDocument();
  });

  it('submits bulk edit with hydrated instructions', async () => {
    const onBulkEdit = vi.fn().mockResolvedValue(undefined);

    render(
      <BulkEditControls
        onBulkEdit={onBulkEdit}
        isEditing={false}
        hasApiKey
        numberOfPromptsToEdit={2}
        initialValues={{ editInstructions: 'Make all prompts shorter' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply to All 2 Prompts' }));

    await waitFor(() => {
      expect(onBulkEdit).toHaveBeenCalledWith({
        editInstructions: 'Make all prompts shorter',
        modelType: 'smart',
      });
    });
  });
});
