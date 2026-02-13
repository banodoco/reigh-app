import { describe, it, expect } from 'vitest';
import { calculateMultiDragOrder } from '../reorder-utils';
import type { GenerationRow } from '@/types/shots';

const makeImage = (id: string): GenerationRow => ({ id } as GenerationRow);

describe('calculateMultiDragOrder', () => {
  const images = [
    makeImage('a'), // 0
    makeImage('b'), // 1
    makeImage('c'), // 2
    makeImage('d'), // 3
    makeImage('e'), // 4
  ];

  describe('dropping on non-selected item', () => {
    it('moves selected items before target when dragging up', () => {
      // Select 'c' (index 2), drag to index 0 (drop on 'a')
      const result = calculateMultiDragOrder(images, ['c'], 2, 0, 'c', 'a');
      const ids = result.map(img => img.id);
      expect(ids).toEqual(['c', 'a', 'b', 'd', 'e']);
    });

    it('moves selected items after target when dragging down', () => {
      // Select 'a' (index 0), drag to index 3 (drop on 'd')
      const result = calculateMultiDragOrder(images, ['a'], 0, 3, 'a', 'd');
      const ids = result.map(img => img.id);
      expect(ids).toEqual(['b', 'c', 'd', 'a', 'e']);
    });

    it('moves multiple selected items together', () => {
      // Select 'a' and 'b' (indices 0, 1), drag to index 4 (drop on 'e')
      const result = calculateMultiDragOrder(images, ['a', 'b'], 0, 4, 'a', 'e');
      const ids = result.map(img => img.id);
      expect(ids).toEqual(['c', 'd', 'e', 'a', 'b']);
    });

    it('preserves order of non-selected items', () => {
      // Select 'c' (index 2), drag to index 1 (drop on 'b')
      const result = calculateMultiDragOrder(images, ['c'], 2, 1, 'c', 'b');
      const ids = result.map(img => img.id);
      expect(ids).toEqual(['a', 'c', 'b', 'd', 'e']);
    });
  });

  describe('dropping on selected item', () => {
    it('handles dropping onto a selected item', () => {
      // Select 'b' and 'c', drop on 'c' (a selected item)
      const result = calculateMultiDragOrder(images, ['b', 'c'], 1, 2, 'b', 'c');
      const ids = result.map(img => img.id);
      // Should maintain selected items as a group
      expect(ids).toContain('b');
      expect(ids).toContain('c');
      // b and c should be adjacent
      const bIdx = ids.indexOf('b');
      const cIdx = ids.indexOf('c');
      expect(Math.abs(bIdx - cIdx)).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('handles single item list', () => {
      const single = [makeImage('a')];
      const result = calculateMultiDragOrder(single, ['a'], 0, 0, 'a', 'a');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a');
    });

    it('handles selecting all items', () => {
      const result = calculateMultiDragOrder(
        images,
        ['a', 'b', 'c', 'd', 'e'],
        0,
        4,
        'a',
        'e'
      );
      expect(result).toHaveLength(5);
    });

    it('preserves total number of items', () => {
      const result = calculateMultiDragOrder(images, ['b', 'd'], 1, 0, 'b', 'a');
      expect(result).toHaveLength(5);
      // All original items should be present
      const ids = result.map(img => img.id).sort();
      expect(ids).toEqual(['a', 'b', 'c', 'd', 'e']);
    });
  });
});
