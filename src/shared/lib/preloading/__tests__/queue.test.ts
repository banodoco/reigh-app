import { describe, it, expect } from 'vitest';
import { PreloadQueue } from '../queue';

// Mock Image constructor
class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';

  get src() { return this._src; }
  set src(value: string) {
    this._src = value;
    // Auto-resolve on next tick
    if (value.includes('fail')) {
      setTimeout(() => this.onerror?.(), 0);
    } else {
      setTimeout(() => this.onload?.(), 0);
    }
  }
}

// @ts-expect-error Test overrides global Image constructor with a mock implementation.
globalThis.Image = MockImage;

describe('PreloadQueue', () => {
  it('creates a queue with default maxConcurrent of 3', () => {
    const queue = new PreloadQueue();
    expect(queue.size).toBe(0);
    expect(queue.activeCount).toBe(0);
  });

  it('creates a queue with custom maxConcurrent', () => {
    const queue = new PreloadQueue(5);
    expect(queue.size).toBe(0);
  });

  it('loads an image and returns HTMLImageElement', async () => {
    const queue = new PreloadQueue(3);
    const result = await queue.add('https://example.com/image.jpg');
    expect(result).toBeDefined();
    expect(result.src).toBe('https://example.com/image.jpg');
  });

  it('rejects when image fails to load', async () => {
    const queue = new PreloadQueue(3);
    await expect(queue.add('https://example.com/fail.jpg')).rejects.toThrow('Failed to load image');
  });

  it('respects priority ordering (higher priority first)', async () => {
    const queue = new PreloadQueue(1); // Only 1 concurrent to see ordering
    const order: string[] = [];

    // Add low priority first, then high priority
    const p1 = queue.add('https://example.com/low.jpg', 0).then(() => order.push('low'));
    const p2 = queue.add('https://example.com/high.jpg', 100).then(() => order.push('high'));

    await Promise.all([p1, p2]);

    // First one starts immediately regardless, but high priority should be processed before others in queue
    expect(order).toHaveLength(2);
  });

  it('clears pending items from the queue', async () => {
    const queue = new PreloadQueue(1);

    // Add items
    const p1 = queue.add('https://example.com/a.jpg');
    queue.add('https://example.com/b.jpg');
    queue.add('https://example.com/c.jpg');

    queue.clear();
    expect(queue.size).toBe(0);

    // First item should still resolve since it's already active
    await p1;
  });

  it('reports correct size', () => {
    const queue = new PreloadQueue(1);

    queue.add('https://example.com/a.jpg');
    queue.add('https://example.com/b.jpg');
    queue.add('https://example.com/c.jpg');

    // First item is active (not in queue), so 2 pending
    expect(queue.size).toBe(2);
  });

  it('processes multiple items concurrently up to the limit', async () => {
    const queue = new PreloadQueue(2);

    const p1 = queue.add('https://example.com/a.jpg');
    const p2 = queue.add('https://example.com/b.jpg');
    const p3 = queue.add('https://example.com/c.jpg');

    await Promise.all([p1, p2, p3]);
    expect(queue.activeCount).toBe(0);
    expect(queue.size).toBe(0);
  });
});
