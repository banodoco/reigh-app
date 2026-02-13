import { describe, it, expect } from 'vitest';
import { LeftPanePositionStrategy } from '../LeftPaneStrategy';
import type { PanePosition } from '@/shared/config/panes';

describe('LeftPanePositionStrategy', () => {
  const strategy = new LeftPanePositionStrategy();

  it('returns fixed position base style', () => {
    const position: PanePosition = {
      side: 'left',
      dimension: 300,
      offsets: {},
      isVisible: false,
    };
    const style = strategy.getStyle(position);
    expect(style.position).toBe('fixed');
  });

  it('slides in from left when visible', () => {
    const position: PanePosition = {
      side: 'left',
      dimension: 300,
      offsets: { bottom: 0 },
      isVisible: true,
    };
    const style = strategy.getStyle(position);
    expect(style.top).toBe('50dvh');
    expect(style.left).toBe('0px');
    expect(style.transform).toContain('translateX(300px)');
  });

  it('hides off-screen when not visible', () => {
    const position: PanePosition = {
      side: 'left',
      dimension: 300,
      offsets: { bottom: 0 },
      isVisible: false,
    };
    const style = strategy.getStyle(position);
    expect(style.transform).toContain('translateX(0px)');
  });

  it('applies bottom offset for vertical centering', () => {
    const position: PanePosition = {
      side: 'left',
      dimension: 300,
      offsets: { bottom: 100 },
      isVisible: true,
    };
    const style = strategy.getStyle(position);
    expect(style.transform).toContain('translateY(calc(-50% - 50px))');
  });

  it('handles missing bottom offset', () => {
    const position: PanePosition = {
      side: 'left',
      dimension: 300,
      offsets: {},
      isVisible: true,
    };
    const style = strategy.getStyle(position);
    expect(style.transform).toContain('translateY(calc(-50% - 0px))');
  });
});
