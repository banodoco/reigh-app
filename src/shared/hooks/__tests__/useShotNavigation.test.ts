import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockNavigate = vi.fn();
const mockSetCurrentShotId = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/shared/contexts/CurrentShotContext', () => ({
  useCurrentShot: () => ({
    setCurrentShotId: mockSetCurrentShotId,
    currentShotId: null,
  }),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/shared/lib/toolConstants', () => ({
  TOOL_ROUTES: { TRAVEL_BETWEEN_IMAGES: '/travel' },
  travelShotUrl: (shotId: string) => `/travel#shot=${shotId}`,
}));

import { useShotNavigation } from '../useShotNavigation';
import type { Shot } from '@/types/shots';

describe('useShotNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeShot = (id: string): Shot => ({
    id,
    name: `Shot ${id}`,
    images: [],
    position: 0,
    created_at: new Date().toISOString(),
    project_id: 'proj-1',
  });

  it('returns navigation functions', () => {
    const { result } = renderHook(() => useShotNavigation());
    expect(typeof result.current.navigateToShot).toBe('function');
    expect(typeof result.current.navigateToShotEditor).toBe('function');
    expect(typeof result.current.navigateToNextShot).toBe('function');
    expect(typeof result.current.navigateToPreviousShot).toBe('function');
  });

  it('navigateToShot sets current shot and navigates', () => {
    const { result } = renderHook(() => useShotNavigation());
    const shot = makeShot('shot-1');

    act(() => {
      result.current.navigateToShot(shot);
    });

    expect(mockSetCurrentShotId).toHaveBeenCalledWith('shot-1');
    expect(mockNavigate).toHaveBeenCalledWith(
      '/travel#shot=shot-1',
      expect.objectContaining({
        state: expect.objectContaining({ fromShotClick: true }),
      })
    );
  });

  it('navigateToShotEditor clears shot and navigates', () => {
    const { result } = renderHook(() => useShotNavigation());

    act(() => {
      result.current.navigateToShotEditor();
    });

    expect(mockSetCurrentShotId).toHaveBeenCalledWith(null);
    expect(mockNavigate).toHaveBeenCalledWith('/travel', expect.anything());
  });

  it('navigateToNextShot returns true and navigates when next exists', () => {
    const { result } = renderHook(() => useShotNavigation());
    const shots = [makeShot('s1'), makeShot('s2'), makeShot('s3')];

    let success: boolean;
    act(() => {
      success = result.current.navigateToNextShot(shots, shots[0]);
    });

    expect(success!).toBe(true);
    expect(mockSetCurrentShotId).toHaveBeenCalledWith('s2');
  });

  it('navigateToNextShot returns false when at end', () => {
    const { result } = renderHook(() => useShotNavigation());
    const shots = [makeShot('s1'), makeShot('s2')];

    let success: boolean;
    act(() => {
      success = result.current.navigateToNextShot(shots, shots[1]);
    });

    expect(success!).toBe(false);
  });

  it('navigateToPreviousShot returns true and navigates when prev exists', () => {
    const { result } = renderHook(() => useShotNavigation());
    const shots = [makeShot('s1'), makeShot('s2'), makeShot('s3')];

    let success: boolean;
    act(() => {
      success = result.current.navigateToPreviousShot(shots, shots[2]);
    });

    expect(success!).toBe(true);
    expect(mockSetCurrentShotId).toHaveBeenCalledWith('s2');
  });

  it('navigateToPreviousShot returns false when at start', () => {
    const { result } = renderHook(() => useShotNavigation());
    const shots = [makeShot('s1'), makeShot('s2')];

    let success: boolean;
    act(() => {
      success = result.current.navigateToPreviousShot(shots, shots[0]);
    });

    expect(success!).toBe(false);
  });
});
