import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { DeleteGenerationConfirmDialog } from './DeleteGenerationConfirmDialog';

const confirmDialogSpy = vi.fn();

vi.mock('./ConfirmDialog', () => ({
  ConfirmDialog: (props: unknown) => {
    confirmDialogSpy(props);
    return null;
  },
}));

describe('DeleteGenerationConfirmDialog', () => {
  beforeEach(() => {
    confirmDialogSpy.mockClear();
  });

  it('maps contract props to destructive confirm dialog props', () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteGenerationConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        isConfirming={true}
      />,
    );

    expect(confirmDialogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        open: true,
        onOpenChange,
        onConfirm,
        isLoading: true,
        title: 'Delete Generation',
        description: 'Are you sure you want to delete this generation? This action cannot be undone.',
        confirmText: 'Delete',
        destructive: true,
      }),
    );
  });
});
