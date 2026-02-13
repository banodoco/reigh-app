import { describe, it, expect } from 'vitest';
import { BottomPanePositionStrategy } from '../BottomPaneStrategy';
import type { PanePosition } from '@/shared/config/panes';

describe('BottomPanePositionStrategy', () => {
  const strategy = new BottomPanePositionStrategy();

  it('returns fixed position base style', () => {
    const position: PanePosition = {
      side: 'bottom',
      dimension: 350,
      offsets: {},
      isVisible: false,
    };
    const style = strategy.getStyle(position);
    expect(style.position).toBe('fixed');
  });

  it('positions at bottom center when visible', () => {
    const position: PanePosition = {
      side: 'bottom',
      dimension: 350,
      offsets: { horizontal: 0 },
      isVisible: true,
    };
    const style = strategy.getStyle(position);
    expect(style.left).toBe('50%');
    expect(style.bottom).toBe('0px');
    expect(style.transform).toContain('translateY(-350px)');
  });

  it('hides below viewport when not visible', () => {
    const position: PanePosition = {
      side: 'bottom',
      dimension: 350,
      offsets: { horizontal: 0 },
      isVisible: false,
    };
    const style = strategy.getStyle(position);
    expect(style.transform).toContain('translateY(0px)');
  });

  it('applies horizontal offset for asymmetrical panes', () => {
    const position: PanePosition = {
      side: 'bottom',
      dimension: 350,
      offsets: { horizontal: 100 },
      isVisible: true,
    };
    const style = strategy.getStyle(position);
    expect(style.transform).toContain('translateX(50px)');
  });

  it('handles missing horizontal offset', () => {
    const position: PanePosition = {
      side: 'bottom',
      dimension: 200,
      offsets: {},
      isVisible: true,
    };
    const style = strategy.getStyle(position);
    expect(style.transform).toContain('translateX(0px)');
  });
});
