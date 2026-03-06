import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { mockGetUser, mockSingle } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSingle: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockSingle,
        })),
      })),
    })),
  }),
}));

vi.mock('@/shared/hooks/settings/useToolSettings', () => ({
  updateToolSettingsSupabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/lib/compat/errorHandler', () => ({
  handleError: vi.fn(),
}));

import { useUserUIState } from '../useUserUIState';

describe('useUserUIState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockSingle.mockResolvedValue({
      data: {
        settings: {
          ui: {
            paneLocks: { shots: false, tasks: false, gens: false },
            theme: { darkMode: true },
          },
        },
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns fallback value initially', () => {
    const fallback = { darkMode: true };
    const { result } = renderHook(() => useUserUIState('theme', fallback));

    expect(result.current.value).toEqual(fallback);
    expect(result.current.isLoading).toBe(true);
    expect(typeof result.current.update).toBe('function');
  });

  it('loads value from database', async () => {
    const fallback = { darkMode: false };
    const { result } = renderHook(() => useUserUIState('theme', fallback));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.value.darkMode).toBe(true);
  });

  it('uses fallback when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const fallback = { darkMode: true };
    const { result } = renderHook(() => useUserUIState('theme', fallback));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.value).toEqual(fallback);
  });

  it('update changes local value immediately', async () => {
    const fallback = { darkMode: true };
    const { result } = renderHook(() => useUserUIState('theme', fallback));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.update({ darkMode: false });
    });

    expect(result.current.value.darkMode).toBe(false);
  });

  it('uses fallback when database returns error', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'DB error' },
    });

    const fallback = { darkMode: true };
    const { result } = renderHook(() => useUserUIState('theme', fallback));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('normalizes generationMethods when both are true', async () => {
    mockSingle.mockResolvedValue({
      data: {
        settings: {
          ui: {
            generationMethods: { inCloud: true, onComputer: true },
          },
        },
      },
      error: null,
    });

    const fallback = { inCloud: true, onComputer: false };
    const { result } = renderHook(() =>
      useUserUIState('generationMethods', fallback)
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Should normalize: both true → inCloud: true, onComputer: false
    expect(result.current.value.inCloud).toBe(true);
    expect(result.current.value.onComputer).toBe(false);
  });
});
