import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Toaster, toast } from './sonner';

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

describe('sonner', () => {
  it('renders toaster viewport', () => {
    render(<Toaster limit={2} timeout={1234} />);
    const viewport = document.body.querySelector('.fixed.bottom-0.right-0');
    expect(viewport).toBeTruthy();
  });

  it('exposes toast helpers that return toast ids', () => {
    const id1 = toast('Saved');
    const id2 = toast.success('Done');
    const id3 = toast.error('Failed');

    expect(typeof id1).toBe('string');
    expect(typeof id2).toBe('string');
    expect(typeof id3).toBe('string');
    expect(id1.length).toBeGreaterThan(0);
  });
});
