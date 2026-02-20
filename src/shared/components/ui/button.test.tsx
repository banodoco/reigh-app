import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders a native button and merges caller classes', () => {
    render(<Button className="custom-class">Submit</Button>);
    const button = screen.getByRole('button', { name: 'Submit' });

    expect(button.tagName.toLowerCase()).toBe('button');
    expect(button.className).toContain('custom-class');
    expect(button.className).toContain('inline-flex');
  });

  it('maps legacy variant and size aliases to modern styles', () => {
    render(<Button variant="lala" size="lala-sm">Legacy</Button>);
    const button = screen.getByRole('button', { name: 'Legacy' });

    expect(button.className).toContain('theme-button');
    expect(button.className).toContain('h-9');
  });

  it('supports asChild rendering', () => {
    render(
      <Button asChild>
        <a href="/docs">Docs</a>
      </Button>,
    );

    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs');
  });
});
