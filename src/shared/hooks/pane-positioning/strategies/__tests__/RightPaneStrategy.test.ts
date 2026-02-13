import { describe, it, expect } from 'vitest';
import { RightPanePositionStrategy } from '../RightPaneStrategy';
import type { PanePosition } from '@/shared/config/panes';

describe('RightPanePositionStrategy', () => {
  const strategy = new RightPanePositionStrategy();

  it('returns fixed position base style', () => {
    const position: PanePosition = {
      side: 'right',
      dimension: 300,
      offsets: {},
      isVisible: false,
    };
    const style = strategy.getStyle(position);
    expect(style.position).toBe('fixed');
  });

  it('slides in from right when visible', () => {
    const position: PanePosition = {
      side: 'right',
      dimension: 300,
      offsets: { bottom: 0 },
      isVisible: true,
    };
    const style = strategy.getStyle(position);
    expect(style.top).toBe('50dvh');
    expect(style.right).toBe('0px');
    expect(style.transform).toContain('translateX(-300px)');
  });

  it('hides off-screen when not visible', () => {
    const position: PanePosition = {
      side: 'right',
      dimension: 300,
      offsets: { bottom: 0 },
      isVisible: false,
    };
    const style = strategy.getStyle(position);
    expect(style.transform).toContain('translateX(0px)');
  });

  it('applies bottom offset for vertical centering', () => {
    const position: PanePosition = {
      side: 'right',
      dimension: 300,
      offsets: { bottom: 80 },
      isVisible: true,
    };
    const style = strategy.getStyle(position);
    expect(style.transform).toContain('translateY(calc(-50% - 40px))');
  });

  it('handles missing bottom offset', () => {
    const position: PanePosition = {
      side: 'right',
      dimension: 250,
      offsets: {},
      isVisible: true,
    };
    const style = strategy.getStyle(position);
    expect(style.transform).toContain('translateY(calc(-50% - 0px))');
  });
});
