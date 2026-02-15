/**
 * CurrentShotContext Tests
 *
 * Tests for current shot selection context.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';

import { CurrentShotProvider, useCurrentShot } from '../CurrentShotContext';

// Test consumer component
function CurrentShotConsumer() {
  const { currentShotId, setCurrentShotId } = useCurrentShot();
  return (
    <div>
      <span data-testid="currentShotId">{currentShotId ?? 'null'}</span>
      <button data-testid="setShot" onClick={() => setCurrentShotId('shot-42')}>
        Set Shot
      </button>
      <button data-testid="clearShot" onClick={() => setCurrentShotId(null)}>
        Clear Shot
      </button>
    </div>
  );
}

describe('CurrentShotContext', () => {
  describe('useCurrentShot hook', () => {
    it('throws when used outside CurrentShotProvider', () => {
      function BadConsumer() {
        useCurrentShot();
        return null;
      }

      expect(() => {
        render(<BadConsumer />);
      }).toThrow('useCurrentShot must be used within a CurrentShotProvider');
    });
  });

  describe('CurrentShotProvider', () => {
    it('renders children', () => {
      render(
        <CurrentShotProvider>
          <div data-testid="child">Hello</div>
        </CurrentShotProvider>
      );

      expect(screen.getByTestId('child')).toHaveTextContent('Hello');
    });

    it('starts with null currentShotId', () => {
      render(
        <CurrentShotProvider>
          <CurrentShotConsumer />
        </CurrentShotProvider>
      );

      expect(screen.getByTestId('currentShotId')).toHaveTextContent('null');
    });

    it('allows setting current shot', () => {
      render(
        <CurrentShotProvider>
          <CurrentShotConsumer />
        </CurrentShotProvider>
      );

      act(() => {
        screen.getByTestId('setShot').click();
      });

      expect(screen.getByTestId('currentShotId')).toHaveTextContent('shot-42');
    });

    it('allows clearing current shot', () => {
      render(
        <CurrentShotProvider>
          <CurrentShotConsumer />
        </CurrentShotProvider>
      );

      // Set, then clear
      act(() => {
        screen.getByTestId('setShot').click();
      });
      expect(screen.getByTestId('currentShotId')).toHaveTextContent('shot-42');

      act(() => {
        screen.getByTestId('clearShot').click();
      });
      expect(screen.getByTestId('currentShotId')).toHaveTextContent('null');
    });
  });
});
