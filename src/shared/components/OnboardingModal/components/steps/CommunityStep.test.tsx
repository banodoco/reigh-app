import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/components/ui/dialog', () => ({
  DialogHeader: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  DialogTitle: ({ children, className }: { children: ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
}));

import { CommunityStep } from './CommunityStep';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CommunityStep', () => {
  it('renders community copy and both actions', () => {
    render(<CommunityStep onNext={vi.fn()} />);

    expect(screen.getByText('Join Our Community')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join Discord Community' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue Setup' })).toBeInTheDocument();
    expect(screen.getByText(/hardest part is not/i)).toBeInTheDocument();
  });

  it('opens Discord invite in a new tab when join button is clicked', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<CommunityStep onNext={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Join Discord Community' }));

    expect(openSpy).toHaveBeenCalledWith('https://discord.gg/D5K2c6kfhy', '_blank');
  });

  it('calls onNext when continue setup is clicked', () => {
    const onNext = vi.fn();

    render(<CommunityStep onNext={onNext} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue Setup' }));

    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
