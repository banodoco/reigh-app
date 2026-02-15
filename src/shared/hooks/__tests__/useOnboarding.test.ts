import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockGetUser = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
    },
    from: vi.fn((_table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: () => mockSelect(),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => mockUpdate()),
      })),
    })),
  },
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

import { useOnboarding } from '../useOnboarding';

describe('useOnboarding', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show modal initially', () => {
    mockSelect.mockResolvedValue({ data: { onboarding_completed: true }, error: null });
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.showOnboardingModal).toBe(false);
  });

  it('shows modal when onboarding not completed after delay', async () => {
    mockSelect.mockResolvedValue({ data: { onboarding_completed: false }, error: null });
    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(result.current.showOnboardingModal).toBe(true);
  });

  it('does not show modal when no user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(result.current.showOnboardingModal).toBe(false);
  });

  it('closeOnboardingModal hides modal', async () => {
    mockSelect.mockResolvedValue({ data: { onboarding_completed: false }, error: null });
    mockUpdate.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(result.current.showOnboardingModal).toBe(true);

    act(() => {
      result.current.closeOnboardingModal();
    });

    expect(result.current.showOnboardingModal).toBe(false);
  });
});
