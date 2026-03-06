/**
 * LightboxStateContext Tests
 *
 * Tests for the lightbox state context and safe hooks.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  LightboxStateProvider,
  useLightboxCoreSafe,
  useLightboxMediaSafe,
  useLightboxVariantsSafe,
  useLightboxNavigationSafe,
} from '../LightboxStateContext';

describe('LightboxStateContext', () => {
  describe('safe hooks outside provider', () => {
    it('useLightboxCoreSafe returns defaults outside provider', () => {
      function Consumer() {
        const core = useLightboxCoreSafe();
        return (
          <div>
            <span data-testid="readOnly">{String(core.readOnly)}</span>
            <span data-testid="isMobile">{String(core.isMobile)}</span>
            <span data-testid="selectedProjectId">{String(core.selectedProjectId)}</span>
          </div>
        );
      }

      render(<Consumer />);
      expect(screen.getByTestId('readOnly')).toHaveTextContent('true');
      expect(screen.getByTestId('isMobile')).toHaveTextContent('false');
      expect(screen.getByTestId('selectedProjectId')).toHaveTextContent('null');
    });

    it('useLightboxMediaSafe returns defaults outside provider', () => {
      function Consumer() {
        const media = useLightboxMediaSafe();
        return (
          <div>
            <span data-testid="isVideo">{String(media.isVideo)}</span>
            <span data-testid="effectiveMediaUrl">{media.effectiveMediaUrl || 'empty'}</span>
          </div>
        );
      }

      render(<Consumer />);
      expect(screen.getByTestId('isVideo')).toHaveTextContent('false');
      expect(screen.getByTestId('effectiveMediaUrl')).toHaveTextContent('empty');
    });

    it('useLightboxVariantsSafe returns defaults outside provider', () => {
      function Consumer() {
        const variants = useLightboxVariantsSafe();
        return (
          <div>
            <span data-testid="variantCount">{variants.variants.length}</span>
            <span data-testid="isLoading">{String(variants.isLoadingVariants)}</span>
            <span data-testid="pendingCount">{variants.pendingTaskCount}</span>
          </div>
        );
      }

      render(<Consumer />);
      expect(screen.getByTestId('variantCount')).toHaveTextContent('0');
      expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      expect(screen.getByTestId('pendingCount')).toHaveTextContent('0');
    });

    it('useLightboxNavigationSafe returns defaults outside provider', () => {
      function Consumer() {
        const nav = useLightboxNavigationSafe();
        return (
          <div>
            <span data-testid="showNav">{String(nav.showNavigation)}</span>
            <span data-testid="hasNext">{String(nav.hasNext)}</span>
            <span data-testid="hasPrev">{String(nav.hasPrevious)}</span>
          </div>
        );
      }

      render(<Consumer />);
      expect(screen.getByTestId('showNav')).toHaveTextContent('false');
      expect(screen.getByTestId('hasNext')).toHaveTextContent('false');
      expect(screen.getByTestId('hasPrev')).toHaveTextContent('false');
    });
  });

  describe('LightboxStateProvider', () => {
    const mockValue = {
      core: {
        onClose: vi.fn(),
        readOnly: false,
        isMobile: true,
        isTabletOrLarger: false,
        selectedProjectId: 'proj-1',
        actualGenerationId: 'gen-1',
      },
      media: {
        media: { id: 'gen-1' } as Record<string, unknown>,
        isVideo: true,
        effectiveMediaUrl: 'https://example.com/media.mp4',
        effectiveVideoUrl: 'https://example.com/video.mp4',
        effectiveImageDimensions: { width: 1920, height: 1080 },
        imageDimensions: { width: 1920, height: 1080 },
        setImageDimensions: vi.fn(),
      },
      variants: {
        variants: [{ id: 'v1' }, { id: 'v2' }],
        activeVariant: { id: 'v1' },
        primaryVariant: { id: 'v1' },
        isLoadingVariants: false,
        handleVariantSelect: vi.fn(),
        handleMakePrimary: vi.fn(),
        handleDeleteVariant: vi.fn(),
        promoteSuccess: false,
        isPromoting: false,
        handlePromoteToGeneration: vi.fn(),
        isMakingMainVariant: false,
        canMakeMainVariant: true,
        handleMakeMainVariant: vi.fn(),
        pendingTaskCount: 3,
        unviewedVariantCount: 1,
        onMarkAllViewed: vi.fn(),
        variantsSectionRef: null,
      },
      navigation: {
        showNavigation: true,
        hasNext: true,
        hasPrevious: false,
        handleSlotNavNext: vi.fn(),
        handleSlotNavPrev: vi.fn(),
        swipeNavigation: {
          swipeHandlers: {},
          isSwiping: false,
          swipeOffset: 0,
        },
      },
    };

    it('renders children', () => {
      render(
        <LightboxStateProvider value={mockValue as never}>
          <div data-testid="child">Hello</div>
        </LightboxStateProvider>
      );

      expect(screen.getByTestId('child')).toHaveTextContent('Hello');
    });

    it('provides core state to consumers', () => {
      function Consumer() {
        const core = useLightboxCoreSafe();
        return (
          <div>
            <span data-testid="readOnly">{String(core.readOnly)}</span>
            <span data-testid="isMobile">{String(core.isMobile)}</span>
            <span data-testid="selectedProjectId">{core.selectedProjectId}</span>
          </div>
        );
      }

      render(
        <LightboxStateProvider value={mockValue as never}>
          <Consumer />
        </LightboxStateProvider>
      );

      expect(screen.getByTestId('readOnly')).toHaveTextContent('false');
      expect(screen.getByTestId('isMobile')).toHaveTextContent('true');
      expect(screen.getByTestId('selectedProjectId')).toHaveTextContent('proj-1');
    });

    it('provides media state to consumers', () => {
      function Consumer() {
        const media = useLightboxMediaSafe();
        return (
          <div>
            <span data-testid="isVideo">{String(media.isVideo)}</span>
            <span data-testid="url">{media.effectiveMediaUrl}</span>
          </div>
        );
      }

      render(
        <LightboxStateProvider value={mockValue as never}>
          <Consumer />
        </LightboxStateProvider>
      );

      expect(screen.getByTestId('isVideo')).toHaveTextContent('true');
      expect(screen.getByTestId('url')).toHaveTextContent('https://example.com/media.mp4');
    });

    it('provides navigation state to consumers', () => {
      function Consumer() {
        const nav = useLightboxNavigationSafe();
        return (
          <div>
            <span data-testid="showNav">{String(nav.showNavigation)}</span>
            <span data-testid="hasNext">{String(nav.hasNext)}</span>
          </div>
        );
      }

      render(
        <LightboxStateProvider value={mockValue as never}>
          <Consumer />
        </LightboxStateProvider>
      );

      expect(screen.getByTestId('showNav')).toHaveTextContent('true');
      expect(screen.getByTestId('hasNext')).toHaveTextContent('true');
    });
  });
});
