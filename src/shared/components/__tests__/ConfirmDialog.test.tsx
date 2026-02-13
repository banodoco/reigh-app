/**
 * ConfirmDialog Tests
 *
 * Tests for the confirmation dialog component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Are you sure?',
    onConfirm: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with title', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <ConfirmDialog {...defaultProps} description="This action cannot be undone." />
    );
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    render(<ConfirmDialog {...defaultProps} />);
    // AlertDialogDescription should not render
    const descriptions = screen.queryByText('This action cannot be undone.');
    expect(descriptions).toBeNull();
  });

  it('uses default button text', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('uses custom button text', () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        confirmText="Delete"
        cancelText="Nevermind"
      />
    );
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Nevermind')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes dialog when confirm clicked (not loading)', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows Loading text and disables confirm button when isLoading', () => {
    render(<ConfirmDialog {...defaultProps} isLoading />);
    const confirmBtn = screen.getByText('Loading...');
    expect(confirmBtn).toBeDisabled();
    // When loading, the confirm button should be disabled
    // so it cannot be clicked (prevents closing while async action in progress)
  });

  it('calls onCancel and closes when cancel button clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows "Loading..." text when isLoading', () => {
    render(<ConfirmDialog {...defaultProps} isLoading />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('disables buttons when isLoading', () => {
    render(<ConfirmDialog {...defaultProps} isLoading />);
    expect(screen.getByText('Loading...')).toBeDisabled();
    expect(screen.getByText('Cancel')).toBeDisabled();
  });

  it('applies destructive styling when destructive=true', () => {
    render(<ConfirmDialog {...defaultProps} destructive />);
    const confirmButton = screen.getByText('Confirm');
    expect(confirmButton.className).toContain('bg-destructive');
  });

  it('does not render when open=false', () => {
    render(<ConfirmDialog {...defaultProps} open={false} />);
    expect(screen.queryByText('Are you sure?')).toBeNull();
  });
});
