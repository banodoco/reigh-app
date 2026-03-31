import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSegmentSlotDeepLinking } from './useSegmentSlotDeepLinking';

const routerMocks = vi.hoisted(() => ({
  useLocation: vi.fn(),
  useNavigate: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useLocation: routerMocks.useLocation,
    useNavigate: routerMocks.useNavigate,
  };
});

interface BuildInputOptions {
  locationState?: unknown;
  segmentSlotLightboxIndex?: number | null;
  pairDataByIndex?: Map<number, unknown>;
  slotByIndex?: Map<number, unknown>;
}

function buildInput(options: BuildInputOptions = {}) {
  const navigate = vi.fn();
  routerMocks.useNavigate.mockReturnValue(navigate);
  routerMocks.useLocation.mockReturnValue({
    pathname: '/travel',
    hash: '#timeline',
    state: options.locationState ?? null,
  });

  const setSegmentSlotLightboxIndex = vi.fn();
  const setPendingImageToOpen = vi.fn();
  const setPendingImageVariantId = vi.fn();

  const navigateWithTransition = vi.fn((doNavigation: () => void) => {
    doNavigation();
  });

  const state = {
    segmentSlotLightboxIndex: options.segmentSlotLightboxIndex ?? null,
    setSegmentSlotLightboxIndex,
    activePairData: null,
    pendingImageToOpen: null,
    setPendingImageToOpen,
    pendingImageVariantId: null,
    setPendingImageVariantId,
  };

  const props = {
    navigateWithTransition,
  } as never;

  const pairDataByIndex = (options.pairDataByIndex ?? new Map()) as never;
  const slotByIndex = (options.slotByIndex ?? new Map()) as never;

  return {
    hookInput: { props, state, pairDataByIndex, slotByIndex },
    navigate,
    navigateWithTransition,
    setSegmentSlotLightboxIndex,
    setPendingImageToOpen,
    setPendingImageVariantId,
  };
}

describe('useSegmentSlotDeepLinking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears one-time open-image state on first mount without opening lightbox', () => {
    const input = buildInput({
      locationState: {
        openImageGenerationId: 'gen-1',
        openImageVariantId: 'variant-1',
        fromShotClick: true,
      },
    });

    renderHook(() => useSegmentSlotDeepLinking(input.hookInput));

    expect(input.navigate).toHaveBeenCalledWith('/travel#timeline', {
      replace: true,
      state: { fromShotClick: true },
    });
    expect(input.navigateWithTransition).not.toHaveBeenCalled();
    expect(input.setPendingImageToOpen).not.toHaveBeenCalled();
  });

  it('opens pending image on subsequent state updates and resets active lightbox state', () => {
    const first = buildInput({ locationState: null, segmentSlotLightboxIndex: 4 });
    const { rerender } = renderHook(() => useSegmentSlotDeepLinking(first.hookInput));

    routerMocks.useLocation.mockReturnValue({
      pathname: '/travel',
      hash: '#timeline',
      state: {
        openImageGenerationId: 'gen-22',
        openImageVariantId: 'variant-22',
        fromShotClick: false,
      },
    });

    rerender();

    expect(first.setSegmentSlotLightboxIndex).toHaveBeenCalledWith(null);
    expect(first.navigateWithTransition).toHaveBeenCalledTimes(1);
    expect(first.setPendingImageToOpen).toHaveBeenCalledWith('gen-22');
    expect(first.setPendingImageVariantId).toHaveBeenCalledWith('variant-22');
    expect(first.navigate).toHaveBeenCalledWith('/travel#timeline', {
      replace: true,
      state: { fromShotClick: false },
    });
  });

  it('opens a matching segment slot when a deep-link target has a rendered child video', () => {
    const pairData = {
      index: 0,
      startImage: { id: 'slot-a' },
    };

    const input = buildInput({
      locationState: {
        openSegmentSlot: 'slot-a',
        fromShotClick: false,
      },
      pairDataByIndex: new Map([[0, pairData]]),
      slotByIndex: new Map([[0, { type: 'child', child: { location: 'https://cdn.example.com/seg.mp4' } }]]),
    });

    renderHook(() => useSegmentSlotDeepLinking(input.hookInput));

    expect(input.setSegmentSlotLightboxIndex).toHaveBeenCalledWith(0);
    expect(input.navigate).toHaveBeenCalledWith('/travel#timeline', {
      replace: true,
      state: { fromShotClick: false },
    });
  });
});
