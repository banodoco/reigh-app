// @vitest-environment jsdom

import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteGenerationConfirmDialog } from './DeleteGenerationConfirmDialog';

const confirmDialogSpy = vi.fn();

vi.mock('./ConfirmDialog', () => ({
  ConfirmDialog: (props: Record<string, unknown>) => {
    confirmDialogSpy(props);
    return <div data-testid="confirm-dialog-stub" />;
  },
}));

describe('DeleteGenerationConfirmDialog', () => {
  it('passes the destructive delete contract through to ConfirmDialog', () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteGenerationConfirmDialog
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        isConfirming
      />,
    );

    expect(confirmDialogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        open: true,
        onOpenChange,
        onConfirm,
        isLoading: true,
        title: 'Delete Generation',
        confirmText: 'Delete',
        destructive: true,
        description:
          'Are you sure you want to delete this generation? This action cannot be undone.',
      }),
    );
  });
});
