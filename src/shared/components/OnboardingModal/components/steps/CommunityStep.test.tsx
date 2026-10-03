import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent } from '@/shared/components/ui/dialog';
import { COMMUNITY_STEP_AUTO_CLOSE_MS, CommunityStep } from './CommunityStep';

const renderStep = (onClose = vi.fn()) => {
  render(
    <Dialog open>
      <DialogContent>
        <CommunityStep onNext={vi.fn()} onClose={onClose} />
      </DialogContent>
    </Dialog>,
  );
  return onClose;
};

describe('CommunityStep', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('links to the Discord in a new tab and finishes on "I’m ready"', () => {
    const onClose = renderStep();
    const link = screen.getByRole('link', { name: /join the discord/i });
    expect(link.getAttribute('href')).toContain('discord.gg');
    expect(link.getAttribute('target')).toBe('_blank');
    fireEvent.click(screen.getByRole('button', { name: /i’m ready/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('finishes on its own after the countdown, never holding anyone up', () => {
    const onClose = renderStep();
    act(() => { vi.advanceTimersByTime(COMMUNITY_STEP_AUTO_CLOSE_MS - 500); });
    expect(onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
