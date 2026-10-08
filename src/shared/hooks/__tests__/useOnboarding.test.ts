import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const {
  mockGetUser,
  mockSelect,
  mockUpdate,
  mockGetSupabaseClient,
  isDeferredCloudDataAuthorityMock,
  checkAvailabilityMock,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockGetSupabaseClient: vi.fn(),
  isDeferredCloudDataAuthorityMock: vi.fn().mockReturnValue(true),
  checkAvailabilityMock: vi.fn(),
}));

vi.mock('@/integrations/astrid/doctorAvailability.ts', () => ({
  checkAstridDoctorAvailability: checkAvailabilityMock,
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: mockGetSupabaseClient,
}));

vi.mock('@/app/runtime/dataAuthority', () => ({
  isDeferredCloudDataAuthority: isDeferredCloudDataAuthorityMock,
}));

import { ASTRID_SETUP_COMPLETE_KEY, useOnboarding } from '../useOnboarding';

// An in-memory store, so these tests don't depend on the environment's own localStorage.
const memoryStorage = (() => {
  let items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, String(value)); },
    removeItem: (key: string) => { items.delete(key); },
    clear: () => { items = new Map(); },
  };
})();
Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage });

describe('useOnboarding', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    window.localStorage.removeItem(ASTRID_SETUP_COMPLETE_KEY);
    checkAvailabilityMock.mockResolvedValue({ status: 'available' });
    isDeferredCloudDataAuthorityMock.mockReturnValue(true);
    window.history.replaceState({}, '', '/');
    mockGetSupabaseClient.mockReturnValue({
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
    });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState({}, '', '/');
  });

  it('does not show modal initially', () => {
    mockSelect.mockResolvedValue({ data: { onboarding_completed: true }, error: null });
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.showOnboardingModal).toBe(false);
  });

  it('never initializes Supabase in deterministic local-test mode', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?localTest=1');
    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(result.current.showOnboardingModal).toBe(false);
    expect(mockGetSupabaseClient).not.toHaveBeenCalled();

    act(() => result.current.closeOnboardingModal());
    expect(mockGetSupabaseClient).not.toHaveBeenCalled();
  });

  it('keeps the setup popup in local editor test links and persists completion', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?localProject=demo-project&localTimeline=demo-timeline&localTest=1');

    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(result.current.showOnboardingModal).toBe(true);
    expect(result.current.onboardingMode).toBe('first-run');
    expect(mockGetSupabaseClient).not.toHaveBeenCalled();

    act(() => result.current.closeOnboardingModal());
    expect(window.localStorage.getItem(ASTRID_SETUP_COMPLETE_KEY)).toBe('true');
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

  it('does not probe Supabase in local Astrid editor mode, and asks a new install to set up', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?localProject=demo-project&localTimeline=demo-timeline');

    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(result.current.showOnboardingModal).toBe(true);
    expect(result.current.onboardingMode).toBe('first-run');
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('does not probe Supabase under default Astrid authority', async () => {
    isDeferredCloudDataAuthorityMock.mockReturnValue(false);
    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(result.current.showOnboardingModal).toBe(true);
    expect(mockGetSupabaseClient).not.toHaveBeenCalled();

    act(() => result.current.closeOnboardingModal());
    expect(mockGetSupabaseClient).not.toHaveBeenCalled();
  });

  it('keeps showing first-run setup on every launch until it is finished', async () => {
    isDeferredCloudDataAuthorityMock.mockReturnValue(false);
    const first = renderHook(() => useOnboarding());
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(first.result.current.onboardingMode).toBe('first-run');
    first.unmount();

    const second = renderHook(() => useOnboarding());
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(second.result.current.showOnboardingModal).toBe(true);

    act(() => second.result.current.closeOnboardingModal());
    expect(window.localStorage.getItem(ASTRID_SETUP_COMPLETE_KEY)).toBe('true');
  });

  it('asks a set-up install to restart its Runtime when it is not running', async () => {
    isDeferredCloudDataAuthorityMock.mockReturnValue(false);
    window.localStorage.setItem(ASTRID_SETUP_COMPLETE_KEY, 'true');
    checkAvailabilityMock.mockResolvedValue({ status: 'unavailable', reason: 'bridge health unavailable' });

    const { result } = renderHook(() => useOnboarding());
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    expect(result.current.showOnboardingModal).toBe(true);
    expect(result.current.onboardingMode).toBe('reconnect');
  });

  it('stays out of the way once set up and the Runtime is running', async () => {
    isDeferredCloudDataAuthorityMock.mockReturnValue(false);
    window.localStorage.setItem(ASTRID_SETUP_COMPLETE_KEY, 'true');

    const { result } = renderHook(() => useOnboarding());
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

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
