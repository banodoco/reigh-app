import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { useLastAffectedShot } from '@/shared/hooks/shots/useLastAffectedShot';
import { LastAffectedShotContext } from '@/shared/contexts/LastAffectedShotContext';

describe('useLastAffectedShot', () => {
  it('returns context value when used within provider', () => {
    const contextValue = {
      lastAffectedShotId: 'shot-123',
      setLastAffectedShotId: () => {},
    };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        LastAffectedShotContext.Provider,
        { value: contextValue },
        children
      );

    const { result } = renderHook(() => useLastAffectedShot(), { wrapper });
    expect(result.current.lastAffectedShotId).toBe('shot-123');
  });

  it('throws when used outside of provider', () => {
    // Provide undefined context by explicitly setting value to undefined
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        LastAffectedShotContext.Provider,
        { value: undefined as unknown as { lastAffectedShotId: string | null; setLastAffectedShotId: (id: string) => void } },
        children
      );

    expect(() => {
      renderHook(() => useLastAffectedShot(), { wrapper });
    }).toThrow('useLastAffectedShot must be used within a LastAffectedShotProvider');
  });
});
