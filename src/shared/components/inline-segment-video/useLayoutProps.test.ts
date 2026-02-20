import { describe, expect, it } from 'vitest';
import { useLayoutProps } from './useLayoutProps';

describe('useLayoutProps', () => {
  it('omits absolute style when percentages are missing', () => {
    const result = useLayoutProps('absolute', false, false, undefined, undefined);

    expect(result.adjustedPositionStyle).toBeUndefined();
  });

  it('builds absolute positioning when percentages are provided', () => {
    const result = useLayoutProps('absolute', false, false, 10, 40);

    expect(result.adjustedPositionStyle).toMatchObject({
      left: 'calc(10% + 2px)',
      width: 'calc(40% - 4px)',
      top: 0,
      bottom: 0,
      position: 'absolute',
    });
  });
});
