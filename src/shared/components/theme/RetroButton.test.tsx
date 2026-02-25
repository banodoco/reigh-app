import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RetroButton } from './RetroButton';

describe('RetroButton', () => {
  it('applies retro policy classes', () => {
    render(<RetroButton variant="retro" size="retro-sm">Retro</RetroButton>);
    const button = screen.getByRole('button', { name: 'Retro' });

    expect(button.className).toContain('bg-retro');
    expect(button.className).toContain('font-heading');
  });

  it('passes through core variants for non-retro usage', () => {
    render(<RetroButton variant="destructive">Delete</RetroButton>);
    const button = screen.getByRole('button', { name: 'Delete' });

    expect(button.className).toContain('bg-destructive');
  });
});
