import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopLightboxOverlay } from './DesktopLightboxOverlay';

const mocks = vi.hoisted(() => ({
  mediaLightboxProps: null as Record<string, unknown> | null,
}));

vi.mock('@/shared/components/MediaLightbox', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.mediaLightboxProps = props;
    return <div data-testid="media-lightbox" />;
  },
}));

describe('DesktopLightboxOverlay', () => {
  function buildProps(overrides: Partial<React.ComponentProps<typeof DesktopLightboxOverlay>> = {}) {
    const lightbox = {
      lightboxIndex: 0,
      currentImages: [{ id: 'gen-1', timeline_frame: 12, starred: false }],
      shouldAutoEnterInpaint: false,
      setLightboxIndex: vi.fn(),
      setShouldAutoEnterInpaint: vi.fn(),
      handleNext: vi.fn(),
      handlePrevious: vi.fn(),
    };
    const optimistic = { optimisticOrder: [] };
    const externalGens = {
      derivedNavContext: null,
      setDerivedNavContext: vi.fn(),
      setTempDerivedGenerations: vi.fn(),
      setExternalGenLightboxSelectedShot: vi.fn(),
      externalGenLightboxSelectedShot: 'external-shot',
      handleOpenExternalGeneration: vi.fn(),
      handleExternalGenAddToShot: vi.fn(),
      handleExternalGenAddToShotWithoutPosition: vi.fn(),
    };
    const managerProps = {
      shotId: 'shot-1',
      selectedShotId: 'shot-1',
      images: [{ id: 'gen-1' }],
      readOnly: false,
      onImageDelete: vi.fn(),
      onMagicEdit: vi.fn(),
      allShots: [],
      onShotChange: vi.fn(),
      onAddToShot: vi.fn(),
      onAddToShotWithoutPosition: vi.fn(),
      onCreateShot: vi.fn(),
      toolTypeOverride: undefined,
    };

    return {
      lightbox: lightbox as never,
      optimistic: optimistic as never,
      externalGens: externalGens as never,
      managerProps: managerProps as never,
      lightboxSelectedShotId: undefined,
      setLightboxSelectedShotId: vi.fn(),
      taskDetailsData: undefined,
      capturedVariantIdRef: { current: 'variant-1' },
      showTickForImageId: null,
      onShowTick: vi.fn(),
      showTickForSecondaryImageId: null,
      onShowSecondaryTick: vi.fn(),
      onNavigateToShot: vi.fn(),
      adjacentSegments: undefined,
      ...overrides,
    } as React.ComponentProps<typeof DesktopLightboxOverlay>;
  }

  it('returns null when there is no active lightbox image', () => {
    const { container } = render(
      <DesktopLightboxOverlay
        {...buildProps({
          lightbox: { lightboxIndex: null, currentImages: [] } as never,
        })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('passes navigation and delete behavior for in-shot media', () => {
    const props = buildProps();
    render(<DesktopLightboxOverlay {...props} />);
    expect(screen.getByTestId('media-lightbox')).toBeInTheDocument();

    const mediaLightboxProps = mocks.mediaLightboxProps!;
    expect(mediaLightboxProps).toEqual(
      expect.objectContaining({
        hasNext: false,
        hasPrevious: false,
        selectedShotId: 'shot-1',
        positionedInSelectedShot: true,
        associatedWithoutPositionInSelectedShot: false,
      }),
    );

    (mediaLightboxProps.onDelete as () => void)();
    expect(props.managerProps.onImageDelete).toHaveBeenCalledWith('gen-1');

    (mediaLightboxProps.onNavigateToGeneration as (id: string) => void)('gen-1');
    expect(props.lightbox.setLightboxIndex).toHaveBeenCalledWith(0);
  });

  it('cleans up external-generation state on close and rebinds selected shot', () => {
    const props = buildProps({
      lightbox: {
        lightboxIndex: 1,
        currentImages: [
          { id: 'gen-1', timeline_frame: 10 },
          { id: 'ext-1', timeline_frame: null, shot_id: 'external-shot' },
        ],
        shouldAutoEnterInpaint: true,
        setLightboxIndex: vi.fn(),
        setShouldAutoEnterInpaint: vi.fn(),
        handleNext: vi.fn(),
        handlePrevious: vi.fn(),
      } as never,
      managerProps: {
        ...buildProps().managerProps,
        images: [{ id: 'gen-1' }],
      } as never,
    });
    render(<DesktopLightboxOverlay {...props} />);

    const mediaLightboxProps = mocks.mediaLightboxProps!;
    expect(mediaLightboxProps.selectedShotId).toBe('external-shot');

    (mediaLightboxProps.onClose as () => void)();

    expect(props.capturedVariantIdRef.current).toBeNull();
    expect(props.lightbox.setLightboxIndex).toHaveBeenCalledWith(null);
    expect(props.lightbox.setShouldAutoEnterInpaint).toHaveBeenCalledWith(false);
    expect(props.externalGens.setDerivedNavContext).toHaveBeenCalledWith(null);
    expect(props.externalGens.setTempDerivedGenerations).toHaveBeenCalledWith([]);
    expect(props.externalGens.setExternalGenLightboxSelectedShot).toHaveBeenCalledWith('shot-1');
    expect(props.setLightboxSelectedShotId).toHaveBeenCalledWith('shot-1');
  });
});
