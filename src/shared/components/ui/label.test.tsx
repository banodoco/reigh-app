import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Label } from './label';

describe('Label', () => {
  it('renders label text and forwards htmlFor', () => {
    render(<Label htmlFor="prompt-input">Prompt</Label>);
    const label = screen.getByText('Prompt');

    expect(label.tagName.toLowerCase()).toBe('label');
    expect(label).toHaveAttribute('for', 'prompt-input');
  });

  it('merges base styles with caller-provided class names', () => {
    render(<Label className="custom-class">Custom</Label>);
    const label = screen.getByText('Custom');

    expect(label.className).toContain('custom-class');
    expect(label.className).toContain('text-sm');
  });
});
